#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/admit.js . LET IN WHAT WAS HELD
//   node tools/admit.js [--dry]
//
// A finding the address law could not place was kept on the log with the
// whole finding attached, not thrown away. This is why. The rooms have
// names now, so the addresses resolve, and 1,744 findings out of 27
// renders join the record without a single picture being read again.
//
// A finding that STILL will not address stays held, with the reason. It
// is not admitted on softer terms because it has been waiting a while.
// ===================================================================
const fs = require("fs"), path = require("path");
const LOG   = require(path.join(__dirname, "../platform/core/log.js"));
const ADDR  = require(path.join(__dirname, "../platform/signals/address.js"));
const CHK   = require(path.join(__dirname, "../platform/signals/checklist.js"));
const KINDS = require(path.join(__dirname, "../platform/ingest/kinds.js"));
const SPINE = require(path.join(__dirname, "../platform/core/spine.js"));

const DRY = process.argv.indexOf("--dry") >= 0;
const ENGINE = path.join(__dirname, "../engines/skf");

const pins  = JSON.parse(fs.readFileSync(path.join(ENGINE, "pins.json"), "utf8")).pins;
const areas = JSON.parse(fs.readFileSync(path.join(ENGINE, "areas.json"), "utf8")).areas;
const ctx = { pins, areas, items: CHK.ITEMS.map(i => i.id) };

const events = LOG.read(ENGINE);
// what is still held: a query.raise carrying a finding, with no later
// event admitting it
const admitted = new Set();
events.forEach(e => { if (e.kind === "expectation.set" || e.kind === "observation.record")
  admitted.add(e.value && e.value.__from); });
const held = events.filter(e => e.kind === "query.raise" && e.value && e.value.held && !admitted.has(e.id));

if (!held.length) { console.log("nothing is held"); process.exit(0); }

const TS = new Date().toISOString();
const out = [], stillHeld = [];
let byDoc = {};

for (const h of held) {
  const f = h.value.held;
  const r = ADDR.of({ family: "visual", item: f.item, day: h.value.day,
    pin: h.value.pin, answer: f.answer, stage: f.stage, count: f.count, why: f.why }, ctx);
  if (!r.ok) { stillHeld.push({ item: f.item, pin: h.value.pin, why: r.why }); continue; }
  const kind = KINDS.classify(h.value.doc).kind;
  byDoc[h.value.doc] = (byDoc[h.value.doc] || 0) + 1;
  out.push(SPINE.makeEvent(kind === "render" ? "expectation.set" : "observation.record", r.key,
    { ...f, address: r.address, kind, doc: h.value.doc, day: h.value.day,
      // WHERE IT CAME FROM, AND THAT IT WAITED. A finding admitted late is
      // not the same as one recorded on the day, and the record says so.
      __from: h.id, admittedOn: TS.slice(0, 10), heldSince: String(h.ts).slice(0, 10),
      admittedBecause: "the area it belongs to was named" },
    { ts: TS, actor: h.actor, seq: out.length, source: h.value.doc, project: "skf-pune-7f" }));
}

console.log("HELD FINDINGS: " + held.length);
console.log("  now addressable: " + out.length + " from " + Object.keys(byDoc).length + " documents");
console.log("  still held:      " + stillHeld.length);
const why = {}; stillHeld.forEach(s => why[s.why.slice(0, 70)] = (why[s.why.slice(0, 70)] || 0) + 1);
Object.entries(why).forEach(([w, n]) => console.log("      " + String(n).padStart(4) + "  " + w));

if (DRY) { console.log("\n--dry: nothing written"); process.exit(0); }
const n = LOG.append(ENGINE, out, { who: "admit" }).appended;
console.log("\n  " + n + " findings admitted to the record without re-reading a single picture");
