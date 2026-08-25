#!/usr/bin/env node
// ===================================================================
// DnB-OS . engines/tracking/serve.js . THE LOCAL BRIDGE
// Serves the tracking engine AND powers the one click "Read with my
// Claude" button on the Drive tab. The read runs `claude` in headless
// print mode against the login of whoever started this server, so on a
// Claude subscription it costs no API money and holds no key.
//
// Launch from a terminal where `claude` is logged in (a Max/Pro login,
// not the API console one):
//   node DnB-OS/engines/tracking/serve.js
// then open
//   http://localhost:8902/DnB-OS/engines/tracking/index.html
//
// Why it must be your terminal: `claude` keeps its token in the login
// keychain, scoped to the session that logged in. A server started any
// other way cannot read that token and every read says "not logged in".
//
// The bridge only reads. It pulls the day's photos from the capture
// link, hands them to claude with the reading law, and returns the
// readings json the engine already knows how to absorb. It never writes
// to Drive and never changes a status on its own.
// ===================================================================

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.DNBOS_PORT || 8902);
const WEBROOT = path.resolve(__dirname, "../../..");          // repo root, the web root
const MODEL = process.env.DNBOS_READ_MODEL || "sonnet";       // lighter on the Max quota than opus, still strong at vision
const BATCH = Number(process.env.DNBOS_READ_BATCH || 12);     // pins per claude call: progress and resilience
const BATCH_TIMEOUT = Number(process.env.DNBOS_READ_TIMEOUT || 300000); // kill a stuck claude, never hang the job
const DL_CONCURRENCY = 8;

const WALK = require("../../platform/track/walk.js");
const DIDX = require("../../platform/track/driveindex.js");
const PINS = require("../../platform/track/project/skf_pins.js");
const RENDERS = require("../../platform/track/project/skf_render.js");

// ---- static file serving -------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".ico": "image/x-icon", ".woff2": "font/woff2"
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function serveStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "");
  const full = path.resolve(WEBROOT, rel);
  if (!full.startsWith(WEBROOT)) { res.writeHead(403); res.end("forbidden"); return; }   // no traversal out of the root
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end("not found"); return; }
    const type = MIME[path.extname(full).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size });
    fs.createReadStream(full).pipe(res);
  });
}

// ---- the read job model --------------------------------------------
// One job per day at a time. The engine starts a read, then polls the
// job for progress. Every count here is real: a pin is downloaded, then
// read, then either lands as a record or is named as failed. Nothing is
// faked to make the bar move.
const jobs = new Map();

// the engine may post what each pin last read, as pin:pct pairs, so the
// reader can be told where a view stood. It is context, never an answer:
// the prompt tells the reader to judge the photo in front of it.
function priorFromQuery(url) {
  try {
    const raw = new URL(url, "http://x").searchParams.get("prior");
    if (!raw) return null;
    const obj = JSON.parse(decodeURIComponent(raw));
    const out = {};
    for (const k in obj) { const v = Number(obj[k]); if (isFinite(v)) out[Number(k)] = Math.round(v); }
    return Object.keys(out).length ? out : null;
  } catch (e) { return null; }
}

function newJob(day) {
  const job = { id: "job-" + day + "-" + process.hrtime.bigint().toString(36),
    day, state: "listing", total: 0, downloaded: 0, done: 0,
    failedPins: [], failNote: null, result: null, error: null };
  jobs.set(job.id, job);
  return job;
}

