#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/areas.js . BUILD THE AREA REGISTER
//   node tools/areas.js [--project <folder>] [--out areas.json]
//
// Puts the three sources of truth about the floor side by side — the pin
// pack's outlines, the drawing's labelled polygons, and the names the
// design team gave the renders they delivered — and writes the register
// the whole plan hangs on.
//
// It decides nothing. It proposes names with the evidence for each, counts
// which areas more than one pin can see, and raises where the pack and the
// drawing disagree. Every one of those is for a person.
// ===================================================================
const fs = require("fs"), path = require("path");
const A = require(path.join(__dirname, "../platform/core/areas.js"));

const args = process.argv.slice(2);
const arg = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
const ENGINE = path.join(__dirname, "../engines/skf");
const PROJECT = arg("--project", null);
const OUT = arg("--out", path.join(ENGINE, "areas.json"));

const pins = JSON.parse(fs.readFileSync(path.join(ENGINE, "pins.json"), "utf8"));
const facts = JSON.parse(fs.readFileSync(path.join(ENGINE, "facts.json"), "utf8"));

// WHAT THE DESIGN TEAM CALLED THE PIN. The brief asked for P01.jpg to
// P81.jpg and no suffixes; what came back carries the room name on many of
// them. That is not protocol drift to be scolded, it is evidence — the
// people who modelled the floor naming the place they stood in.
const folder = PROJECT || (facts.folder || "");
// FIND THE RENDER FOLDER RATHER THAN ASSUME ITS NAME. The mirror carries
// the Drive folder names verbatim — "13 Site Tracking", with a space and no
// hyphen — and a hard-coded path silently finds nothing and reports zero
// renders delivered, which reads as the design team not having sent them.
function findRenders(root) {
  if (!root || !fs.existsSync(root)) return null;
  const hit = fs.readdirSync(root).find(n => /site.?tracking/i.test(n));
  if (!hit) return null;
  const inner = path.join(root, hit);
  const three = fs.readdirSync(inner).find(n => /^3\s*d$/i.test(n) || /render/i.test(n));
  return three ? path.join(inner, three) : null;
}
const threeD = findRenders(folder);
const renderNames = {}, delivered = {}, offProtocol = [];
if (threeD && fs.existsSync(threeD)) {
  for (const f of fs.readdirSync(threeD)) {
    const m = /^P\s*(\d+)\s*(.*)\.(png|jpe?g)$/i.exec(f);
    if (!m) { offProtocol.push({ file: f, why: "the name does not start with a pin number" }); continue; }
    const no = Number(m[1]), suffix = m[2].trim();
    delivered[no] = f;
    if (suffix) renderNames[no] = suffix;
    if (suffix || !/^jpe?g$/i.test(m[3]))
      offProtocol.push({ file: f, pin: no,
        why: [suffix ? "carries the suffix \"" + suffix + "\"" : null,
              /^png$/i.test(m[3]) ? "is a .png where the brief asked for .jpg" : null]
             .filter(Boolean).join(" and ") });
  }
}
const missing = [];
for (const p of pins.pins) if (!delivered[p.no]) missing.push(p.no);

let reg = A.register(pins.spaces, facts.geometry, pins.pins, { renderNames });

// NAMES A PERSON HAS SETTLED. Kept in their own file, applied on top of the
// register, never written back into the pin pack — so the pack stays the
// frozen record of what was surveyed and this stays the record of what was
// decided, with both readable side by side.
const NAMES = path.join(ENGINE, "area_names.json");
let decisions = {};
if (fs.existsSync(NAMES)) { try { decisions = JSON.parse(fs.readFileSync(NAMES, "utf8")); } catch (e) {} }
const applied = A.apply(reg, decisions);
if (applied.applied.length || applied.refused.length) reg = applied;

const proposals = A.proposals(reg);
const witnesses = A.witnesses(reg);
const disagreements = A.reconcile(reg);

const out = {
  builtAt: new Date().toISOString(),
  from: { pins: "pins.json", drawing: facts.folder || null, renders: threeD || null },
  counts: { areas: reg.areas.length, named: reg.named, unnamed: reg.unnamed,
            guessed: reg.guessed, sqft: reg.sqft, unnamedSqft: reg.unnamedSqft,
            seenByMoreThanOnePin: witnesses.multi.length, seenByNoPin: witnesses.blind.length },
  // the outlines are large; the app already has them in pins.json
  areas: reg.areas.map(a => ({ id: a.id, name: a.name, named: a.named, type: a.type,
    // WHAT IT USED TO BE CALLED, kept so the frozen pin pack still resolves.
    // The pack says pin 44 stands in "Unnamed Space 11"; the register says
    // that place is now Dry Pantry. One of the two has to carry the join.
    wasCalled: a.wasCalled || null, namedBy: a.namedBy || null, namedWhy: a.namedWhy || null,
    guessed: a.guessed, sqft: a.sqft, pins: a.pins,
    labels: a.labels.map(l => ({ label: l.label, verdict: l.verdict, shared: l.shared, polygon: l.polygon })),
    renderSays: a.renderSays })),
  proposals, witnesses, disagreements,
  decided: reg.applied || [], refusedNames: reg.refused || [],
  renders: { expected: pins.pins.length, delivered: Object.keys(delivered).length,
             missing, offProtocol },
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

const c = out.counts;
console.log("THE FLOOR");
console.log("  " + c.areas + " areas, " + c.sqft.toLocaleString("en-IN") + " sqft");
console.log("  " + c.named + " named, " + c.unnamed + " unnamed (" + c.unnamedSqft.toLocaleString("en-IN") + " sqft)");
console.log("  " + c.guessed + " outlines the pin pack marks as guessed");
if ((reg.applied || []).length) {
  console.log("\nNAMES A PERSON HAS SETTLED");
  reg.applied.forEach(a => console.log("  " + a.was + "  ->  " + a.now));
}
(reg.refused || []).forEach(r => console.log("  REFUSED " + r.id + ": " + r.why));
console.log("\nNAMES");
const withCand = proposals.filter(p => p.candidates.length);
console.log("  " + withCand.length + " of " + proposals.length + " unnamed areas have a candidate from the drawing or a render");
withCand.forEach(p => console.log("    " + p.area + " (" + p.sqft + " sqft) -> " +
  p.candidates.map(x => x.name + " [" + x.conf + "]").join(" | ")));
const none = proposals.filter(p => !p.candidates.length);
if (none.length) console.log("  " + none.length + " nothing in the drawing or the renders names — a person has to:\n    " +
  none.map(p => p.area + " (" + p.sqft + ")").join(", "));
console.log("\nWITNESSES\n  " + witnesses.why);
console.log("\nPACK AGAINST DRAWING\n  " + (disagreements.length
  ? disagreements.length + " areas where the two disagree by more than 10%"
  : "no area where the two disagree by more than 10%"));
disagreements.slice(0, 6).forEach(d => console.log("    " + d.area + ": pack " + d.pack + " vs drawing " + d.drawing + " (" + d.offBy + ")"));
console.log("\nRENDERS\n  " + out.renders.delivered + " of " + out.renders.expected + " delivered" +
  (missing.length ? ", missing " + missing.join(", ") : ""));
if (offProtocol.length) console.log("  " + offProtocol.length + " do not follow the brief's naming — read anyway, and their suffixes used as evidence");
console.log("\n→ " + OUT);
