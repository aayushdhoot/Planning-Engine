#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/inline-design.js . KEEP THE PAGE AND THE MODULE THE SAME
//   node tools/inline-design.js
//
// engines/skf/index.html carries its platform modules pasted in, because it
// is one file that opens with no build step. That is a good property and a
// dangerous one: the moment a module is edited in platform/ and not in the
// page, the two drift, and the page keeps running the older copy while every
// test that reads the platform file passes.
//
// This is the one command that makes them the same. It replaces the inlined
// copy of platform/report/design.js in the page with whatever that file now
// says, matching on the module's own header line rather than on line numbers.
//
// THE LAWS
//   . THE PAGE IS THE COPY, THE PLATFORM FILE IS THE ORIGINAL. This only ever
//     writes into the page, never back into the module.
//   . IT REFUSES RATHER THAN GUESSES. If the marker is not found exactly once
//     it changes nothing and says so, because a partial replace would leave
//     two halves of two versions in one script tag.
// ===================================================================
const fs = require("fs"), path = require("path");

const ROOT = path.join(__dirname, "..");
const MOD = path.join(ROOT, "platform/report/design.js");
const PAGE = path.join(ROOT, "engines/skf/index.html");
const MARK = "// DnB-OS . platform/report/design.js . THE REPORT DESIGN LANGUAGE";

const mod = fs.readFileSync(MOD, "utf8");
let page = fs.readFileSync(PAGE, "utf8");

// the inlined copy runs from its header's opening comment to the end of its
// IIFE, which is the line that closes it. Both are unique to this module.
const START = "// ===================================================================\n" + MARK;
const END = "})(typeof window !== \"undefined\" ? window : globalThis);\n";

// THE MODULE MUST BE EXACTLY THE THING BEING PASTED. This tool finds the
// region to replace by searching for the IIFE close, but writes the whole
// module file over it. Those are the same span only while the module starts at
// its header and ends at that line. Let it end anywhere else and each run
// appends the tail again, so the page grows a duplicate every build — and the
// byte-for-byte law in the render suite would fail forever with no way to
// satisfy it. Refuse instead, and say which end is wrong.
if (!mod.startsWith(START)) {
  console.error("  the module does not begin with its own header — nothing changed");
  process.exit(2); }
if (!mod.endsWith(END)) {
  console.error("  the module does not end at its IIFE close — nothing changed");
  console.error("  it carries " + JSON.stringify(mod.slice(mod.lastIndexOf(END) + END.length)
    .slice(0, 60)) + " after it, and that cannot be pasted safely");
  process.exit(2); }

const s = page.indexOf(START);
if (s < 0) { console.error("  the inlined copy was not found — nothing changed"); process.exit(2); }
if (page.indexOf(START, s + 1) >= 0) {
  console.error("  the marker appears more than once — nothing changed"); process.exit(2); }
const e = page.indexOf(END, s);
if (e < 0) { console.error("  the end of the inlined copy was not found — nothing changed"); process.exit(2); }

const was = page.slice(s, e + END.length);
if (was === mod) { console.log("\n  the page already carries this module, byte for byte\n"); process.exit(0); }

page = page.slice(0, s) + mod + page.slice(e + END.length);
fs.writeFileSync(PAGE, page);

const lines = (t) => t.split("\n").length;
console.log("\n  INLINED  platform/report/design.js → engines/skf/index.html");
console.log("    was " + lines(was) + " lines, now " + lines(mod) + " lines");
console.log("    the page and the module are the same again\n");