async function pMapLimit(items, limit, fn) {
  const out = []; let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

// pull one claude reading over a batch of already downloaded photos
function readBatch(day, batch, dir, law, prior) {
  // Each pin is handed two images where a render exists: the approved view
  // finished, and the same view today. That pairing is the whole point.
  // Without it a reader can only say what is happening. With it, it can say
  // how far along the view is, element by element, which is the number every
  // screen and every report has been missing.
  const pinLines = batch.map(p => {
    const was = prior && prior[p.pin] != null ? `, last read ${prior[p.pin]}%` : "";
    return p.renderName
      ? `- Pin ${p.pin}, space "${p.space}". RENDER: ${p.renderName}. TODAY: ${p.photo.name}${was}`
      : `- Pin ${p.pin}, space "${p.space}". No render exists. TODAY: ${p.photo.name}${was}`;
  }).join("\n");

  const prompt =
`You are the site intelligence for SKF Pune, reading the pin walk of ${day}.

For each pin below you get two images from the same viewpoint:
  RENDER  the approved design, that view finished
  TODAY   the site photograph taken on the walk
Open both with the Read tool. The render is the target. The photo is now.

Your job for each pin, in order:
1. From the RENDER, list the elements that view is meant to contain when
   complete. Ceiling, flooring, partitions, glazing, lighting, ducting,
   sprinklers, joinery, furniture, paint, whatever that view actually shows.
   Only elements you can see in the render. Do not invent a scope.
2. For each element, look at TODAY and judge how far it has got, 0 to 100.
   0 nothing there. 100 finished as designed.
   Anchor the judgement: bare slab is 0 flooring, screed poured is 30,
   tile laid ungrouted is 70, grouted and clean is 100. Studs only is 20
   partition, boarded one side 40, both sides 60, taped and sanded 80,
   painted 100. Duct run but uninsulated is 50, insulated 75, grilles on 100.
   An element the render shows and the photo does not show at all is 0.
3. Give the pin one overall percent for that view against the render, and a
   confidence. If the photo is dark, blurred, or shot from a different angle
   than the render, say confidence low and explain in the note.
${prior ? "4. You are told the pin's last read percent. A pin should not go backwards.\n   If what you see is genuinely lower, keep your number and say why in the note.\n   Never copy the old number: judge the photo in front of you." : ""}

Where no render exists, still list what you see and judge each element on the
same anchors, and say confidence medium at best because you have no target.

The reading law:
${(law || []).map(l => "- " + l).join("\n")}

Pins in this batch:
${pinLines}

Also report safety across the batch: work at height with no harness, missing
helmets, open trenches or shafts, live boards near water, blocked exits, fire
load, damaged access. And good practice: barricades, signage, helmets worn,
tape on glass.

Reply with ONLY a JSON object, no prose and no code fence:
{"readings":[{"day":"${day}","source":"pin_photo","pin":<number>,
  "pct":<0-100 for the whole view against the render>,
  "confidence":"<high|medium|low>",
  "note":"<one short line: what moved this view, or what blocks it>",
  "elements":[{"element":"<name>","state":"<not_started|started|ongoing|done|blocked|material_present|no_change>","pct":<0-100>,"tag":"seen","confidence":"<high|medium|low>","note":"<what the photo shows>"}]}],
 "safety":[{"day":"${day}","sev":"<high|med|low>","cat":"<Height|Electrical|Housekeeping|Fire|Access>","pins":[<pin>],"text":"<the hazard and where>"}],
 "good":[{"day":"${day}","pins":[<pin>],"text":"<what is being done right>"}]}

Every pin in the batch must appear once. state must be one of the listed
words exactly. pct must be a number, never a string. safety and good cover
the whole batch and may be empty.`;

  return new Promise(resolve => {
    const args = ["-p", prompt, "--allowedTools", "Read", "--model", MODEL, "--output-format", "json"];
    let out = "", done = false, cp;
    const finish = r => { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(r); };
    try { cp = spawn("claude", args, { cwd: dir, env: process.env }); }
    catch (e) { finish({ recs: null, why: "could not start claude: " + e.message }); return; }
    // never let a stuck or unauthenticated claude hang the whole job: kill
    // it past the timeout and let the batch be reported as failed, honestly.
    const timer = setTimeout(() => { try { cp.kill("SIGKILL"); } catch (e) {} finish({ recs: null, why: "the read timed out after " + Math.round(BATCH_TIMEOUT / 1000) + "s" }); }, BATCH_TIMEOUT);
    cp.stdout.on("data", d => out += d);
    cp.stderr.on("data", () => {});
    cp.on("error", e => finish({ recs: null, why: e.code === "ENOENT" ? "claude CLI not found on PATH" : String(e) }));
    cp.on("close", () => finish(parseClaudeReadings(out, batch, day)));
  });
}

function parseClaudeReadings(stdout, batch, day) {
  let wrap;
  try { wrap = JSON.parse(stdout); } catch (e) { return { recs: null, why: "claude did not return json" }; }
  if (!wrap || wrap.is_error) return { recs: null, why: (wrap && wrap.result) || "claude reported an error" };
  let text = String(wrap.result || "").trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  // the reply may be the object shape (readings, safety, good) or, from an
  // older prompt, a bare array of readings. Both are accepted.
  let arr = null, safety = [], good = [];
  const ob = text.indexOf("{"), oe = text.lastIndexOf("}");
  const ab = text.indexOf("["), ae = text.lastIndexOf("]");
  if (ob >= 0 && oe > ob && (ab < 0 || ob < ab)) {
    let obj;
    try { obj = JSON.parse(text.slice(ob, oe + 1)); } catch (err) { obj = null; }
    if (obj && Array.isArray(obj.readings)) {
      arr = obj.readings;
      if (Array.isArray(obj.safety)) safety = obj.safety;
      if (Array.isArray(obj.good)) good = obj.good;
    }
  }
  if (!arr) {
    if (ab < 0 || ae < 0) return { recs: null, why: "no readings in the reply" };
    try { arr = JSON.parse(text.slice(ab, ae + 1)); } catch (err) { return { recs: null, why: "the readings did not parse" }; }
  }
  if (!Array.isArray(arr)) return { recs: null, why: "readings were not a list" };
  const allowed = new Set(batch.map(b => b.pin));
  const recs = arr.filter(r => r && allowed.has(r.pin) && Array.isArray(r.items));
  return { recs, safety, good, why: null };
}

async function runRead(job) {
  const day = job.day;
  const listing = await WALK.fetchDay(day);
  if (!listing || !listing.ok) { job.state = "error"; job.error = "the capture link did not answer: " + ((listing && listing.error) || "no reply"); return; }
  const brief = DIDX.readBrief(day, listing.files || [], listing.blocked || [], PINS, WALK.EXEC);
  if (!brief.pins.length) { job.state = "error"; job.error = "no photos for " + day + ", nothing to read"; return; }
  job.total = brief.pins.length;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dnbos-read-" + day + "-"));
  job.state = "downloading";
  // the render map: the pin's approved view, finished. Without it the
  // reader has nothing to measure the photo against and can only say what
  // is happening, never how far along it is.
  const renderById = {};
  for (const r of (RENDERS.RENDERS || [])) renderById[r.pin] = r;
  await pMapLimit(brief.pins, DL_CONCURRENCY, async p => {
    const img = await WALK.fetchImg(p.photo.id);
    if (img && img.ok && img.b64) fs.writeFileSync(path.join(dir, p.photo.name), Buffer.from(img.b64, "base64"));
    else { job.failedPins.push(p.pin); job.downloaded++; return; }
    const rn = renderById[p.pin];
    if (rn && rn.file && rn.file.driveId) {
      const rimg = await WALK.fetchImg(rn.file.driveId);
      if (rimg && rimg.ok && rimg.b64) {
        const rname = "RENDER_P" + String(p.pin).padStart(2, "0") + ".png";
        fs.writeFileSync(path.join(dir, rname), Buffer.from(rimg.b64, "base64"));
        p.renderName = rname;        // the prompt names it beside the photo
      }
    }
    job.downloaded++;
  });

  const readable = brief.pins.filter(p => job.failedPins.indexOf(p.pin) === -1);
  const all = [], allSafety = [], allGood = [];
  job.state = "reading";
  for (let i = 0; i < readable.length; i += BATCH) {
    const batch = readable.slice(i, i + BATCH);
    const { recs, safety, good, why } = await readBatch(day, batch, dir, brief.law, job.prior);
    if (safety && safety.length) allSafety.push(...safety);
    if (good && good.length) allGood.push(...good);
    if (recs && recs.length) {
      all.push(...recs);
      const got = new Set(recs.map(r => r.pin));
      batch.forEach(b => { if (!got.has(b.pin)) job.failedPins.push(b.pin); });
    } else {
      batch.forEach(b => job.failedPins.push(b.pin));
      if (why && !job.failNote) job.failNote = why;   // the first reason, for an honest message
    }
    job.done += batch.length;
  }

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  job.result = { dnbos: "readings", project: "SKF Pune", day: day,
    readBy: "Claude walk read (bridge)", readings: all, safety: allSafety, good: allGood };
  job.failedPins = job.failedPins.filter((v, i, a) => a.indexOf(v) === i).sort((x, y) => x - y);
  job.state = "done";
}

// ---- routing -------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = req.url || "/";

  if (url === "/bridge/health") { sendJson(res, 200, { ok: true, model: MODEL, batch: BATCH }); return; }

  if (url.indexOf("/bridge/read") === 0 && req.method === "POST") {
    const day = new URL(url, "http://x").searchParams.get("day") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { sendJson(res, 400, { ok: false, error: "need a day (YYYY-MM-DD)" }); return; }
    const job = newJob(day);
    job.prior = priorFromQuery(url);
    runRead(job).catch(e => { job.state = "error"; job.error = String(e && e.message ? e.message : e); });
    sendJson(res, 200, { ok: true, jobId: job.id, day });
    return;
  }

  if (url.indexOf("/bridge/job") === 0) {
    const id = new URL(url, "http://x").searchParams.get("id") || "";
    const job = jobs.get(id);
    if (!job) { sendJson(res, 404, { ok: false, error: "no such job" }); return; }
    sendJson(res, 200, { ok: true, state: job.state, total: job.total, downloaded: job.downloaded,
      done: job.done, failedPins: job.failedPins, failNote: job.failNote, error: job.error,
      result: job.state === "done" ? job.result : null });
    return;
  }

  serveStatic(req, res, url);
});

server.on("error", e => {
  if (e.code === "EADDRINUSE") {
    console.error("\nPort " + PORT + " is already in use. Another server (maybe the old python one, or a second copy of this) has it.");
    console.error("Stop that one first, for example:  lsof -ti tcp:" + PORT + " | xargs kill\n");
  } else { console.error(e); }
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  // the one app is the front door now; Track is a mode inside it
  const appUrl = "http://localhost:" + PORT + "/DnB-OS/engines/os/index.html";
  console.log("DnB-OS Tracking Engine bridge");
  console.log("  serving:  " + appUrl);
  console.log("  read via: claude (" + MODEL + "), " + BATCH + " pins per call, your terminal login");
  console.log("  Ctrl+C to stop\n");
  if (process.platform === "darwin") { try { spawn("open", [appUrl]); } catch (e) {} }
});
