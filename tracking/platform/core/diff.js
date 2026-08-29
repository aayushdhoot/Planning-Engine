// ===================================================================
// DnB-OS . platform/core/diff.js . EXPECTED AGAINST OBSERVED
// Phase 8. The expectation says what a camera should be showing. The
// reading says what it did show. This law puts them side by side and
// returns a verdict per pin per day . deterministically, with no
// opinion of its own.
//
//   READ_WORDS              the site's reading words -> task codes
//   codeFor(work)           one word, mapped or honestly null
//   pin(expectation, obs)   the verdict for one pin on one day
//   day(expectations, reads) every pin, plus the day's rollup
//   contradictions(dayOut)  the ones that go straight to the queries
//
// THE VERDICTS
//   seen          expected to be under way, and it was
//   not_seen      expected, and the camera could resolve it, and it
//                 was not there
//   early         seen, but not due to start yet . good news or a
//                 sequence violation, and somebody should look
//   unplanned     seen, and the plan has no such work in this zone
//   contradiction seen, but the plan says it is COVERED OVER and no
//                 camera can resolve it. Either the reading is wrong or
//                 the plan is. The engine will not choose; it asks.
//
// THE LAWS
//   . a word the engine cannot map is REPORTED, never guessed into a
//     task. A diff that silently drops a reading reads as an absence,
//     which is the most damaging shape this can take.
//   . work the pin CANNOT RESOLVE is never scored not_seen. That is the
//     whole reason the expectation carries a third list.
//   . a contradiction is never resolved by the engine. It names both
//     sides and becomes a question, because guessing which one is wrong
//     is exactly the judgement a human is for.
//   . the verdict is derived. Nothing here is stored, so a revision or
//     a re-read cannot leave a stale verdict behind.
//
// Pure: an expectation and a reading in, a verdict out.
// ===================================================================

