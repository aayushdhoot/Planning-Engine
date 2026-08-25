#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/readdoc.js . READ ONE DOCUMENT UNDER ITS OWN JUDGEMENT
//   node tools/readdoc.js <relative path> [--dry] [--project <folder>]
//
// The bridge that was missing. Everything before this either read a
// document with a general prompt — "tell me what is in it" — or did not
// read it at all. This decides what the document IS, builds the brief
// from the declared register and the closed checklist, runs it through
// the claude CLI already logged in on this terminal, types what comes
// back against the judgement's own authority, and appends it to the log.
//
// WHAT IT WILL NOT DO
//   . read a file the kind rules cannot place
//   . accept a finding the document has no authority over
//   . accept a finding with no provenance, or a checklist answer of
//     cannot_tell with no reason
//   . invent a day. An observation with no day is refused by address.js.
//
// --dry prints the brief and stops, so the prompt can be argued with
// before a single token is spent.
// ===================================================================
const fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");
const KINDS = require(path.join(__dirname, "../platform/ingest/kinds.js"));
const JDG   = require(path.join(__dirname, "../platform/signals/judgements.js"));
const ADDR  = require(path.join(__dirname, "../platform/signals/address.js"));
const CHK   = require(path.join(__dirname, "../platform/signals/checklist.js"));
const LOG   = require(path.join(__dirname, "../platform/core/log.js"));
const SPINE = require(path.join(__dirname, "../platform/core/spine.js"));

const args = process.argv.slice(2);
const arg = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
const DRY = args.indexOf("--dry") >= 0;
const ENGINE = path.join(__dirname, "../engines/skf");
const REL = args.filter(a => !a.startsWith("--"))[0];
if (!REL) { console.error("usage: node tools/readdoc.js <relative path> [--dry]"); process.exit(2); }

const facts = JSON.parse(fs.readFileSync(path.join(ENGINE, "facts.json"), "utf8"));
const PROJECT = arg("--project", facts.folder);
const file = path.join(PROJECT, REL);
if (!fs.existsSync(file)) { console.error("no such file: " + file); process.exit(2); }

// ---- what is it -------------------------------------------------------
const k = KINDS.classify(REL);
if (!k.kind) { console.error("NOT READ . " + REL + "\n  " + k.why); process.exit(1); }

// ---- the registers the address law checks against ---------------------
const pins  = JSON.parse(fs.readFileSync(path.join(ENGINE, "pins.json"), "utf8")).pins;
const areas = fs.existsSync(path.join(ENGINE, "areas.json"))
  ? JSON.parse(fs.readFileSync(path.join(ENGINE, "areas.json"), "utf8")).areas : [];
const ctx = { pins, areas, items: CHK.ITEMS.map(i => i.id) };

// ---- the brief --------------------------------------------------------
// Built from the law, never typed. For a picture the checklist is narrowed
// to what that pin's area could plausibly hold — a phone booth has no
// sanitaryware — but only where the register can say so; otherwise the
// whole list is asked, because a short list is how a finding goes missing.
const where = [k.pin ? "This is pin " + k.pin : null,
               k.pin ? (ADDR.resolve(k.pin, ctx).area ? "which stands in " + ADDR.resolve(k.pin, ctx).area : null) : null,
               k.day ? "taken on " + k.day : null].filter(Boolean).join(", ");
