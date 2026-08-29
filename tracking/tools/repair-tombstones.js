#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/repair-tombstones.js . UNDO A BUG'S OUTPUT
//   node tools/repair-tombstones.js
//
// A deterministic re-read tombstoned every finding the agents had made,
// because its "no longer read" scope matched any document in the folder
// rather than the documents THIS reader produces facts from.
//
// Those tombstones are the output of a defect, not the record of a
// decision, so they are removed rather than corrected-in-place. The log
// as it stood is archived first: a repair nobody can check afterwards is
// not one to trust.
// ===================================================================
const fs = require("fs"), path = require("path");
const LOG = require(path.join(__dirname, "../platform/core/log.js"));
const ENGINE = path.join(__dirname, "../engines/skf");

const events = LOG.read(ENGINE);
// the bad tombstones: written by the ingest, against a fact the ingest
// never wrote in the first place
const authorOf = {};
events.forEach(e => { if (e.kind === "fact.record" && !(e.value || {}).__gone) authorOf[e.key] = e.actor; });

const bad = new Set();
events.forEach(e => {
  if (e.kind !== "fact.record" || !(e.value || {}).__gone) return;
  if (e.actor === "ingest" && authorOf[e.key] && authorOf[e.key] !== "ingest") bad.add(e.id);
});

if (!bad.size) { console.log("no mistaken tombstones on the log"); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const archive = path.join(ENGINE, "events.pre-repair-" + stamp + ".jsonl");
fs.writeFileSync(archive, events.map(e => JSON.stringify(e)).join("\n") + "\n");

const kept = events.filter(e => !bad.has(e.id));
fs.rmSync(path.join(ENGINE, LOG.SHARDS), { recursive: true, force: true });
fs.rmSync(path.join(ENGINE, LOG.LOG), { force: true });
LOG.append(ENGINE, kept, { single: true });

console.log("REMOVED " + bad.size + " tombstones the ingest wrote against facts it never produced");
console.log("  events: " + events.length + " → " + kept.length);
console.log("  the log as it was: " + path.basename(archive));