;(function (root) {

// The reader's words, mapped to the codes the plan uses. Declared here,
// so adding a word is one line and never a code change anywhere else.
const READ_WORDS = {
  "aac blockwork": "blockwork", "blockwork": "blockwork", "masonry": "blockwork",
  "plaster": "plaster", "putty": "plaster", "punning": "plaster",
  "floor screed": "screed", "screed": "screed", "self leveling": "screed",
  "waterproofing": "waterproofing",
  "drywall partition": "gi_stud_frame", "partitions and ceiling": "gi_stud_frame",
  "gypsum partition": "board_one_face", "partition boarding": "board_one_face",
  "ceiling framing": "ceiling_gypsum", "ceiling prep": "ceiling_gypsum",
  "gypsum false ceiling": "ceiling_gypsum", "false ceiling": "ceiling_gypsum",
  "grid ceiling": "ceiling_grid_tile",
  "hvac ducting": "duct_gi", "ducting": "duct_gi", "duct insulation": "duct_insulation",
  "fire sprinkler piping": "sprinkler_pipe", "sprinkler piping": "sprinkler_pipe",
  "sprinkler heads": "sprinkler_head",
  "electrical first fix": "conduit", "conduiting": "conduit", "floor trenching": "conduit",
  "cable pulling": "cable_pull", "cable trays": "cable_tray",
  "electrical panels": "db_panel",
  "plumbing": "plumbing_first_fix", "sanitary": "plumbing_second_fix",
  "glass partition": "glazing_partition", "glazing": "glazing_partition",
  "floor tiling": "tile_vitrified", "tiling": "tile_vitrified",
  "carpet": "carpet_tile", "carpet tiles": "carpet_tile",
  "column cladding": "joinery_panel", "veneer": "joinery_panel", "panelling": "joinery_panel",
  "painting": "paint_emulsion", "paint": "paint_emulsion",
  "workstations": "workstation", "loose furniture": "workstation",
  "civil debris clearing": "demo_partition", "demolition": "demo_partition",
  "deep cleaning": "final_clean", "cleaning": "final_clean",
};

function codeFor(work) {
  const k = String(work == null ? "" : work).trim().toLowerCase();
  if (!k) return null;
  if (READ_WORDS[k]) return READ_WORDS[k];
  for (const w of Object.keys(READ_WORDS)) if (k.indexOf(w) !== -1) return READ_WORDS[w];
  return null;
}

// states a reading can carry that mean "this work is physically here"
const PRESENT = { ongoing: 1, started: 1, done: 1, no_change: 1, blocked: 1 };
// material on site is NOT the work happening
const NOT_WORK = { material_present: 1 };

// ---- one pin, one day -----------------------------------------------
function pin(exp, obs) {
  if (!exp) return null;
  const items = (obs && obs.items) || [];
  const unmappedWords = [];
  const seenCodes = {};
  for (const it of items) {
    if (!it || NOT_WORK[it.state]) continue;
    if (!PRESENT[it.state]) continue;
    const c = codeFor(it.work);
    if (!c) { unmappedWords.push(it.work); continue; }
    // the strongest sighting of a code wins
    if (!seenCodes[c] || it.state === "done") seenCodes[c] = it;
  }

  const rows = [];
  if (exp.unmapped) {
    return { pin: exp.pin, zone: null, unmapped: true, rows: [], unmappedWords,
      counts: { seen: 0, not_seen: 0, early: 0, unplanned: 0, contradiction: 0 },
      read: items.length > 0 };
  }

  const expCodes = {};
  for (const x of exp.shouldSee)     expCodes[x.code] = "shouldSee";
  for (const x of exp.mustNotSee)    expCodes[x.code] = "mustNotSee";
  for (const x of exp.cannotResolve) expCodes[x.code] = "cannotResolve";

  // everything the plan expects to be visible
  for (const x of exp.shouldSee) {
    const hit = seenCodes[x.code];
    rows.push({ code: x.code, name: x.name, verdict: hit ? "seen" : "not_seen",
      state: hit ? hit.state : null, note: hit ? (hit.note || null) : null,
      why: hit ? null : "the plan has this under way and the camera did not show it" });
  }
  // work not due yet, but visible
  for (const x of exp.mustNotSee) {
    const hit = seenCodes[x.code];
    if (!hit) continue;
    rows.push({ code: x.code, name: x.name, verdict: "early", state: hit.state, note: hit.note || null,
      why: "not due to start until " + x.dueFrom + ", and the camera showed it" });
  }
  // THE CONTRADICTION. The plan says this is covered over and no camera
  // can resolve it, and a reader says they saw it. One of the two is
  // wrong and the engine will not pick.
  for (const x of exp.cannotResolve) {
    const hit = seenCodes[x.code];
    if (!hit) continue;
    rows.push({ code: x.code, name: x.name, verdict: "contradiction", state: hit.state,
      note: hit.note || null, hiddenBy: x.hiddenBy,
      why: "the plan has this covered by " + x.hiddenBy + ", so no camera should resolve it, "
         + "and the read says it is visible. Either " + x.hiddenBy + " is not really finished, "
         + "or the read is wrong." });
  }
  // seen, and the plan has nothing like it in this zone
  for (const c of Object.keys(seenCodes)) {
    if (expCodes[c]) continue;
    rows.push({ code: c, name: c, verdict: "unplanned", state: seenCodes[c].state,
      note: seenCodes[c].note || null,
      why: "the plan has no such work in this zone" });
  }

  const counts = { seen: 0, not_seen: 0, early: 0, unplanned: 0, contradiction: 0 };
  for (const r of rows) counts[r.verdict] = (counts[r.verdict] || 0) + 1;

  return { pin: exp.pin, zone: exp.zone, unmapped: false, rows, counts,
    unmappedWords, read: items.length > 0,
    // never scored against: the whole point of the third list
    unresolvable: exp.cannotResolve.length };
}

// ---- a whole day -----------------------------------------------------
// expectations: the compile() output. reads: [{pin, items}]
function day(compiled, reads, dayISO) {
  const byPin = {}, all = [];
  const readBy = {};
  for (const r of (reads || [])) if (r && r.pin != null) readBy[r.pin] = r;

  for (const no of Object.keys((compiled && compiled.byPin) || {})) {
    const v = pin(compiled.byPin[no], readBy[no] || null);
    if (!v) continue;
    byPin[no] = v; all.push(v);
  }

  const counts = { seen: 0, not_seen: 0, early: 0, unplanned: 0, contradiction: 0 };
  const words = {};
  let read = 0, dark = 0, unmapped = 0;
  for (const v of all) {
    if (v.unmapped) unmapped++;
    if (v.read) read++; else dark++;
    for (const k of Object.keys(counts)) counts[k] += (v.counts[k] || 0);
    for (const w of v.unmappedWords) words[w] = (words[w] || 0) + 1;
  }

  return { day: dayISO || (compiled && compiled.day) || null, byPin, counts,
    pins: all.length, read, dark, unmapped,
    unmappedWords: Object.keys(words).sort().map(w => ({ word: w, times: words[w] })) };
}

// ---- what goes straight to the queries -------------------------------
function contradictions(d) {
  const out = [];
  for (const no of Object.keys((d && d.byPin) || {})) {
    for (const r of d.byPin[no].rows) {
      if (r.verdict !== "contradiction") continue;
      out.push({ id: "DIFF-" + no + "-" + r.code, blocking: false, pin: Number(no),
        zone: d.byPin[no].zone, about: r.name, hiddenBy: r.hiddenBy,
        question: "Pin " + no + " on " + d.day + ": " + r.why + " Which is it?" });
    }
  }
  return out;
}

// one plain sentence for a digest
function line(d) {
  if (!d || !d.pins) return "No pins to read.";
  const c = d.counts;
  const bits = [c.seen + " as expected"];
  if (c.not_seen) bits.push(c.not_seen + " expected and not shown");
  if (c.early) bits.push(c.early + " ahead of the plan");
  if (c.unplanned) bits.push(c.unplanned + " the plan does not carry");
  if (c.contradiction) bits.push(c.contradiction + " contradicting the plan");
  return d.read + " of " + d.pins + " pins read · " + bits.join(", ") + ".";
}

const DIFF = { READ_WORDS, PRESENT, codeFor, pin, day, contradictions, line };
root.CORE_DIFF = DIFF;
if (typeof module !== "undefined" && module.exports) module.exports = DIFF;

})(typeof window !== "undefined" ? window : globalThis);
