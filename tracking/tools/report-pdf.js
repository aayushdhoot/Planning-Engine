#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/report-pdf.js . A REPORT, AS A FILE YOU CAN SEND
//   node tools/report-pdf.js client-weekly [--out <path>] [--port 8901]
//   node tools/report-pdf.js --all [--dir <folder>]
//   node tools/report-pdf.js dpr-client --day 2026-07-20
//
// "Save as PDF" in the app is the browser's own print dialog, which is the
// right answer for a person at a keyboard and no answer at all for anything
// that has to produce the file without one.
//
// This drives a headless Chrome over the DevTools protocol and prints the
// same URL a person would open. Same page, same stylesheet, same flow — the
// PDF cannot drift from what the screen shows, because it IS the screen.
//
// WHY NOT --print-to-pdf
//   Because it prints when Chrome thinks the page is done, and this app is
//   done rendering long after that: it fetches twenty JSON files, and the
//   report only exists once the catalogue among them has landed. Printing on
//   Chrome's schedule produced ONE page of a seven page report and no error
//   of any kind — a wrong file with a right name, which is the worst thing a
//   report tool can hand somebody.
//
// So it waits for the pages themselves, and refuses rather than guessing:
//   . IT WAITS FOR THE PAGE COUNT TO SETTLE, not for a timer.
//   . IT CHECKS WHAT IT PRINTED. The page count in the PDF has to match the
//     page count in the DOM, or the file is deleted and the run fails.
//   . NO PAGE MAY OVERFLOW ITS BOX. Anything cropped by the print box is
//     invisible in the PDF, so it is checked before printing, not after.
//
// --all prints every live report through ONE browser. Nineteen launches cost
// nineteen cold starts and gain nothing; one browser navigating nineteen times
// is the same work without the waiting. Every report is still checked on its
// own, and one that fails does not stop the rest — it is named at the end,
// because a batch that hides a failure is a batch nobody can trust.
// ===================================================================
const fs = require("fs"), path = require("path"), os = require("os");
const { spawn, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const ALL = args.indexOf("--all") >= 0;
const ID = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--out"
  && args[args.indexOf(a) - 1] !== "--port" && args[args.indexOf(a) - 1] !== "--dir");
const PORT = Number(arg("port", 8901));
if (!ID && !ALL) {
  console.error("usage: node tools/report-pdf.js <report-id> [--out file.pdf]");
  console.error("       node tools/report-pdf.js --all [--dir folder]"); process.exit(2); }

const CHROME = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"].find(p => fs.existsSync(p));
if (!CHROME) { console.error("no Chrome, Chromium or Edge on this machine"); process.exit(2); }

// name the file after the report and the day it is for, so two of them never
// collide and nobody has to open one to find out which it is
const CAT = (() => { try {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "engines/skf/reports.json"), "utf8"));
} catch (e) { return null; } })();
if (!CAT) { console.error("no reports.json — run tools/reports.js first"); process.exit(2); }

const JOBS = ALL ? CAT.reports.filter(r => r.status === "live")
                 : [CAT.reports.find(r => r.id === ID)].filter(Boolean);
if (!JOBS.length) { console.error("no live report with id " + ID); process.exit(2); }
if (!ALL && JOBS[0].status !== "live") {
  console.error(ID + " is " + JOBS[0].status + ", not live"); process.exit(2); }

// Nineteen files in Downloads is a mess nobody thanks you for, so a batch goes
// into one dated folder and a single report keeps its old place.
const DIR = ALL ? arg("dir", path.join(os.homedir(), "Downloads",
  "SKF-Pune-7F-reports-" + new Date().toISOString().slice(0, 10)))
  : path.join(os.homedir(), "Downloads");
// A REPORT THAT CAN BE ASKED FOR ANOTHER DAY takes one here too, and refuses
// a day it was never built for rather than quietly printing the default.
const DAY = arg("day", null);
if (DAY && JOBS.length === 1) {
  const has = (JOBS[0].days || []).indexOf(DAY) >= 0;
  if (!has) { console.error("  " + JOBS[0].id + " has no report for " + DAY +
    (JOBS[0].days ? " — it has " + JOBS[0].days.join(", ") : " — it is not a dated report"));
    process.exit(2); }
}
const slugOf = (m) => (m.name || m.id).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
const dayOf = (m) => (DAY && (m.days || []).indexOf(DAY) >= 0)
  ? DAY : String(m.content.for || "").slice(0, 10);
