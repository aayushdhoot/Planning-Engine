// ===================================================================
// DnB-OS . platform/core/entail.js . WHAT THE COVER PROVES
// Half the work on a fit-out is buried by the work that follows it. The
// conduit and the rockwool go inside the partition; the duct, the sprinkler
// main and the data cabling go above the ceiling; the waterproofing goes
// under the screed. A camera standing in the finished room can never see
// any of it — 493 of 931 answers about conduit on this project are
// "cannot_tell" — and an engine that scores what it cannot see as NOT DONE
// reports a completed trade as untouched for the rest of the job.
//
// But the cover is itself the proof. YOU CANNOT BOARD A PARTITION THAT HAS
// NO FRAME IN IT, you cannot plaster a wall that was never built, and a
// ceiling tile does not sit in mid-air. Where the covering work is seen at
// a stage it could not have reached with the hidden work outstanding, the
// hidden work is done — and saying so is not a guess, it is reading the
// evidence that is actually visible.
//
//   RULES              cover + stage -> what that proves, declared
//   entailedBy(item, seen)   what proves this item at this pin, if anything
//
// THE LAWS
//   . THE COVER MUST BE PAST THE POINT OF NO RETURN. A partition with one
//     face on proves the frame, because you cannot board air. It does NOT
//     prove the conduit, because the second face is still open and the
//     electrician has not finished. Every rule names the exact stage, and
//     the stage is the whole rule.
//   . THE CAMERA WINS WHERE THE CAMERA CAN SEE. This only ever fills a
//     "cannot_tell" or a missing answer. Where somebody looked and said no,
//     that stands — inferring over a definite observation is how an engine
//     starts arguing with the site.
//   . ONE PIN, ONE ROOM. A closed ceiling in the boardroom proves the
//     boardroom's ductwork and nothing about the cafeteria. Entailment
//     travels no further than the cover it was read from.
//   . IT IS DERIVED, AND IT SAYS SO. An entailed item is never "observed".
//     It carries the cover that proved it, the stage, and a confidence —
//     high where the cover is physically impossible without it, medium
//     where it is strong practice that a determined site could break.
//
// Pure: observations in, entailments out. No clock, no I/O, no model.
// ===================================================================

;(function (root) {

const CHK = (typeof require !== "undefined")
  ? require("../signals/checklist.js") : root.SIGNAL_CHECKLIST;

// ---- the declared rules -------------------------------------------------
// cover      the item a camera CAN see
// from       the stage at or beyond which the entailment holds
// proves     what its presence at that stage puts beyond doubt
// confidence high  = the cover cannot physically exist without it
//            medium = it is how the trade always works, and a site could
//                     in principle have left it out and be storing trouble
const RULES = [
  // ---- partitions ------------------------------------------------------
  { cover: "board_one_side", from: "in_progress", confidence: "high",
    proves: ["stud_frame"],
    why: "boarding is screwed to a frame — a board on one face means the frame is up" },
  { cover: "gypsum_board", from: "in_progress", confidence: "high",
    proves: ["stud_frame", "board_one_side"],
    why: "the same frame, and the first face, are behind any board that is up" },
  // THE SECOND FACE IS THE POINT OF NO RETURN. Until it goes on, the
  // electrician and the insulation man are still working inside the wall —
  // so a partition in progress proves the frame and NOTHING about the
  // services in it. Closed is the moment that changes.
  { cover: "gypsum_board", from: "complete", confidence: "high",
    proves: ["conduit", "wiring", "insulation", "plumbing_line"],
    why: "a partition closed on both faces cannot be closed over missing conduit, cable or rockwool — " +
         "the trades inside it are done or they are walled in" },

  // ---- civil -----------------------------------------------------------
  { cover: "plaster", from: "substrate", confidence: "high",
    proves: ["blockwork"],
    why: "there is nothing to plaster until the wall is built" },
  { cover: "paint", from: "substrate", confidence: "high",
    proves: ["plaster"],
    why: "paint is prepared onto finished plaster — the substrate stage IS the plaster signed off" },
  { cover: "wall_finish", from: "substrate", confidence: "high",
    proves: ["plaster", "blockwork"],
    why: "a wall finish is fixed to a plastered, built wall" },
  { cover: "screed", from: "complete", confidence: "medium",
    proves: ["waterproofing", "conduit", "plumbing_line"],
    why: "in a wet area the screed goes over the membrane, and floor conduit and drainage run under it. " +
         "Medium because a dry area needs no membrane and the engine cannot tell which room it is standing in" },
  { cover: "flooring_finish", from: "substrate", confidence: "high",
    proves: ["screed"],
    why: "a floor finish is laid on a level screed — the substrate stage IS the screed accepted" },

  // ---- above the ceiling ------------------------------------------------
  { cover: "ceiling_tile", from: "in_progress", confidence: "high",
    proves: ["ceiling_grid"],
    why: "a tile drops into a grid; there is no other way it stays up" },
  // A CLOSED CEILING IS THE LARGEST SINGLE ACT OF BURIAL ON A FIT-OUT.
  // Everything in the void is behind it, and no camera on this floor will
  // ever see any of it again.
  { cover: "ceiling_tile", from: "complete", confidence: "medium",
    proves: ["duct", "duct_insulation", "copper_piping", "sprinkler_pipe",
             "data_cabling", "cable_tray", "conduit", "wiring", "indoor_unit"],
    why: "a ceiling is not closed until the void above it is signed off — services in, tested and " +
         "hung. Medium rather than high because a tile can be lifted, so a site CAN close ahead of " +
         "a snag, and this is exactly the case worth a spot check" },

  // ---- carpentry --------------------------------------------------------
  { cover: "joinery_finish", from: "installed", confidence: "high",
    proves: ["carcass"],
    why: "a finish is fixed to a carcass" },
];

// ---- is a stage at or beyond another, on its own ladder? ----------------
function atOrBeyond(item, stage, from) {
  if (!stage) return false;
  const it = CHK.BY_ID[item];
  const ladder = (CHK.LADDER || {})[(it && it.ladder) || "buildup"] || [];
  const a = ladder.indexOf(stage), b = ladder.indexOf(from);
  if (a === -1 || b === -1) return false;
  return a >= b;
}

// ---- what proves this item, at this pin ---------------------------------
// seen: { item -> observation }  for ONE pin on ONE day
// Returns null when nothing proves it, or the strongest proof there is.
function entailedBy(item, seen) {
  const out = [];
  for (const r of RULES) {
    if (r.proves.indexOf(item) === -1) continue;
    const o = (seen || {})[r.cover];
    if (!o || o.answer !== "yes") continue;          // the cover has to be THERE
    if (!atOrBeyond(r.cover, o.stage, r.from)) continue;
    out.push({ item, by: r.cover, stage: o.stage, from: r.from,
      confidence: r.confidence, why: r.why });
  }
  if (!out.length) return null;
  // the strongest proof wins; a high-confidence cover beats a medium one
  out.sort((a, b) => (a.confidence === "high" ? 0 : 1) - (b.confidence === "high" ? 0 : 1));
  return out[0];
}

// every item any rule can prove — so a caller can ask cheaply
const PROVABLE = {};
RULES.forEach(r => r.proves.forEach(p => (PROVABLE[p] = PROVABLE[p] || []).push(r.cover)));

const E = { RULES, PROVABLE, atOrBeyond, entailedBy };
root.CORE_ENTAIL = E;
if (typeof module !== "undefined" && module.exports) module.exports = E;

})(typeof window !== "undefined" ? window : globalThis);
