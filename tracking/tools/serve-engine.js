#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/serve-engine.js . THE ENGINE, AND ITS CHANNEL TO DRIVE
//   node tools/serve-engine.js [port]
//
// Serves engines/skf AND proxies /gs?... to the project's Apps Script.
//
// WHY A PROXY AND NOT A DIRECT CALL
//   An Apps Script web app answers with no access-control-allow-origin
//   header and redirects to script.googleusercontent.com on the way. A
//   browser on localhost therefore cannot call it at all . the request
//   fails before the script is even reached, which reads as "Failed to
//   fetch" and looks like the script is broken when it is fine.
//   The tracking engine never hit this because ITS page is served BY
//   Apps Script, so it is same-origin.
//   Here the browser only ever talks to localhost, and localhost talks
//   to Google. No CORS involved, nothing to deploy to make it work.
//
// WHAT IT WILL NOT DO
//   It forwards query parameters and nothing else . no bodies, no
//   headers, no cookies. A proxy that quietly forwards more than it says
//   is a security hole, and this one has to be readable in one sitting.
// ===================================================================
const http = require("http"), https = require("https"), fs = require("fs"),
      path = require("path"), url = require("url");

const PORT = Number(process.argv[2] || 8901);
const ROOT = path.join(__dirname, "../engines/skf");
const EXEC = process.env.DNB_EXEC ||
  "https://script.google.com/macros/s/AKfycbxHhtS4dnl_tzPO-VqX_nk90_J4ewTxOKf-c_Xhak_jF_S_bVAIhr1X4DvoxnZ1UWq3Gw/exec";

const JH = { "content-type": "application/json", "access-control-allow-origin": "*" };

// ---- WHERE THE PROJECT'S DOCUMENTS AND PHOTOGRAPHS LIVE ------------------
// The pin photographs, the 3D renders and the source documents are ~1.6 GB and
// include a signed client agreement, the client POs and a BOQ carrying our own
// cost beside the client price. This repository is public, so that folder is
// NOT in it — the engine is told where to find it instead.
//
// Resolution order, first one that exists wins:
//   1. DNBOS_PROJECT_DIR         explicit, for a machine that keeps it elsewhere
//   2. facts.json .folder        what the last ingest actually read
//   3. ../projects/<name>        a copy sitting beside the repo
//
// Everything still SERVES without it. /pinshots returns an empty index and the
// pair boxes say there is no render and no photograph, which is true, rather
// than showing a broken image and letting the reader guess why.
function lastFolder(){
  const tried = [];
  const ok = (p) => { if (!p) return false; tried.push(p); return fs.existsSync(p); };

  if (ok(process.env.DNBOS_PROJECT_DIR)) return path.resolve(process.env.DNBOS_PROJECT_DIR);

  let fromFacts = "";
  try { fromFacts = JSON.parse(fs.readFileSync(path.join(ROOT, "facts.json"), "utf8")).folder || ""; }
  catch (e) {}
  if (ok(fromFacts)) return path.resolve(fromFacts);

  // a sibling checkout: <repo>/../DnB_OS_PlanningEngine/projects/<same leaf>
  const leaf = fromFacts ? path.basename(fromFacts) : "skf-pune-7f";
  const sibling = path.resolve(__dirname, "../../..", "DnB_OS_PlanningEngine/projects", leaf);
  if (ok(sibling)) return sibling;

  if (!lastFolder._warned) {
    lastFolder._warned = true;
    console.warn("\n  no project document folder found — pins and renders will be empty.");
    console.warn("  looked in:\n    " + tried.join("\n    "));
    console.warn("  set DNBOS_PROJECT_DIR to the folder holding '13 Site Tracking'.\n");
  }
  return fromFacts || "";
}

const MIME = { ".html": "text/html; charset=utf-8", ".json": "application/json",
  ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };

// follow Apps Script's redirect to googleusercontent, up to a few hops
function pull(target, hops, cb0) {
  // ONCE. A stream can emit 'error' after 'end' (a socket reset on a
  // response already delivered), and calling back twice made the server
  // write headers twice and die . taking the whole engine down with it.
  let done = false;
  const cb = (e, v) => { if (done) return; done = true; cb0(e, v); };
  if (hops > 5) return cb(new Error("too many redirects"));
  const req = https.get(target, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      r.resume();
      return pull(r.headers.location, hops + 1, cb);
    }
    let b = "";
    r.on("data", d => b += d);
    r.on("end", () => cb(null, { status: r.statusCode, body: b,
      type: r.headers["content-type"] || "application/json" }));
    r.on("error", e => cb(e));
  });
  req.on("error", e => cb(e));
  req.setTimeout(20000, () => { req.destroy(); cb(new Error("the script did not answer within 20 seconds")); });
}