const outFor = (m) => (!ALL && arg("out", null)) || path.join(DIR,
  "SKF-Pune-7F-" + slugOf(m) + "-" + dayOf(m) + ".pdf");

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dnb-pdf-"));
  const dbg = 9222 + Math.floor((Date.now() % 300));
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox",
    "--hide-scrollbars", "--remote-debugging-port=" + dbg,
    "--user-data-dir=" + profile, "--window-size=1400,1000", "about:blank"],
    { stdio: "ignore" });
  const done = (code) => { try { chrome.kill(); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    process.exit(code); };

  // ---- find the tab ------------------------------------------------------
  let target = null;
  for (let i = 0; i < 60 && !target; i++) { await sleep(200);
    try { const r = await fetch("http://127.0.0.1:" + dbg + "/json/list");
      const list = await r.json();
      target = list.find(t => t.type === "page" && t.webSocketDebuggerUrl); } catch (e) {} }
  if (!target) { console.error("  chrome did not come up"); return done(1); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0; const waiting = {};
  ws.addEventListener("message", (ev) => { const m = JSON.parse(ev.data);
    if (m.id && waiting[m.id]) { waiting[m.id](m); delete waiting[m.id]; } });
  await new Promise((res, rej) => { ws.addEventListener("open", res);
    ws.addEventListener("error", rej); });
  const send = (method, params) => new Promise((res, rej) => {
    const id = ++seq; waiting[id] = (m) => m.error ? rej(new Error(m.error.message)) : res(m.result);
    ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true,
      awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text +
      " " + ((r.exceptionDetails.exception || {}).description || "").slice(0, 200));
    return r.result.value;
  };

  // ---- one report, start to finish ---------------------------------------
  // Everything below happens per report, and every check belongs to that
  // report alone: a batch that lets one failure stand in for the others is
  // worse than nineteen separate runs.
  async function printOne(m) {
    const d = (DAY && (m.days || []).indexOf(DAY) >= 0) ? DAY : null;
    const url = "http://127.0.0.1:" + PORT + "/?report=" + encodeURIComponent(m.id) +
      (d ? "&day=" + encodeURIComponent(d) : "");
    await send("Page.navigate", { url });

    // WAIT FOR THE PAGES, NOT FOR A TIMER. The app fetches twenty files and
    // the report cannot exist until the catalogue among them lands.
    let pages = 0, stable = 0;
    for (let i = 0; i < 150; i++) {
      await sleep(200);
      let n = 0;
      try { n = await evaluate('document.querySelectorAll(".rpage").length'); } catch (e) { continue; }
      // the id has to match too, or a slow navigation prints the LAST report
      // again under this one's name — the same wrong-file-right-name failure
      // in a new coat.
      let cur = null, curDay = null;
      try { cur = await evaluate('(window.__SKF__&&window.__SKF__.state.repId)||null');
            curDay = await evaluate('(window.__SKF__&&window.__SKF__.state.repDay)||null'); }
      catch (e) {}
      // THE DAY HAS TO MATCH TOO. Printing the default day under a filename
      // that names another one is the same wrong-file-right-name failure.
      if (cur !== m.id || (d && curDay !== d)) { stable = 0; pages = 0; continue; }
      if (n > 0 && n === pages) { stable++; if (stable >= 2) break; } else { stable = 0; }
      pages = n;
    }
    if (!pages) {
      const view = await evaluate('(window.__SKF__&&window.__SKF__.state.view)||"(no seam)"')
        .catch(() => "(no seam)");
      return { ok: false, why: "never rendered — the app is showing " + view };
    }

    // NOTHING CROPPED
    const over = await evaluate(`(function(){var o=[];
      document.querySelectorAll(".rpage").forEach(function(p,i){
        var inn=p.querySelector(".rp-in"), b=p.querySelector(".rp-body");
        if(!inn||!b) return;
        var u=(b.getBoundingClientRect().top-inn.getBoundingClientRect().top)+b.scrollHeight;
        if(u>inn.clientHeight+2) o.push((i+1)+" by "+Math.round(u-inn.clientHeight)+"px");});
      return o;})()`);
    if (over.length) return { ok: false,
      why: over.length + " page(s) would print cropped: " + over.join(", ") };

    // WAIT FOR THE PHOTOGRAPHS. Chrome prints grey boxes without complaining.
    let shots = 0, loaded = 0;
    for (let i = 0; i < 60; i++) {
      const r = await evaluate(`(function(){var a=document.querySelectorAll(".rp-shot img");
        var n=0; a.forEach(function(x){ if(x.complete&&x.naturalWidth>0) n++; });
        return [a.length,n];})()`);
      shots = r[0]; loaded = r[1];
      if (shots === loaded) break;
      await sleep(250);
    }
    if (shots !== loaded) return { ok: false,
      why: (shots - loaded) + " of " + shots + " photographs never loaded" };

    // preferCSSPageSize honours the @page rule, so the PDF is the shape the
    // page was designed at. Streamed, because a report full of photographs is
    // megabytes of base64 and one DevTools message of that size hung silently.
    const pdf = await send("Page.printToPDF", { printBackground: true,
      preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
      transferMode: "ReturnAsStream" });
    const out = outFor(m);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (pdf.stream) {
      const parts = [];
      for (;;) {
        const c = await send("IO.read", { handle: pdf.stream, size: 512 * 1024 });
        if (c.data) parts.push(Buffer.from(c.data, c.base64Encoded ? "base64" : "utf8"));
        if (c.eof) break;
      }
      await send("IO.close", { handle: pdf.stream }).catch(() => {});
      fs.writeFileSync(out, Buffer.concat(parts));
    } else fs.writeFileSync(out, Buffer.from(pdf.data, "base64"));

    // CHECK WHAT WAS ACTUALLY WRITTEN. Count the page OBJECTS — Chrome nests
    // the page tree once a document gets big, so the first /Count is a
    // subtree's and read 8 on a 16 page report.
    const buf = fs.readFileSync(out), latin = buf.toString("latin1");
    const got = (latin.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
    if (got !== pages) { try { fs.unlinkSync(out); } catch (e) {}
      return { ok: false, why: "the PDF holds " + got + " pages and the report has " + pages }; }
    const box = /\/MediaBox\s*\[\s*([\d.\s-]+?)\]/.exec(latin);
    const dims = box ? box[1].trim().split(/\s+/).map(Number) : null;
    return { ok: true, out, pages: got, kb: Math.round(buf.length / 1024), shots,
      size: dims ? Math.round(dims[2] - dims[0]) + "x" + Math.round(dims[3] - dims[1]) : "?" };
  }

  // ---- run them ----------------------------------------------------------
  console.log("\n  " + (ALL ? JOBS.length + " reports" : JOBS[0].name) + "  ·  into " + DIR + "\n");
  const results = [];
  for (const m of JOBS) {
    process.stdout.write("  " + String(m.name + (DAY && (m.days || []).indexOf(DAY) >= 0
      ? " " + DAY : "")).slice(0, 34).padEnd(36));
    let r; try { r = await printOne(m); }
    catch (e) { r = { ok: false, why: e.message }; }
    results.push(Object.assign({ id: m.id, name: m.name }, r));
    console.log(r.ok
      ? String(r.pages).padStart(3) + " pages · " + String(r.kb).padStart(5) + " KB · " +
        r.size + " pt" + (r.shots ? " · " + r.shots + " photos" : "")
      : "FAILED — " + r.why);
  }

  const good = results.filter(r => r.ok), bad = results.filter(r => !r.ok);
  console.log("\n  " + good.length + " of " + results.length + " written · " +
    good.reduce((t, r) => t + r.pages, 0) + " pages · " +
    (good.reduce((t, r) => t + r.kb, 0) / 1024).toFixed(1) + " MB");
  console.log("  every one checked: page count matches, nothing cropped, no missing photograph");
  if (bad.length) { console.log("\n  NOT WRITTEN:");
    bad.forEach(r => console.log("    " + r.name + " — " + r.why)); }
  console.log("  " + DIR + "\n");
  done(bad.length ? 1 : 0);
})().catch(e => { console.error("  " + e.message); process.exit(1); });