// A PHOTO IS JUDGED AGAINST THIS PIN'S FRAME, NEVER ON ITS OWN. The render
// already said what this exact view holds when the room is finished, and
// which items it can never resolve. Reading a site photo without that turns
// "the camera cannot see the duct" into "the duct is missing" — the one
// failure the whole expectation law exists to prevent.
let frame = null;
if (k.kind === "sitephoto" && k.pin != null) {
  const exp = LOG.read(ENGINE).filter(e => e.kind === "expectation.set" &&
    e.value && e.value.address && e.value.address.pin === k.pin);
  if (exp.length) {
    const will = exp.filter(e => e.value.answer === "yes")
      .map(e => "  " + e.value.item + (e.value.stage ? " (" + e.value.stage + " when done)" : "") +
                (e.value.count != null ? " x" + e.value.count : ""));
    const cannot = exp.filter(e => e.value.answer === "cannot_tell")
      .map(e => "  " + e.value.item + " — " + String(e.value.why || "").slice(0, 90));
    frame = ["THIS PIN'S FINISHED-STATE FRAME, from the 3D render shot to this exact position:",
      "WILL BE THERE when the room is done:", will.join("\n") || "  (nothing)",
      "", "THIS VIEW CANNOT RESOLVE THESE AT ALL — answer cannot_tell for them unless the",
      "site photo genuinely shows something the render could not:",
      cannot.join("\n") || "  (none)",
      "", "You are reading TODAY's photo, not the render. Say what is there NOW."].join("\n");
  }
}
const brief = JDG.promptFor(k.kind, { where: where || null, frame });
if (!brief.ok) { console.error("no judgement for " + k.kind + ": " + brief.why); process.exit(1); }

console.log("READING  " + REL);
console.log("  kind      " + k.kind + "  (" + k.why + ")");
if (k.pin) console.log("  pin       " + k.pin + (ADDR.resolve(k.pin, ctx).area ? " · " + ADDR.resolve(k.pin, ctx).area : ""));
if (k.day) console.log("  day       " + k.day);
console.log("  mode      " + brief.mode + ", brief is " + brief.prompt.length + " characters" +
  (frame ? "  (carrying this pin's finished-state frame)" : k.kind === "sitephoto" ? "  (NO FRAME — this pin has no render)" : ""));

if (DRY) { console.log("\n" + "-".repeat(70) + "\n" + brief.prompt + "\n" + "-".repeat(70)); process.exit(0); }

