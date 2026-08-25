// ===================================================================
// DnB-OS . platform/kb/precedence.js . WHAT THE SITE PROVES ABOUT ITSELF
//
// The programme reported temporary lighting at 0% and 100 points behind on
// a floor where eleven site walks had been photographed indoors, at night,
// while plasterers worked. It reported demolition not started on a floor
// carrying new blockwork, new partitions and a new screed. It reported the
// line-out marking as not begun against walls that were already built to it.
//
// None of that was a reading. It was the absence of one. No camera can
// photograph a demolition that finished in June, and no render of a finished
// room shows the temporary lights that will be taken down before handover.
// The engine had a rule for work buried behind a cover (entail.js) and no
// rule at all for work buried behind TIME.
//
// This is that rule, and it is the oldest reasoning on a building site:
//
//     YOU CANNOT DO B IF A WAS NOT DONE. SO IF B IS HAPPENING, A IS DONE.
//
// A senior engineer walking this floor would not say "I cannot comment on
// the demolition". They would say "there is new blockwork on this slab, so
// obviously the old fit-out came out". This module says that, says how sure
// it is, says what it saw that convinced it — and every figure it produces
// is marked on the screen and can be overruled in one click, because an
// inference a person cannot correct is just a lie with a citation.
//
//   RULES        enabling work, and what proves it
//   inferFor()   one code -> {pct, confidence, why, from} or null
//
// THE LAWS
//   . AN INFERENCE IS NEVER A MEASUREMENT. It carries its own confidence,
//     it is marked wherever it is shown, and a human answer replaces it.
//   . THE PROOF IS NAMED. Not "assumed complete" but "ducting is 57% and
//     sprinkler mains 37%, and neither goes through a slab nobody cored".
//   . NOTHING IS INFERRED FROM NOTHING. A trigger has to be OBSERVED, above
//     a stated threshold. A floor where nothing has started proves nothing.
//   . ONLY ENABLING WORK. Work that could simply have been skipped, or that
//     is genuinely still to come, is never inferred. If it can be left out
//     and the job still gets to where it is, this module stays quiet.
//
// Pure: observations in, inferences out. No clock, no I/O, no model.
// ===================================================================

;(function (root) {

// `of`        the package being inferred
// `needs`     codes whose observed progress proves it. ANY of them, because
//             one is enough — you cannot plaster over an undemolished wall
//             whether or not anybody also screeded the floor.
// `atLeast`   the trigger's own observed per cent, below which this stays
//             quiet. A floor at 3% proves nothing about anything.
// `gives`     what the enabling work is then read at. Enabling work is not
//             partial: you do not half set out a floor and build on it.
// `confidence` high / medium / low, the same three levels as assume.js
// `say`       what a person would actually say, in one sentence
const RULES = [
  {
    of: "temporary_lighting", gives: 100, confidence: "high", atLeast: 10,
    needs: ["blockwork", "plaster", "board_close", "conduit", "duct_gi",
            "paint_emulsion", "putty_primer", "cable_pull", "ceiling_gypsum"],
    say: "there is finishing work going on inside this floor, and none of it happens " +
         "in the dark. The permanent supply is not energised until testing, so the " +
         "temporary board and the site lighting are up",
  },
  {
    of: "demo_partition", gives: 100, confidence: "high", atLeast: 15,
    needs: ["blockwork", "board_close", "plaster", "conduit", "self_leveling", "screed"],
    say: "there is new blockwork and new partitioning on this slab. None of it goes " +
         "up around the old fit-out, so the strip-out finished before it started",
  },
  {
    of: "demo_floor_finish", gives: 100, confidence: "high", atLeast: 15,
    needs: ["self_leveling", "screed", "floor_raceway", "waterproofing", "carpet_tile",
            "vinyl_lvt", "tile_vitrified", "raised_floor"],
    say: "the slab has been levelled and floor work has started on it, which cannot " +
         "happen over the finish that was there before",
  },
  {
    of: "lineout_marking", gives: 100, confidence: "high", atLeast: 15,
    needs: ["blockwork", "board_close"],
    say: "walls are built. Nobody builds a wall to a line that was never set out and " +
         "checked, so the marking was done and signed",
  },
  {
    of: "core_cut", gives: 100, confidence: "high", atLeast: 20,
    needs: ["cpvc_pipe", "sprinkler_pipe", "duct_gi", "refnet_pipe"],
    say: "pipework and ducting are running through this floor, and none of it crosses " +
         "a slab that was never cored and sleeved",
  },
  {
    // WEAKER ON PURPOSE. Anti-termite dosing is a certificate item on the bare
    // slab. It is the one thing on this list a job can genuinely skip or defer,
    // and the engine should ask rather than assume it away.
    of: "pest_control", gives: 100, confidence: "medium", atLeast: 25,
    needs: ["blockwork", "board_close", "self_leveling", "screed",
            "carpet_tile", "vinyl_lvt", "tile_vitrified"],
    say: "the walls are up and the slab is closing. Anti-termite dosing goes onto the " +
         "bare slab straight after strip-out, so by now it has either been done or the " +
         "window for it has gone. Worth a yes or no from site",
  },
  {
    of: "protection_covering", gives: 100, confidence: "medium", atLeast: 20,
    needs: ["carpet_tile", "vinyl_lvt", "tile_vitrified", "raised_floor", "epoxy_flooring"],
    say: "finished floors are down and the trades above them are still working, so " +
         "they are covered — nobody leaves a laid floor open on a live fit-out",
  },
  {
    // SCREED AND LEVELLING also have a cover rule in entail.js (a floor finish
    // proves its base). This catches the case where the finish is not down yet
    // but the raceways and first fix on top of it are.
    of: "self_leveling", gives: 100, confidence: "medium", atLeast: 30,
    needs: ["carpet_tile", "vinyl_lvt", "tile_vitrified", "raised_floor", "skirting"],
    say: "floor finishes are being laid, and they go onto a levelled base or they do " +
         "not go down at all",
  },
];

const BY_OF = {}; RULES.forEach(r => BY_OF[r.of] = r);

// ---- one code, against what the walk actually showed --------------------
// `seenPct` is a function: code -> observed per cent for that code on this
// day, or null where the camera had nothing to say. The caller owns it, so
// this module never touches a log, a frame or a file.
function inferFor(code, seenPct) {
  const r = BY_OF[code];
  if (!r) return null;
  const proof = [];
  for (const need of r.needs) {
    const p = seenPct(need);
    if (p == null || p < r.atLeast) continue;
    proof.push({ code: need, pct: p });
  }
  if (!proof.length) return null;
  proof.sort((a, b) => b.pct - a.pct);
  const shown = proof.slice(0, 3).map(p => p.code + " at " + p.pct + "%").join(", ");
  return {
    pct: r.gives,
    confidence: r.confidence,
    inferred: true,
    from: proof.map(p => p.code),
    why: r.say + ". Read from " + shown + " on this walk.",
    // what a person is being asked to agree with, in the popup
    claim: "the engine has taken this as " + r.gives + "% complete",
  };
}

// every code this module is willing to speak for
function codes() { return RULES.map(r => r.of); }

const PRECEDENCE = { RULES, BY_OF, inferFor, codes };
root.KB_PRECEDENCE = PRECEDENCE;
if (typeof module !== "undefined" && module.exports) module.exports = PRECEDENCE;

})(typeof globalThis !== "undefined" ? globalThis : this);
