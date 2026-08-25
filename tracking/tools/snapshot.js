#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/snapshot.js . FOLD THE LOG INTO WHAT THE APP READS
//   node tools/snapshot.js [--as-of 2026-08-12]
//
// facts.json is a VIEW. Everything the engine knows is on the log, and
// this folds it. Until this existed the snapshot was rebuilt by the
// deterministic ingest alone, so every finding a reader produced — 1,341
// of them, out of the agreement, the POs and the GFC drawings — sat on
// the log and never reached a single screen.
//
// The read-metadata stays with the read that produced it: which documents
// were opened, what could not be read, which columns are unsettled, the
// floor geometry. Those describe an act of reading, not a fact about the
// project, so they are carried forward rather than folded.
//
// --as-of rebuilds the snapshot as it stood on a day. That is the whole
// reason the log exists, and it is one flag rather than a second store.
// ===================================================================
const fs = require("fs"), path = require("path");
const LOG = require(path.join(__dirname, "../platform/core/log.js"));
const F   = require(path.join(__dirname, "../platform/ingest/facts.js"));

const args = process.argv.slice(2);
const arg = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
const ENGINE = path.join(__dirname, "../engines/skf");
const ASOF = arg("--as-of", null);
const OUT = arg("--out", path.join(ENGINE, "facts.json"));

const folded = LOG.snapshot(ENGINE, ASOF ? { asOf: ASOF } : {});

// what the fold holds, minus what the engine has stopped believing
const all = Object.keys(folded.facts || {}).map(k => folded.facts[k]);
const live = all.filter(f => !f.__gone);
const gone = all.length - live.length;

// EVERY FACT GOES THROUGH THE SAME DOOR, whoever produced it. A reader's
// finding is not admitted on softer terms than a spreadsheet cell's.
const specs = live.map((f, i) => ({ ...f, id: f.id || ("fold:" + i) }));
const st = F.store(specs);

// read-metadata: it describes the act of reading, not the project
const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

const out = {
  folder: prior.folder || null,
  files: prior.files || 0,
  facts: st.all(),
  rejected: st.rejected,
  conflicts: F.conflicts(st),
  unread: prior.unread || [],
  // WHAT IS STILL WAITING TO BE READ MUST SURVIVE THE FOLD. This list is the
  // ingest's answer to "did anybody ever open the photographs" — a thousand
  // files it hands to readall.js rather than opening itself. An allow-list
  // that carries `unread` forward but drops this one reports a folder with
  // ten unread files and eleven hundred invisible ones, which is exactly the
  // silent shortfall the whole read layer is written to prevent.
  needsAReader: prior.needsAReader || [],
  documents: prior.documents || [],
  notes: prior.notes || [],
  confirm: prior.confirm || [],
  roles: prior.roles || [],
  geometry: prior.geometry || null,
  readAt: prior.readAt || null,
  lastRead: prior.lastRead || null,
  // THE SNAPSHOT SAYS WHAT IT IS A VIEW OF, so a stale one is visible
  log: { file: LOG.LOG, shards: LOG.SHARDS, events: folded.eventsRead,
         foldedAt: folded.foldedAt, asOf: ASOF || null, tombstoned: gone,
         brokenLines: folded.brokenLines || null },
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

// ---- what it is made of ----------------------------------------------
const byActor = {};
LOG.read(ENGINE, ASOF ? { asOf: ASOF } : {}).forEach(e => {
  const a = e.actor || "unknown"; byActor[a] = (byActor[a] || 0) + 1;
});
console.log("FOLDED " + folded.eventsRead + " events" + (ASOF ? " as of " + ASOF : "") +
  " → " + out.facts.length + " facts" + (gone ? ", " + gone + " tombstoned and not carried" : ""));
console.log("\n  WHO PUT THEM THERE");
Object.entries(byActor).sort((a, b) => b[1] - a[1]).forEach(([a, n]) =>
  console.log("    " + String(n).padStart(6) + "  " + a));
const docs = {};
out.facts.forEach(f => { const d = (f.source.doc || "").split("/").pop(); docs[d] = (docs[d] || 0) + 1; });
console.log("\n  TOP DOCUMENTS");
Object.entries(docs).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([d, n]) =>
  console.log("    " + String(n).padStart(6) + "  " + d.slice(0, 62)));
console.log("\n  " + out.conflicts.length + " conflicts · " + out.rejected.length + " refused at the door");
if (out.rejected.length) out.rejected.slice(0, 3).forEach(r => console.log("      " + r.why));
console.log("\n→ " + OUT);