// ---- formats the reader cannot open are converted HERE ----------------
// A .docx is a zip of XML. Asking the model to open one and hoping it can
// shell out is how a document comes back as "I could not read this" after
// eighty seconds. Convert on this machine, then hand over plain text.
let readFile = file;
if (/\.docx?$/i.test(file)) {
  const txt = path.join(require("os").tmpdir(), "dnb-" + path.basename(file).replace(/\W+/g, "_") + ".txt");
  const c = spawnSync("textutil", ["-convert", "txt", "-stdout", file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (c.status === 0 && c.stdout && c.stdout.trim()) { fs.writeFileSync(txt, c.stdout); readFile = txt;
    console.log("  converted to plain text first (" + c.stdout.length + " characters)"); }
  else console.log("  WARNING could not convert it to text; the reader will try the original");
}

// ---- run it -----------------------------------------------------------
// THE CLOSED LIST IS ASKED IN GROUPS, NOT SHORTENED. Sixty-six items, each
// needing an answer, a stage, a count and a reason, is one generation long
// enough to hang — and it did, reliably, past ten minutes on a picture the
// model describes in ten seconds. Asking them fifteen at a time keeps every
// item asked, which is the whole point of a closed list; only the size of
// each breath changes. The coverage law still reports anything never asked.
const BATCH = Number(arg("--batch", 15));

// THE CALL IS FLAKY, SO IT IS GIVEN A SHORT LEASH AND A SECOND CHANCE.
// The same brief on the same picture answers in 35 seconds one minute and
// hangs past ten the next — measured, not guessed. A long timeout turns a
// hiccup into seven wasted minutes; a short one plus a retry turns it into
// forty seconds. Every attempt is counted, and a call that never answers is
// named rather than quietly leaving a gap in the checklist.
const TIMEOUT = Number(arg("--timeout", 150)) * 1000;
const TRIES = Number(arg("--tries", 3));
let calls = 0, retries = 0;

function runCLI(promptText) {
  let last = "no attempt was made";
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    calls++;
    if (attempt > 1) retries++;
    const r = spawnSync("claude", ["-p", promptText, "--allowedTools", "Read",
      "--output-format", "json", "--permission-mode", "acceptEdits"],
      { cwd: path.dirname(readFile), encoding: "utf8", timeout: TIMEOUT, maxBuffer: 32 * 1024 * 1024 });
    if (r.error) { last = (r.error.code || r.error.message) + " after " + (TIMEOUT / 1000) + "s"; continue; }
    if (r.status !== 0) { last = String(r.stderr || "exit " + r.status).slice(0, 160); continue; }
    let inner = r.stdout;
    try { const env = JSON.parse(r.stdout); if (env && env.result) inner = env.result; } catch (e) {}
    try { return { ok: true, reply: JSON.parse(String(inner).replace(/^[^{]*/, "").replace(/[^}]*$/, "")), attempt }; }
    catch (e) { last = "the answer was not JSON: " + String(inner).slice(0, 120); }
  }
  return { ok: false, why: last + "  (" + TRIES + " attempts)" };
}

const t0 = Date.now();
let reply = null;
const tail = "\n\nTHE FILE: " + path.basename(readFile) +
  "\nRead it with the Read tool. Answer as JSON only, no prose around it.";

if (brief.mode === "checklist") {
  const ids = CHK.ITEMS.map(i => i.id);
  const groups = [];
  for (let i = 0; i < ids.length; i += BATCH) groups.push(ids.slice(i, i + BATCH));
  const merged = { answers: [], unknown: [], ask: [] };
  const missed = [];
  console.log("  asking the checklist in " + groups.length + " groups of up to " + BATCH);
  for (let g = 0; g < groups.length; g++) {
    const b = JDG.promptFor(k.kind, { where: where || null, items: groups[g] });
    const got = runCLI(b.prompt + tail);
    if (!got.ok) { missed.push({ group: g + 1, items: groups[g], why: got.why });
      console.log("    group " + (g + 1) + "/" + groups.length + "  FAILED  " + String(got.why).slice(0, 60));
      continue; }
    (got.reply.answers || []).forEach(a => merged.answers.push(a));
    (got.reply.unknown || []).forEach(u => merged.unknown.push(u));
    (got.reply.ask || []).forEach(a => merged.ask.push(a));
    console.log("    group " + (g + 1) + "/" + groups.length + "  " + (got.reply.answers || []).length +
      " answered" + (got.attempt > 1 ? "  (attempt " + got.attempt + ")" : ""));
  }
  // A GROUP THAT FAILED IS NAMED, and its items are simply never asked — the
  // coverage law then reports the read as partial, which it is.
  if (missed.length) console.log("    " + missed.length + " group(s) did not answer: " +
    missed.map(m => m.items.length + " items").join(", "));
  if (!merged.answers.length) { console.error("  COULD NOT READ IT . no group answered"); process.exit(1); }
  reply = merged;
} else {
  const got = runCLI(brief.prompt + tail);
  if (!got.ok) { console.error("  COULD NOT READ IT . " + got.why); process.exit(1); }
  reply = got.reply;
}
const secs = ((Date.now() - t0) / 1000).toFixed(0);
if (retries) console.log("  " + retries + " of " + calls + " calls had to be retried");

// ---- type it against the judgement's own authority --------------------
const typed = JDG.receive(k.kind, reply);
console.log("  read in " + secs + "s");

const events = [];
const TS = new Date().toISOString();
const day = k.day || TS.slice(0, 10);

if (typed.mode === "checklist") {
  const cov = typed.coverage;
  console.log("\n  ANSWERED " + cov.asked + " of " + cov.total + " checklist items" +
    (cov.unasked.length ? "  (" + cov.unasked.length + " never asked — the read is partial and says so)" : ""));
  console.log("    yes " + cov.yes.length + " · no " + cov.no.length + " · cannot tell " + cov.cannot_tell.length +
    (cov.refused.length ? " · " + cov.refused.length + " refused" : ""));
  cov.refused.slice(0, 4).forEach(x => console.log("      REFUSED " + x.item + ": " + x.why));
  cov.yes.slice(0, 12).forEach(a => console.log("      yes  " + String(a.item).padEnd(18) +
    (a.stage ? a.stage : "") + (a.count != null ? "  x" + a.count : "")));
  if ((reply.unknown || []).length)
    console.log("    SAW SOMETHING THE LIST DOES NOT NAME: " + reply.unknown.slice(0, 5)
      .map(u => typeof u === "string" ? u : (u.item || u.name || JSON.stringify(u)).slice(0, 40)).join(" · "));

  // every answer needs an address before it joins the record
  const findings = cov.yes.concat(cov.no, cov.cannot_tell)
    .map(a => ({ family: "visual", item: a.item, day, pin: k.pin,
      answer: a.answer, stage: a.stage || null, count: a.count == null ? null : a.count, why: a.why || null }));
  const ad = ADDR.all(findings, ctx);
  console.log("    " + ad.why);
  ad.refused.slice(0, 3).forEach(x => console.log("      NO ADDRESS " + x.item + ": " + x.why.slice(0, 100)));

  // A FINDING THAT CANNOT BE ADDRESSED YET IS HELD, NOT DISCARDED. The read
  // cost real time; the only thing missing is a name somebody has to give.
  // It goes on the log as a question, carrying the whole finding, so naming
  // the room later admits it rather than requiring the document to be read
  // again.
  ad.refused.forEach((f, i) => events.push(SPINE.makeEvent("query.raise",
    ["held", REL, f.item].join("||"),
    { held: f, why: f.why, doc: REL, pin: k.pin, day,
      question: /has no name yet/.test(f.why)
        ? "What is the room at pin " + k.pin + " called? " +
          (reply.roomName ? 'The render calls it "' + reply.roomName + '".' : "") +
          " Until it has a name, this read is held rather than recorded."
        : f.why },
    { ts: TS, actor: "reader:" + k.kind, seq: 50000 + i, source: REL, project: "skf-pune-7f" })));

  ad.addressed.forEach((f, i) => events.push(SPINE.makeEvent(
    k.kind === "render" ? "expectation.set" : "observation.record", f.key,
    { ...f, kind: k.kind, doc: REL, authority: typed.authority[
      f.answer === "cannot_tell" ? "occlusion" : "present"] || "stated" },
    { ts: TS, actor: "reader:" + k.kind, seq: i, source: REL, project: "skf-pune-7f" })));
} else {
  console.log("\n  FOUND " + typed.found.length + " signals" +
    (typed.refused.length ? ", " + typed.refused.length + " refused" : "") +
    (typed.notFound.length ? ", " + typed.notFound.length + " sought and not found" : ""));
  typed.found.slice(0, 14).forEach(f => console.log("      " + String(f.signal).padEnd(12) +
    String(f.subject || "").slice(0, 34).padEnd(36) + String(f.value).slice(0, 26) +
    "  [" + f.conf + "]  " + String(f.where).slice(0, 30)));
  typed.refused.slice(0, 4).forEach(f => console.log("      REFUSED " + f.signal + ": " + f.why));
  typed.notFound.slice(0, 6).forEach(f => console.log("      not found: " + f.signal +
    (f.lookedIn ? " (looked in " + f.lookedIn + ")" : "")));
  (typed.ask || []).slice(0, 4).forEach(a => console.log("      ASKS: " + (a.why || a.question || JSON.stringify(a)).slice(0, 110)));

  // the same identity law the ingest keeps — the subject is part of it
  typed.found.forEach((f, i) => events.push(SPINE.makeEvent("fact.record",
    LOG.identity({ subject: f.subject, role: f.signal, source: { doc: REL, where: String(f.where) } }),
    { kind: "term", subject: f.subject, role: f.signal, value: f.value, unit: f.unit || null,
      conf: f.conf, day, source: { doc: REL, where: String(f.where), read: f.signal } },
    { ts: TS, actor: "reader:" + k.kind, seq: i, source: REL, project: "skf-pune-7f" })));
}

const n = LOG.append(ENGINE, events, { who: "reader-" + process.pid }).appended;
console.log("\n  " + n + " events appended to the log");