http.createServer((req, res) => {
  const u = url.parse(req.url, true);

  // ---- the channel -----------------------------------------------------
  if (u.pathname === "/gs") {
    const q = Object.entries(u.query)
      .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
    pull(EXEC + (q ? "?" + q : ""), 0, (err, out) => {
      res.setHeader("access-control-allow-origin", "*");
      if (err) { res.writeHead(502, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: "the channel could not reach the script: " + err.message })); }
      // Apps Script answers text/html for a JSON payload; hand it on as JSON
      // when it parses as JSON, and say so plainly when it does not.
      let body = out.body, type = "application/json";
      try { JSON.parse(body); }
      catch (e) {
        // an HTML page here almost always means the deployment needs a login
        const login = /accounts\.google\.com|Sign in|authorization/i.test(body);
        body = JSON.stringify({ ok: false, notJson: true, status: out.status,
          error: login
            ? "the script answered with a Google sign-in page — the deployment is not set to 'Anyone', so it is asking a browser to log in"
            : "the script answered with something that is not JSON (" + out.status + ")",
          head: String(out.body).slice(0, 240) });
      }
      res.writeHead(200, { "content-type": type });
      res.end(body);
    });
    return;
  }

  // ---- THE SYNC STORE: ONE TRUTH FOR TWO APPS ---------------------------
  // The planning engine authors a programme; this engine tracks it. Until now
  // each held its own copy of the schedule, the manpower, the procurement and
  // the design, computed by different code from different inputs, and the two
  // could disagree with nobody able to say which was right.
  //
  // This is the one place the two meet. It holds, per project:
  //   . MODULES  what the planning engine computed. It owns these outright.
  //   . EDITS    what a person changed afterwards, from either app, as a
  //              sparse overlay of rowId -> field -> value.
  //
  // THE LAW THAT MAKES TWO WRITERS SAFE: the two halves are never written
  // together. A plan push replaces the modules and does not touch the edits;
  // an edit push merges the overlay and does not touch the modules. Without
  // that split, whichever app saved last would silently erase the other's
  // work — a re-plan would wipe every correction the site had made, or a
  // typo fixed on site would pin the whole programme to a stale computation.
  if (u.pathname.indexOf("/sync/") === 0) {
    // a browser on the planning engine's origin preflights a JSON POST
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    const SYNC_DIR = path.join(ROOT, "sync");
    // a project id becomes a file name, so it may not become a path
    const pid = String(u.query.project || "").trim().replace(/[^A-Za-z0-9._-]/g, "");
    const file = pid ? path.join(SYNC_DIR, pid + ".json") : null;
    const empty = () => ({ schema: 1, project: { id: pid }, modules: null,
      pushedAt: null, pushedBy: null, edits: {}, editsAt: null, editsBy: null, rev: 0 });
    const readState = () => {
      try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return empty(); }
    };
    // written through a temp file and renamed, because a half-written state is
    // indistinguishable from a corrupt one to whichever app reads it next
    const writeState = (s) => {
      fs.mkdirSync(SYNC_DIR, { recursive: true });
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(s, null, 1));
      fs.renameSync(tmp, file);
    };
    const body = (cb) => {
      let b = ""; req.on("data", d => { b += d; if (b.length > 24e6) req.destroy(); });
      req.on("end", () => { try { cb(null, JSON.parse(b || "{}")); } catch (e) { cb(e); } });
      req.on("error", e => cb(e));
    };

    // Every project the planning engine has pushed. The name is read out of each
    // file rather than inferred from its id, because an id is a key and a name is
    // what a person recognises — a list of slugs is not a list of projects.
    if (u.pathname === "/sync/projects") {
      let out = [];
      try {
        out = fs.readdirSync(SYNC_DIR).filter(n => /\.json$/.test(n)).map(n => {
          const id = n.replace(/\.json$/, "");
          try {
            const s = JSON.parse(fs.readFileSync(path.join(SYNC_DIR, n), "utf8"));
            return { id, name: (s.project && s.project.name) || id, pushedAt: s.pushedAt || null,
              edits: Object.keys(s.edits || {}).length };
          } catch (e) { return { id, name: id, pushedAt: null, edits: 0 }; }
        });
      } catch (e) {}
      res.writeHead(200, JH); return res.end(JSON.stringify({ ok: true, projects: out }));
    }

    if (!pid) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok: false, error: "which project?" })); }

    if (u.pathname === "/sync/state" && req.method === "GET") {
      const s = readState();
      res.writeHead(200, JH);
      return res.end(JSON.stringify({ ok: true, ...s }));
    }

    if (u.pathname === "/sync/plan" && req.method === "POST") {
      return body((err, b) => {
        if (err) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok: false, error: "that was not JSON" })); }
        const s = readState();
        s.schema = 1;
        s.project = b.project || s.project || { id: pid };
        s.modules = b.modules || null;          // the planning engine owns these outright
        s.pushedAt = new Date().toISOString();
        s.pushedBy = String(b.by || "planning-engine");
        s.rev = (s.rev || 0) + 1;
        // s.edits deliberately untouched — see the law above
        try { writeState(s); } catch (e) {
          res.writeHead(500, JH); return res.end(JSON.stringify({ ok: false, error: "could not save: " + e.message })); }
        res.writeHead(200, JH);
        res.end(JSON.stringify({ ok: true, rev: s.rev, pushedAt: s.pushedAt, edits: s.edits }));
      });
    }

    if (u.pathname === "/sync/edits" && req.method === "POST") {
      return body((err, b) => {
        if (err) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok: false, error: "that was not JSON" })); }
        const s = readState();
        const incoming = (b && b.edits) || {};
        if (b && b.replace) s.edits = {};        // an explicit clear, used by "revert to plan"
        s.edits = s.edits || {};
        for (const rowId of Object.keys(incoming)) {
          const row = incoming[rowId];
          if (row === null) { delete s.edits[rowId]; continue; }   // null clears one row
          s.edits[rowId] = Object.assign({}, s.edits[rowId] || {}, row);
          // a field set to null is a field returned to whatever the plan says
          for (const f of Object.keys(s.edits[rowId])) if (s.edits[rowId][f] === null) delete s.edits[rowId][f];
          if (!Object.keys(s.edits[rowId]).length) delete s.edits[rowId];
        }
        s.editsAt = new Date().toISOString();
        s.editsBy = String(b.by || "unknown");
        s.rev = (s.rev || 0) + 1;
        try { writeState(s); } catch (e) {
          res.writeHead(500, JH); return res.end(JSON.stringify({ ok: false, error: "could not save: " + e.message })); }
        res.writeHead(200, JH);
        res.end(JSON.stringify({ ok: true, rev: s.rev, edits: s.edits, editsAt: s.editsAt }));
      });
    }

    res.writeHead(404, JH);
    return res.end(JSON.stringify({ ok: false, error: "no such sync route: " + u.pathname }));
  }

  // ---- put a document INTO the project folder ---------------------------
  // The engine reads a folder; this is how a file gets into it without
  // leaving the app. Written to the same folder the ingest walks, so the
  // very next read picks it up . there is no second copy anywhere.
  if (u.pathname === "/upload" && req.method === "POST") {
    const name = path.basename(String(u.query.name || "")).replace(/[^\w.\- ]+/g, "_");
    const folder = lastFolder();
    if (!name)   { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"the upload has no filename" })); }
    if (!folder) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"no project folder is known yet" })); }
    const ext = path.extname(name).toLowerCase();
    // only what a reader exists for . accepting a file the engine cannot
    // open just moves the disappointment later
    // the deterministic readers, plus what Claude can open
    const OK = [".dxf", ".xlsx", ".xlsm", ".xls", ".csv", ".tsv",
                ".pdf", ".docx", ".doc", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp"];
    if (OK.indexOf(ext) === -1) {
      res.writeHead(415, JH);
      return res.end(JSON.stringify({ ok:false,
        error:"no reader exists for " + (ext || "a file with no extension") + " yet — the engine reads " + OK.join(", ") }));
    }
    const dest = path.join(folder, name);
    const out = fs.createWriteStream(dest);
    let bytes = 0;
    req.on("data", d => { bytes += d.length; });
    req.pipe(out);
    out.on("finish", () => {
      res.writeHead(200, JH);
      res.end(JSON.stringify({ ok:true, name, bytes, folder,
        note: bytes ? null : "the file arrived empty" }));
    });
    out.on("error", e => { res.writeHead(500, JH);
      res.end(JSON.stringify({ ok:false, error:"could not write it: " + e.message })); });
    return;
  }

  // ---- read one input's documents, on demand ---------------------------
  if (u.pathname === "/read") {
    const pat = String(u.query.pat || "").trim();
    const folder = String(u.query.folder || "").trim() || lastFolder();
    if (!pat)    { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"which input?" })); }
    if (!folder) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"no project folder is known yet" })); }
    const { execFile } = require("child_process");
    execFile(process.execPath,
      [path.join(__dirname, "ingest.js"), folder, "--only", pat],
      { timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
      (err, out, errOut) => {
        res.writeHead(200, JH);
        if (err && !out) return res.end(JSON.stringify({ ok:false,
          error: err.killed ? "that document took longer than three minutes to read" : String(err.message || err),
          log: String(errOut || "").slice(0, 400) }));
        // hand back what it actually got, so the box can say it
        const read = String(out).split("\n").filter(l => /·/.test(l)).map(l => l.trim());
        const none = /^0 facts/m.test(out) || !read.length;
        res.end(JSON.stringify({ ok:true, pattern:pat, read,
          nothing: none, tail: String(out).trim().split("\n").slice(-3).join(" · ") }));
      });
    return;
  }

  // ---- names a person has settled --------------------------------------
  // The engine proposes; a person decides; this is where the decision lands.
  // It rebuilds the register immediately so the answer to "what did that
  // change" is on screen rather than on the next run.
  if (u.pathname === "/names" && req.method === "POST") {
    let body = "";
    req.on("data", d => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      let names; try { names = JSON.parse(body); }
      catch (e) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"that was not JSON" })); }
      if (!names || typeof names !== "object" || Array.isArray(names)) {
        res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"expected { areaId: name }" })); }
      try { fs.writeFileSync(path.join(ROOT, "area_names.json"), JSON.stringify(names, null, 1)); }
      catch (e) { res.writeHead(500, JH); return res.end(JSON.stringify({ ok:false, error:"could not save: " + e.message })); }
      const { execFile } = require("child_process");
      execFile(process.execPath, [path.join(__dirname, "areas.js")], { timeout: 60000 }, (err, out) => {
        res.writeHead(200, JH);
        if (err) return res.end(JSON.stringify({ ok:false, error:"saved, but the register would not rebuild: " + err.message }));
        let reg = null; try { reg = JSON.parse(fs.readFileSync(path.join(ROOT, "areas.json"), "utf8")); } catch (e) {}
        res.end(JSON.stringify({ ok:true, saved:Object.keys(names).length,
          counts: reg && reg.counts, refused: (reg && reg.refusedNames) || [] }));
      });
    });
    return;
  }

  // ---- columns a person has settled ------------------------------------
  // Saved by document and sheet, then the whole chain is rebuilt: the read,
  // the areas, the plan. The point of settling a column is to see what it
  // changed, and asking somebody to run three commands to find out is how a
  // decision stops being worth making.
  if (u.pathname === "/columns" && req.method === "POST") {
    let body = "";
    req.on("data", d => { body += d; if (body.length > 2e6) req.destroy(); });
    req.on("end", () => {
      let m; try { m = JSON.parse(body); }
      catch (e) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"that was not JSON" })); }
      if (!m || typeof m !== "object" || Array.isArray(m)) {
        res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"expected { doc: { sheet: { COL: role } } }" })); }
      const file = path.join(ROOT, "column_map.json");
      let prior = {}; try { prior = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {}
      for (const doc of Object.keys(m)) {
        prior[doc] = prior[doc] || {};
        for (const sh of Object.keys(m[doc])) prior[doc][sh] = Object.assign(prior[doc][sh] || {}, m[doc][sh]);
      }
      try { fs.writeFileSync(file, JSON.stringify(prior, null, 1)); }
      catch (e) { res.writeHead(500, JH); return res.end(JSON.stringify({ ok:false, error:"could not save: " + e.message })); }
      const folder = lastFolder();
      const { execFile } = require("child_process");
      const run = (script, extra, next) => execFile(process.execPath,
        [path.join(__dirname, script)].concat(extra || []), { timeout: 600000, maxBuffer: 32 * 1024 * 1024 }, next);
      run("ingest.js", [folder, "--no-claude"], (e1) => {
        if (e1) { res.writeHead(200, JH); return res.end(JSON.stringify({ ok:false, error:"saved, but the read failed: " + e1.message })); }
        run("areas.js", [], () => run("plan.js", [], (e3) => {
          let facts = null, plan = null;
          try { facts = JSON.parse(fs.readFileSync(path.join(ROOT, "facts.json"), "utf8")); } catch (e) {}
          try { plan  = JSON.parse(fs.readFileSync(path.join(ROOT, "plan.json"),  "utf8")); } catch (e) {}
          res.writeHead(200, JH);
          res.end(JSON.stringify({ ok:true, settled: Object.keys(m).length,
            facts: facts && facts.facts.length, left: facts && facts.confirm.length,
            planError: e3 ? String(e3.message).slice(0, 200) : null,
            finish: plan && plan.manpower && plan.manpower.recommend
              ? (plan.manpower.rows.find(r => r.fronts === plan.manpower.recommend.fronts) || {}).projectEnd : null }));
        }));
      });
    });
    return;
  }

  // ---- counts a person has done, room by room --------------------------
  // ---- A PERSON ANSWERS THE ENGINE ------------------------------------
  // Everywhere the engine has inferred a figure rather than read one, the
  // screen says so and offers this. What comes back outranks the camera and
  // the inference both, for good, and the programme is rebuilt against it.
  // which basis the completion figure is weighted on — see core/weight.js
  // ---- A DAILY PROGRESS REPORT, PASTED --------------------------------
  // ---- hold a meeting, or decide a point ---------------------------------
  // A MEETING WITH NO OBSERVATIONS IS NOT MINUTES, and a point is closed by
  // a decision with a date, never by falling off a list.
  if (u.pathname === "/minutes" && req.method === "POST") {
    let body = "";
    req.on("data", d => { body += d; if (body.length > 2e6) req.destroy(); });
    req.on("end", () => {
      let m = {}; try { m = JSON.parse(body); }
      catch (e) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"that was not JSON" })); }
      const MIN = require(path.join(__dirname, "../platform/kb/minutes.js"));
      const f = path.join(ROOT, "minutes-held.json");
      let rows = []; try { rows = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
      const today = new Date().toISOString().slice(0, 10);
      const done = (payload) => { try { fs.writeFileSync(f, JSON.stringify(rows, null, 1)); }
        catch (e) { res.writeHead(500, JH); return res.end(JSON.stringify({ ok:false, error:e.message })); }
        require("child_process").execFile(process.execPath,
          [path.join(__dirname, "minutes.js")], { timeout: 120000, maxBuffer: 32*1024*1024 }, (err) => {
            res.writeHead(200, JH);
            res.end(JSON.stringify(Object.assign({ ok: !err }, payload,
              err ? { error: String(err.message).slice(0, 200) } : {}))); }); };

      if (m.remove) {
        const i = rows.findIndex(r => r.id === m.remove);
        if (i < 0) { res.writeHead(200, JH);
          return res.end(JSON.stringify({ ok:false, error:"no meeting with that id" })); }
        rows.splice(i, 1); return done({ removed: m.remove });
      }
      // A DECISION CLOSES A POINT. It needs a date and what was decided.
      if (m.decide) {
        if (!m.decision || !String(m.decision).trim()) { res.writeHead(200, JH);
          return res.end(JSON.stringify({ ok:false,
            error:"a point is closed by a decision. Say what was decided" })); }
        const at = rows.slice().sort((a, b) => a.date < b.date ? 1 : -1)[0];
        if (!at) { res.writeHead(200, JH);
          return res.end(JSON.stringify({ ok:false, error:"no meeting to record it at" })); }
        at.closed = at.closed || [];
        const prev = at.closed.findIndex(c => c.id === m.decide);
        const rec = { id: m.decide, on: m.on || today,
          decision: String(m.decision).trim(), by: m.by || "site" };
        if (prev >= 0) at.closed[prev] = rec; else at.closed.push(rec);
        return done({ closed: m.decide });
      }
      // a new meeting
      const meeting = { id: "M" + String(rows.length + 1).padStart(3, "0"),
        date: m.date || today,
        room: Array.isArray(m.room) ? m.room.filter(Boolean)
              : String(m.room || "").split(/[,;]+/).map(x => x.trim()).filter(Boolean),
        subject: m.subject || null,
        observations: (m.observations || []).filter(o => o && String(o.text || "").trim()),
        closed: [], by: m.by || "site", at: new Date().toISOString() };
      const bad = MIN.faults(meeting, today);
      if (bad.length) { res.writeHead(200, JH);
        return res.end(JSON.stringify({ ok:false, error: bad.join(", ") })); }
      rows.push(meeting);
      return done({ id: meeting.id, points: meeting.observations.length });
    });
    return;
  }

  // ---- lodge a close-out document ----------------------------------------
  // NOTHING IS LODGED WITHOUT A DATE AND A NAME. Same gate as the snag
  // register: a document filed by nobody on no date is not filed.
  if (u.pathname === "/dossier" && req.method === "POST") {
    let body = "";
    req.on("data", d => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      let m = {}; try { m = JSON.parse(body); }
      catch (e) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"that was not JSON" })); }
      if (!m.key) { res.writeHead(400, JH);
        return res.end(JSON.stringify({ ok:false, error:"which item?" })); }
      const f = path.join(ROOT, "dossier-filed.json");
      let rows = []; try { rows = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
      const i = rows.findIndex(r => r.key === m.key);
      if (m.clear) {
        if (i < 0) { res.writeHead(200, JH);
          return res.end(JSON.stringify({ ok:false, error:"nothing filed against " + m.key })); }
        rows.splice(i, 1);
      } else {
        if (!m.on || !m.by) { res.writeHead(200, JH);
          return res.end(JSON.stringify({ ok:false,
            error:"a document is lodged on a date, by somebody. Both are needed" })); }
        const row = { key: m.key, on: m.on, by: m.by, what: m.what || null, note: m.note || null,
          at: new Date().toISOString() };
        if (i >= 0) rows[i] = row; else rows.push(row);
      }
      try { fs.writeFileSync(f, JSON.stringify(rows, null, 1)); }
      catch (e) { res.writeHead(500, JH); return res.end(JSON.stringify({ ok:false, error:e.message })); }
      require("child_process").execFile(process.execPath,
        [path.join(__dirname, "dossier.js")], { timeout: 120000, maxBuffer: 32*1024*1024 }, (err) => {
          res.writeHead(200, JH);
          res.end(JSON.stringify({ ok: !err, key: m.key,
            error: err ? String(err.message).slice(0,200) : null })); });
    });
    return;
  }

  // ---- raised, certified, collected --------------------------------------
  // THREE DIFFERENT THINGS and nothing here collapses them. A bill raised is
  // not money; a bill certified is not money either. Each carries its own
  // date and its own amount.
  if (u.pathname === "/bill" && req.method === "POST") {
    let body = "";
    req.on("data", d => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      let m = {}; try { m = JSON.parse(body); }
      catch (e) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"that was not JSON" })); }
      if (!m.key || !/^RA[1-6]$/.test(m.key)) { res.writeHead(400, JH);
        return res.end(JSON.stringify({ ok:false, error:"which RA stage? RA1 to RA6" })); }
      const f = path.join(ROOT, "billing-raised.json");
      let rows = []; try { rows = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
      const i = rows.findIndex(r => r.key === m.key);
      if (m.clear) {
        if (i < 0) { res.writeHead(200, JH);
          return res.end(JSON.stringify({ ok:false, error:"nothing on record for " + m.key })); }
        rows.splice(i, 1);
      } else {
        // A CERTIFICATION WITHOUT A BILL IS NOT A CERTIFICATION.
        const prior = i >= 0 ? rows[i] : { key: m.key };
        const next = Object.assign({}, prior);
        ["raisedOn","raisedAmount","certifiedOn","certifiedAmount",
         "collectedOn","collectedAmount","note"].forEach(k => {
          if (m[k] !== undefined) next[k] = m[k] === "" ? null : m[k]; });
        if (next.certifiedOn && !next.raisedOn) { res.writeHead(200, JH);
          return res.end(JSON.stringify({ ok:false,
            error:"a bill cannot be certified before it was raised" })); }
        if (next.collectedOn && !next.certifiedOn) { res.writeHead(200, JH);
          return res.end(JSON.stringify({ ok:false,
            error:"money cannot be collected against a bill nobody certified" })); }
        next.by = m.by || "site"; next.at = new Date().toISOString();
        if (i >= 0) rows[i] = next; else rows.push(next);
      }
      try { fs.writeFileSync(f, JSON.stringify(rows, null, 1)); }
      catch (e) { res.writeHead(500, JH); return res.end(JSON.stringify({ ok:false, error:e.message })); }
      require("child_process").execFile(process.execPath,
        [path.join(__dirname, "billing.js")], { timeout: 120000, maxBuffer: 32*1024*1024 }, (err) => {
          res.writeHead(200, JH);
          res.end(JSON.stringify({ ok: !err, key: m.key,
            error: err ? String(err.message).slice(0,200) : null })); });
    });
    return;
  }

  // ---- raise a defect, own it, close it ----------------------------------
  // NO PROOF, NO CLOSURE. The gate lives in platform/kb/snag.js and this
  // endpoint has no way round it — a close with no dated proof is refused
  // here and, if one ever got onto the file another way, the register
  // reopens it on the next build.
  if (u.pathname === "/snag" && req.method === "POST") {
    let body = "";
    req.on("data", d => { body += d; if (body.length > 2e6) req.destroy(); });
    req.on("end", () => {
      let m = {}; try { m = JSON.parse(body); }
      catch (e) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"that was not JSON" })); }
      const SNAG = require(path.join(__dirname, "../platform/kb/snag.js"));
      const f = path.join(ROOT, "snags-raised.json");
      let rows = []; try { rows = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
      const today = new Date().toISOString().slice(0, 10);
      const done = (payload) => { try { fs.writeFileSync(f, JSON.stringify(rows, null, 1)); }
        catch (e) { res.writeHead(500, JH); return res.end(JSON.stringify({ ok:false, error:e.message })); }
        require("child_process").execFile(process.execPath,
          [path.join(__dirname, "snags.js")], { timeout: 120000, maxBuffer: 32*1024*1024 }, (err) => {
            res.writeHead(200, JH);
            res.end(JSON.stringify(Object.assign({ ok: !err }, payload,
              err ? { error: String(err.message).slice(0, 200) } : {}))); }); };

      if (m.remove) {
        const i = rows.findIndex(r => r.id === m.remove);
        if (i < 0) { res.writeHead(200, JH);
          return res.end(JSON.stringify({ ok:false, error:"no defect with that id" })); }
        rows.splice(i, 1); return done({ removed: m.remove });
      }
      if (m.id) {                                     // change one already raised
        const r = rows.find(x => x.id === m.id);
        if (!r) { res.writeHead(200, JH);
          return res.end(JSON.stringify({ ok:false, error:"no defect with that id" })); }
        if (m.state === "closed") {
          const proof = m.proof || r.proof;
          const test = SNAG.canClose(Object.assign({}, r, { proof }));
          if (!test.ok) { res.writeHead(200, JH);
            return res.end(JSON.stringify({ ok:false, error: test.why })); }
          r.proof = proof; r.state = "closed"; r.closedOn = m.closedOn || today;
          r.closedBy = m.by || "site";
        } else {
          ["what","side","owner","sev","due","state","area","pin","pkg"].forEach(k => {
            if (m[k] !== undefined) r[k] = m[k]; });
        }
        r.at = new Date().toISOString();
        return done({ id: r.id });
      }
      // a new one
      const row = { id: "S" + String(Date.now()).slice(-8),
        raised: m.raised || today, by: m.by || "site",
        what: m.what || "", side: m.side || "us", sev: m.sev || "med",
        area: m.area || null, pin: m.pin == null ? null : Number(m.pin),
        pkg: m.pkg || null, owner: m.owner || null, due: m.due || null,
        state: "open", proof: null, at: new Date().toISOString() };
      const bad = SNAG.faults(row);
      if (bad.length) { res.writeHead(200, JH);
        return res.end(JSON.stringify({ ok:false, error: bad.join(", ") })); }
      rows.push(row);
      return done({ id: row.id, raised: row.raised });
    });
    return;
  }

  // ---- has this been bought, and when does it land -----------------------
  // Nothing on this log can answer that. No purchase order, no delivery
  // note. So the only way the material plan stops guessing is somebody
  // saying, and this is where they say it. A landing date settles a row; a
  // bare "it's ordered" does not, and the engine keeps asking.
  if (u.pathname === "/order" && req.method === "POST") {
    let body = "";
    req.on("data", d => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      let m = {}; try { m = JSON.parse(body); }
      catch (e) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"that was not JSON" })); }
      if (!m.code) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"which package?" })); }
      const f = path.join(ROOT, "orders.json");
      let prior = {}; try { prior = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
      // A DELETE THAT DELETED NOTHING IS NOT A SUCCESS. Answering "cleared"
      // over a code that was never on record leaves the caller certain an
      // answer is gone while it is still on the file.
      if (m.clear) {
        if (!prior[m.code]) { res.writeHead(200, JH);
          return res.end(JSON.stringify({ ok: false, cleared: null,
            error: "nothing on record for " + m.code })); }
        delete prior[m.code];
      }
      else prior[m.code] = { code: m.code,
        // WHAT A PERSON SAYS IT IS. Overrules whatever the engine called.
        state: m.state || null,
        ordered: m.ordered === true || !!m.orderedOn,
        orderedOn: m.orderedOn || null,
        landsOn: m.landsOn || null,
        note: m.note || null,
        by: m.by || "site", at: new Date().toISOString() };
      try { fs.writeFileSync(f, JSON.stringify(prior, null, 1)); }
      catch (e) { res.writeHead(500, JH); return res.end(JSON.stringify({ ok:false, error:e.message })); }
      require("child_process").execFile(process.execPath,
        [path.join(__dirname, "resources.js")], { timeout: 120000, maxBuffer: 32*1024*1024 }, (err) => {
          res.writeHead(200, JH);
          res.end(JSON.stringify({ ok: !err, code: m.code, said: prior[m.code] || null,
            error: err ? String(err.message).slice(0,200) : null }));
        });
    });
    return;
  }

  // The walk cannot count people. A DPR can, every day, and until now that
  // number lived in a PDF nobody fed to anything. Paste it and the plan
  // curve finally has something to be measured against.
  if (u.pathname === "/dpr" && req.method === "POST") {
    let body = "";
    req.on("data", d => { body += d; if (body.length > 2e6) req.destroy(); });
    req.on("end", () => {
      let m = {}; try { m = JSON.parse(body); }
      catch (e) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"that was not JSON" })); }
      const DPR = require(path.join(__dirname, "../platform/kb/dpr.js"));
      if (m.clear) {
        const f = path.join(ROOT, "dpr.json");
        let prior = {}; try { prior = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
        // A DELETE THAT DELETED NOTHING IS NOT A SUCCESS. Saying "cleared"
        // over a day that was never held leaves the caller certain a number
        // is gone while it is still on the file.
        const days = m.clear === "all" ? Object.keys(prior)
                   : (prior[String(m.clear)] ? [String(m.clear)] : []);
        if (!days.length) { res.writeHead(200, JH);
          return res.end(JSON.stringify({ ok: false, cleared: [],
            error: "no report on file for " + m.clear })); }
        days.forEach(d => delete prior[d]);
        try { fs.writeFileSync(f, JSON.stringify(prior, null, 1)); }
        catch (e) { res.writeHead(500, JH); return res.end(JSON.stringify({ ok:false, error:e.message })); }
        return require("child_process").execFile(process.execPath,
          [path.join(__dirname, "manpower.js")], { timeout: 120000, maxBuffer: 32*1024*1024 }, (err) => {
            res.writeHead(200, JH); res.end(JSON.stringify({ ok: !err, cleared: days,
              days: Object.keys(prior).length })); });
      }
      const r = DPR.parse(m.text || "", { day: m.day || null });
      if (!r.ok) { res.writeHead(200, JH); return res.end(JSON.stringify({ ok:false, ...r })); }
      const f = path.join(ROOT, "dpr.json");
      let prior = {}; try { prior = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
      prior[r.day] = { day: r.day, byTrade: r.byTrade, total: r.total,
        unplaced: r.unplaced, unknown: r.unknown, stated: r.stated,
        disagrees: r.disagrees, rows: r.rows.length, pastedAt: new Date().toISOString() };
      try { fs.writeFileSync(f, JSON.stringify(prior, null, 1)); }
      catch (e) { res.writeHead(500, JH); return res.end(JSON.stringify({ ok:false, error:e.message })); }
      require("child_process").execFile(process.execPath,
        [path.join(__dirname, "manpower.js")], { timeout: 120000, maxBuffer: 32*1024*1024 }, (err) => {
          res.writeHead(200, JH);
          res.end(JSON.stringify({ ok: !err, ...r, days: Object.keys(prior).length,
            error: err ? String(err.message).slice(0,200) : null }));
        });
    });
    return;
  }

  if (u.pathname === "/basis" && req.method === "POST") {
    let body = "";
    req.on("data", d => { body += d; if (body.length > 1e5) req.destroy(); });
    req.on("end", () => {
      let m = {}; try { m = JSON.parse(body); } catch (e) {}
      const basis = m.basis === "effort" ? "effort" : "value";
      const f = path.join(ROOT, "settled.json");
      let st = {}; try { st = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
      st.progressBasis = basis;
      try { fs.writeFileSync(f, JSON.stringify(st, null, 1)); }
      catch (e) { res.writeHead(500, JH); return res.end(JSON.stringify({ ok:false, error:e.message })); }
      require("child_process").execFile(process.execPath, [path.join(__dirname, "schedule.js")],
        { timeout: 300000, maxBuffer: 32 * 1024 * 1024 }, (err) => {
          res.writeHead(200, JH);
          res.end(JSON.stringify({ ok: !err, basis, error: err ? String(err.message).slice(0, 200) : null }));
        });
    });
    return;
  }

  if (u.pathname === "/confirm" && req.method === "POST") {
    let body = "";
    req.on("data", d => { body += d; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      let m; try { m = JSON.parse(body); }
      catch (e) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"that was not JSON" })); }
      const code = String(m.code || "").trim();
      const pct = Number(m.pct);
      if (!code || !isFinite(pct) || pct < 0 || pct > 100) {
        res.writeHead(400, JH);
        return res.end(JSON.stringify({ ok:false, error:"need a package code and a per cent from 0 to 100" }));
      }
      const file = path.join(ROOT, "confirmed.json");
      let prior = {}; try { prior = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {}
      if (m.clear) delete prior[code];
      else prior[code] = { pct: Math.round(pct), by: String(m.by || "site").slice(0, 40),
        on: String(m.on || "").slice(0, 10) || null,
        note: String(m.note || "").slice(0, 200) || null,
        was: m.was == null ? null : Number(m.was),
        answered: new Date().toISOString() };
      try { fs.writeFileSync(file, JSON.stringify(prior, null, 1)); }
      catch (e) { res.writeHead(500, JH); return res.end(JSON.stringify({ ok:false, error:"could not save: " + e.message })); }
      require("child_process").execFile(process.execPath, [path.join(__dirname, "schedule.js")],
        { timeout: 300000, maxBuffer: 32 * 1024 * 1024 }, (err) => {
          res.writeHead(200, JH);
          res.end(JSON.stringify({ ok: !err, error: err ? String(err.message).slice(0, 200) : null,
            code, pct: Math.round(pct), answers: Object.keys(prior).length }));
        });
    });
    return;
  }

  if (u.pathname === "/counts" && req.method === "POST") {
    let body = "";
    req.on("data", d => { body += d; if (body.length > 2e6) req.destroy(); });
    req.on("end", () => {
      let m; try { m = JSON.parse(body); }
      catch (e) { res.writeHead(400, JH); return res.end(JSON.stringify({ ok:false, error:"that was not JSON" })); }
      const file = path.join(ROOT, "counts.json");
      let prior = {}; try { prior = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {}
      for (const code of Object.keys(m || {})) prior[code] = Object.assign(prior[code] || {}, m[code]);
      try { fs.writeFileSync(file, JSON.stringify(prior, null, 1)); }
      catch (e) { res.writeHead(500, JH); return res.end(JSON.stringify({ ok:false, error:"could not save: " + e.message })); }
      require("child_process").execFile(process.execPath, [path.join(__dirname, "plan.js")],
        { timeout: 600000, maxBuffer: 32 * 1024 * 1024 }, (err) => {
          let plan = null; try { plan = JSON.parse(fs.readFileSync(path.join(ROOT, "plan.json"), "utf8")); } catch (e) {}
          res.writeHead(200, JH);
          res.end(JSON.stringify({ ok: !err, error: err ? String(err.message).slice(0, 200) : null,
            zonedCodes: plan && plan.zoning && plan.zoning.coverage.zonedTasks,
            notZoned: plan && plan.zoning && plan.zoning.notZoned.length,
            finish: plan && plan.manpower && plan.manpower.recommend
              ? (plan.manpower.rows.find(r => r.fronts === plan.manpower.recommend.fronts) || {}).projectEnd : null,
            hits: plan && plan.manpower && plan.manpower.recommend && plan.manpower.recommend.hits }));
        });
    });
    return;
  }

  if (u.pathname === "/channel") {   // is the channel alive, and is the script?
    pull(EXEC + "?project=root", 0, (err, out) => {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      if (err) return res.end(JSON.stringify({ channel: false, error: err.message }));
      let j = null; try { j = JSON.parse(out.body); } catch (e) {}
      res.end(JSON.stringify({
        channel: true, exec: EXEC, status: out.status,
        script: j ? (j.ok ? "answering, with the project endpoints" : "answering, but without the project endpoints yet")
                  : "answering with something that is not JSON",
        reply: j || String(out.body).slice(0, 200) }));
    });
    return;
  }

  // ---- the handover date is a decision, and it re-plans -------------------
  // A DEADLINE YOU CANNOT MOVE IS NOT A CONSTRAINT, IT IS A WALL. The
  // contract date is the default and stays on the record; asking what a
  // different one would take is the whole point of building TO a date, and
  // it has to actually rebuild rather than redraw.
  if (u.pathname === "/handover") {
    const date = String(u.query.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.writeHead(400, JH); return res.end(JSON.stringify({ ok: false, error: "expected YYYY-MM-DD" })); }
    const f = path.join(ROOT, "settled.json");
    let st; try { st = JSON.parse(fs.readFileSync(f, "utf8")); }
    catch (e) { res.writeHead(500, JH); return res.end(JSON.stringify({ ok: false, error: "no settled.json" })); }
    st.handover = st.handover || {};
    // the contract date is never overwritten — it is what everything else is
    // a variance against
    if (!st.handover.contract) st.handover.contract = st.handover.date;
    st.handover.date = date;
    st.handover.chosenOn = new Date().toISOString().slice(0, 10);
    st.handover.isContract = date === st.handover.contract;
    fs.writeFileSync(f, JSON.stringify(st, null, 1));
    const run = (script, next) => require("child_process").execFile(process.execPath,
      [path.join(__dirname, script)], { timeout: 600000, maxBuffer: 32 * 1024 * 1024 }, next);
    return run("target.js", (e1, o1) => run("schedule.js", (e2, o2) => {
      res.writeHead(200, JH);
      res.end(JSON.stringify({ ok: !e2, date, contract: st.handover.contract,
        target: String(o1 || "").split("\n").filter(Boolean).slice(-3),
        error: (e1 && e1.message) || (e2 && e2.message) || null }));
    }));
  }

  // ---- the pin pack's pictures ------------------------------------------
  // WHAT THE CAMERA WAS MEANT TO SEE, AND WHAT IT SAW. The renders and the
  // daily walk photographs live in the PROJECT folder, not beside the engine,
  // so the page cannot reach them without a route. This is that route, and it
  // is deliberately two things and no more: an index of what exists, and a
  // reader for one file inside the project folder.
  //
  // A DAY WITH NO PHOTOGRAPH OF A PIN IS A DAY THAT PIN WAS NOT WALKED, and
  // the index says so per pin rather than per day — the walk on 31 July
  // covered exactly one pin, and a date picker that offered it for all
  // eighty-one would be offering eighty empty boxes.
  if (u.pathname === "/pinshots") {
    const proj = lastFolder();
    const out = { renders: {}, shots: {}, days: [], byPin: {} };
    const pinOf = (n) => { const m = /^p\s*0*(\d+)/i.exec(n); return m ? Number(m[1]) : null; };
    try {
      const rdir = path.join(proj, "13 Site Tracking/3d");
      for (const n of fs.readdirSync(rdir)) {
        if (!/\.(png|jpe?g|webp)$/i.test(n)) continue;
        const pin = pinOf(n); if (pin == null) continue;
        out.renders[pin] = "13 Site Tracking/3d/" + n;
      }
    } catch (e) { out.rendersWhy = "no 3d folder: " + e.code; }
    try {
      const pdir = path.join(proj, "13 Site Tracking/pins");
      for (const day of fs.readdirSync(pdir).sort()) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
        out.days.push(day);
        let names = []; try { names = fs.readdirSync(path.join(pdir, day)); } catch (e) {}
        for (const n of names) {
          if (!/\.(png|jpe?g|webp)$/i.test(n)) continue;
          const pin = pinOf(n); if (pin == null) continue;
          // one pin can be shot twice in a day (…_r1). The LAST by name wins,
          // because a retake is a correction of the one before it.
          (out.shots[day] = out.shots[day] || {})[pin] = "13 Site Tracking/pins/" + day + "/" + n;
          (out.byPin[pin] = out.byPin[pin] || {})[day] = 1;
        }
      }
    } catch (e) { out.shotsWhy = "no pins folder: " + e.code; }
    Object.keys(out.byPin).forEach(k => out.byPin[k] = Object.keys(out.byPin[k]).sort());
    res.writeHead(200, JH); return res.end(JSON.stringify(out));
  }

  // one file out of the project folder, and nothing above it
  //
  // BOTH SIDES ARE RESOLVED BEFORE THEY ARE COMPARED. The folder is read
  // out of facts.json, where it is written with forward slashes, while
  // path.join returns the platform separator — backslashes on Windows. A
  // raw startsWith between the two is false for every legitimate file, so
  // the guard refused the whole 3d and pins set rather than the traversal
  // it is there to stop. Resolving both makes the comparison about paths
  // instead of about how they happened to be spelled.
  if (u.pathname === "/img") {
    const rel = String(u.query.p || "");
    const folder = lastFolder();
    if (!folder) { res.writeHead(404, JH); return res.end(JSON.stringify({ error: "no project folder" })); }
    const proj = path.resolve(folder);
    const f = path.resolve(proj, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
    // the separator matters: without it "/proj-evil" passes a prefix test
    // against "/proj". Equality covers a request for the folder itself.
    if (f !== proj && !f.startsWith(proj + path.sep)) { res.writeHead(403); return res.end("no"); }
    return fs.readFile(f, (e, buf) => {
      if (e) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("not found"); }
      res.writeHead(200, { "content-type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream",
        "cache-control": "public, max-age=3600" });
      res.end(buf);
    });
  }

  // ---- the engine ------------------------------------------------------
  let p = u.pathname === "/" ? "/index.html" : u.pathname;
  const f = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end("no"); }
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("not found: " + p); }
    // NO CACHING. Without this the browser serves a stale index.html and
    // every change looks like it did not happen . which is a very expensive
    // way to debug an edit that was in fact fine.
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream",
      "cache-control": "no-store, must-revalidate", "pragma": "no-cache", "expires": "0" });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log("engine   http://localhost:" + PORT);
  console.log("channel  http://localhost:" + PORT + "/channel   (is Drive reachable)");
  console.log("proxy    /gs?project=list  →  " + EXEC.slice(0, 60) + "…");
});
