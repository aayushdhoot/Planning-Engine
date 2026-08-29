#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/rekey.js . A ONE-TIME MIGRATION OF THE LOG'S KEYS
//   node tools/rekey.js
//
// The identity of a fact was the document, the place in it, and what it
// said — and it should always have carried the SUBJECT too. Without it,
// two statements from one place collapsed into one: a polygon labelled
// both LADIES RESTROOM and GENTS RESTROOM became a single area, and the
// agreement's Company and Contractor became a single owner.
//
// This rewrites every event's key from its own value, changing nothing
// else. The old log is kept beside the new one, because a migration that
// cannot be checked afterwards is a migration nobody should trust.
// ===================================================================
const fs = require("fs"), path = require("path");
const LOG = require(path.join(__dirname, "../platform/core/log.js"));
const SPINE = require(path.join(__dirname, "../platform/core/spine.js"));
const ENGINE = path.join(__dirname, "../engines/skf");

const events = LOG.read(ENGINE);
if (!events.length) { console.log("nothing on the log"); process.exit(0); }

const before = new Set(events.map(e => e.key)).size;
const rekeyed = events.map(e => {
  if (e.kind !== "fact.record") return e;
  const key = LOG.identity(e.value);
  if (key === e.key) return e;
  // a new id, because the id is a hash of the event and the event changed
  const { id, ...rest } = e;
  return SPINE.makeEvent(e.kind, key, e.value,
    { ts: e.ts, actor: e.actor, seq: e.seq, source: e.source, project: e.project });
});
const after = new Set(rekeyed.map(e => e.key)).size;

// keep the old, whole, beside the new
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const archive = path.join(ENGINE, "events.pre-rekey-" + stamp + ".jsonl");
fs.writeFileSync(archive, events.map(e => JSON.stringify(e)).join("\n") + "\n");

fs.rmSync(path.join(ENGINE, LOG.SHARDS), { recursive: true, force: true });
fs.rmSync(path.join(ENGINE, LOG.LOG), { force: true });
LOG.append(ENGINE, rekeyed, { single: true });

console.log("REKEYED " + events.length + " events");
console.log("  distinct keys: " + before + "  →  " + after +
  "   (" + (after - before) + " facts that were colliding are now separate)");
console.log("  the log as it was: " + path.basename(archive));
