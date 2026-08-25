#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/readall.js . READ THE FOLDER, DOCUMENT BY DOCUMENT
//   node tools/readall.js [--kind agreement,po] [--match 2026-08-03]
//                         [--limit 20] [--plan] [--workers 6]
//
// Walks the project, decides what each file is, and reads each one under
// its own judgement. Resumable: the log already knows which documents
// have been read, so a second run picks up where the first stopped and
// re-reads nothing.
//
// --plan  says what would be read, by kind, and stops. Nothing costs
//         anything until somebody has seen that list.
//
// WHY THE CONCURRENCY IS HERE AND NOT IN THE READING
//   Each document is read by its own process, running the same
//   readdoc.js — the same kind rules, the same brief built from the same
//   register, the same authority typing, the same address law, the same
//   log. Nothing about how a document is judged changes because six of
//   them are being judged at once. Parallelism that reaches inside the
//   judgement is how twenty readers end up applying twenty prompts.
//   Each writer gets its own shard of the log, so no two appends can
//   interleave; see platform/core/log.js.
//
// THE LAW THIS KEEPS
//   A document that fails to read does not stop the run and does not
//   disappear. It is named with its reason at the end, alongside what
//   succeeded, because a batch that reports only its successes is how a
//   folder ends up half-read and nobody knows which half.
// ===================================================================
const fs = require("fs"), path = require("path"), os = require("os");
const { execFile } = require("child_process");
const KINDS = require(path.join(__dirname, "../platform/ingest/kinds.js"));
const LOG   = require(path.join(__dirname, "../platform/core/log.js"));

const args = process.argv.slice(2);
const arg = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
const ENGINE = path.join(__dirname, "../engines/skf");
const PLAN_ONLY = args.indexOf("--plan") >= 0;
const LIMIT = Number(arg("--limit", 0)) || 0;
const ONLY_KINDS = (arg("--kind", "") || "").split(",").map(s => s.trim()).filter(Boolean);
// A DAY IS THE UNIT OF A WALK. Reading a scattered third of eleven days
// gives nothing that can be compared with anything; one complete day can be
// diffed against the plan the moment it lands.
const MATCH = arg("--match", null) ? new RegExp(arg("--match", ""), "i") : null;
// enough to keep the machine busy without turning the CLI into a queue of
// its own; every worker is a whole claude process, not a thread
const WORKERS = Math.max(1, Number(arg("--workers", 0)) || Math.min(8, Math.max(2, os.cpus().length - 2)));
const facts = JSON.parse(fs.readFileSync(path.join(ENGINE, "facts.json"), "utf8"));
const PROJECT = arg("--project", facts.folder);

function walk(dir, base, out) {
  for (const n of fs.readdirSync(dir)) {
    if (n.startsWith(".")) continue;
    const p = path.join(dir, n), rel = base ? base + "/" + n : n;
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, rel, out); else out.push(rel);
  }
  return out;
}
const files = walk(PROJECT, "", []).filter(f => f !== "_mirror.json");
const plan = KINDS.plan(files);

// ALREADY READ IS ALREADY READ. The log is the record of what the engine
// has looked at, so a re-run costs nothing for the documents it already
// knows — which is what makes reading a thousand files something you can
// start, stop and resume.
const done = {};
LOG.read(ENGINE).forEach(e => { if (/^reader:/.test(e.actor || "") && e.source) done[e.source] = 1; });

let queue = plan.rows.filter(r => r.kind && !r.deterministic && !done[r.rel]);
if (ONLY_KINDS.length) queue = queue.filter(r => ONLY_KINDS.indexOf(r.kind) !== -1);
if (MATCH) queue = queue.filter(r => MATCH.test(r.rel));
if (LIMIT) queue = queue.slice(0, LIMIT);

const byKind = {};
plan.rows.filter(r => r.kind && !r.deterministic).forEach(r =>
  (byKind[r.kind] = byKind[r.kind] || { total: 0, read: 0 }, byKind[r.kind].total++,
   done[r.rel] && byKind[r.kind].read++));

console.log("THE FOLDER");
console.log("  " + plan.why);
console.log("\nKIND            READ / NEEDS A MODEL      QUEUED NOW");
Object.keys(byKind).sort((a, b) => byKind[b].total - byKind[a].total).forEach(k => {
  const q = queue.filter(r => r.kind === k).length;
  console.log("  " + k.padEnd(14) + String(byKind[k].read + " / " + byKind[k].total).padStart(14) +
    String(q || "").padStart(16));
});
console.log("\n  " + plan.rows.filter(r => r.deterministic).length + " files the deterministic readers already open without a model");
console.log("  " + plan.unplaced.length + " files no rule places — reported, never read as the nearest kind");

if (PLAN_ONLY || !queue.length) {
  if (!queue.length && !PLAN_ONLY) console.log("\nNothing queued — every document of these kinds is already on the log.");
  process.exit(0);
}

console.log("\nREADING " + queue.length + " documents, " + WORKERS + " at a time\n" + "-".repeat(70));
const ok = [], failed = [];
const t0 = Date.now();
let next = 0, finished = 0, running = 0;

function launch(resolve) {
  while (running < WORKERS && next < queue.length) {
    const i = next++, r = queue[i];
    running++;
    execFile(process.execPath, [path.join(__dirname, "readdoc.js"), r.rel],
      { encoding: "utf8", timeout: 900000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        running--; finished++;
        const out = String(stdout || "");
        const head = "[" + String(finished).padStart(4) + "/" + queue.length + "] " +
          r.kind.padEnd(10) + " " + r.rel.split("/").pop().slice(0, 46).padEnd(48);
        if (err) {
          const why = (String(stdout || "") + String(stderr || "") + err.message)
            .split("\n").filter(Boolean).pop() || err.message;
          console.log(head + "FAILED  " + why.slice(0, 60));
          failed.push({ rel: r.rel, kind: r.kind, why: why.slice(0, 240) });
        } else {
          const found = /FOUND (\d+) signals/.exec(out) || /ANSWERED (\d+) of/.exec(out);
          const ev = /(\d+) events appended/.exec(out);
          const secs = /read in (\d+)s/.exec(out);
          console.log(head + (found ? found[1] + " found" : "read").padEnd(11) +
            (ev ? ev[1] : "0") + " events" + (secs ? "   " + secs[1] + "s" : ""));
          ok.push({ rel: r.rel, kind: r.kind, events: ev ? Number(ev[1]) : 0 });
        }
        if (finished === queue.length) resolve(); else launch(resolve);
      });
  }
}

new Promise(launch).then(() => {
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  const per = queue.length ? ((Date.now() - t0) / 1000 / queue.length).toFixed(1) : 0;
  console.log("-".repeat(70));
  console.log("READ " + ok.length + " documents in " + mins + " minutes (" + per +
    "s each on average across " + WORKERS + " workers), " +
    ok.reduce((t, x) => t + x.events, 0) + " events appended");
  if (failed.length) {
    console.log("\nCOULD NOT READ " + failed.length + " — named, never silently skipped:");
    failed.forEach(f => console.log("  " + f.rel.slice(0, 68) + "\n      " + f.why.slice(0, 110)));
  }
  console.log("\nthe log now holds " + LOG.read(ENGINE).length + " events");
});
