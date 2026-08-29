// ===================================================================
// DnB-OS . platform/signals/register.js . WHAT WE ARE READING FOR
// A document is never read to "see what is in it". It is read for a
// purpose, and the purpose is written down first. This file is that
// declaration: every signal the engine hunts, what it is, which document
// kinds can answer it, and what stalls downstream when it is missing.
//
//   WORK       signals about building it: quantity, manpower, material,
//              timings, lead times, money, dependencies, dates
//   VISUAL     signals about seeing it: what should be there, at what
//              stage, with what marks, and what hides it
//   sought(kind)      which signals a document of this kind can answer
//   blocking(found)   what cannot be computed, and which signal is why
//
// THE LAWS
//   . THE LIST IS DECLARED, NOT DISCOVERED. Every signal is written here
//     where a person can read it and argue with it. A reader that comes
//     back with something not on this list has found something the
//     engine does not yet know how to use, and says so.
//   . A SIGNAL THAT WAS SOUGHT AND NOT FOUND IS AN ANSWER. "The programme
//     names no manpower" is information. An extract-everything reader can
//     only report what it found, and so can never tell you that the plan
//     is blocked . which is the only thing worth knowing on day one.
//   . EVERY SIGNAL DECLARES WHAT IT BLOCKS. A missing quantity is not a
//     tidiness problem, it is "no duration, no date, no cost". Saying so
//     is how a gap gets closed by the person who owns it.
//   . A VISUAL SIGNAL MUST TRACE TO A WORK SIGNAL. The engine only looks
//     for what the BOQ bought and the plan scheduled. Anything else seen
//     on site is UNPLANNED and becomes a question, never a tick.
//
// Pure: declarations and lookups. No clock, no I/O, no model.
// ===================================================================

;(function (root) {

// the document kinds a fit-out actually arrives as. A judgement exists
// per kind (see judgements.js); this file only names them.
const DOCS = ["boq", "layout", "render", "sitephoto", "agreement", "programme",
              "materialtracker", "po", "dpr", "challan", "mom", "mail",
              "manual", "kt", "dbr", "submittal", "hse"];

// ---- WORK: what it takes to build it ---------------------------------
// `kind` maps to the fact model's vocabulary in ingest/facts.js.
// `from` is which documents may answer it, best source first.
// `blocks` is what cannot be computed without it, in plain words.
const WORK = [
  { id: "quantity", name: "How much of it", kind: "quantity",
    from: ["boq", "layout"],
    blocks: "no duration, no crew size, no material quantity, no cost — the plan cannot start" },
  { id: "spec", name: "What exactly it is", kind: "scope",
    from: ["boq", "submittal", "dbr", "manual", "agreement", "materialtracker", "po", "kt"],
    blocks: "no lead time and no approval path — the item can be scheduled but not bought" },
  { id: "rate", name: "What it costs per unit", kind: "rate",
    from: ["boq", "po"],
    blocks: "no cost head, no cashflow, no value on a change" },
  { id: "manpower", name: "Which trade, how many, for how long", kind: "count",
    from: ["boq", "programme", "dpr"],
    blocks: "no manpower curve and no levelling — the site cannot be staffed to the plan" },
  { id: "material", name: "Which item, how much, needed when", kind: "quantity",
    from: ["boq", "materialtracker", "po", "challan"],
    blocks: "no material plan and no order-by date — long leads are found late" },
  { id: "leadtime", name: "How long it takes to arrive", kind: "duration",
    from: ["materialtracker", "po", "submittal"],
    blocks: "the order-by date cannot be walked back from the needed-on date" },
  { id: "timings", name: "When work is allowed on site", kind: "term",
    from: ["agreement", "manual", "mom", "hse"],
    blocks: "the working calendar is a guess — every date downstream inherits it" },
  { id: "milestone", name: "A date somebody is held to", kind: "date",
    from: ["agreement", "programme", "mom", "mail", "kt", "manual"],
    blocks: "nothing to measure the plan against, and no LD exposure" },
  { id: "duration", name: "How long a task is planned to take", kind: "duration",
    from: ["programme"],
    blocks: "the engine must derive it from quantity and norms instead of reading it" },
  { id: "status", name: "What has actually happened to a task", kind: "term",
    from: ["programme", "dpr", "mom", "materialtracker", "challan", "mail", "submittal"],
    blocks: "no baseline for the first compare — day one starts blind" },
  { id: "dependency", name: "What somebody else owes before we can start", kind: "term",
    from: ["agreement", "mom", "mail", "dpr", "manual", "kt", "dbr", "hse"],
    blocks: "a delay lands on us that was never ours" },
  { id: "payment", name: "What triggers money", kind: "term",
    from: ["agreement", "boq"],
    blocks: "no RA staging, no cashflow, no value on a slipped milestone" },
  { id: "owner", name: "Who is accountable", kind: "person",
    from: ["mom", "agreement", "kt", "mail"],
    blocks: "a task with no name on it is a task nobody does" },
  { id: "area", name: "Where, and how big", kind: "area",
    from: ["layout", "boq"],
    blocks: "no place to hang a quantity on — nothing can be tracked room by room" },
];

// ---- VISUAL: what to look for when a camera stands there --------------
// These are answered by looking, not by reading numbers. Each one is
// asked of a picture (render or site photo) or of a drawing.
const VISUAL = [
  { id: "present", name: "Is the thing there at all", kind: "term",
    from: ["render", "sitephoto"],
    blocks: "nothing can be confirmed by camera — every package needs a human report" },
  { id: "stage", name: "How far along it is — rough-in, closed, finished, snagged", kind: "term",
    from: ["render", "sitephoto"],
    blocks: "a photo can only say done or not done, which is never true mid-build" },
  { id: "marks", name: "What tells this item apart from a lookalike", kind: "scope",
    from: ["render", "layout", "boq", "submittal", "dbr"],
    blocks: "fluted panel and laminate read the same — the wrong package gets credited" },
  { id: "countable", name: "How many should be visible from here", kind: "count",
    from: ["render", "layout", "boq", "sitephoto"],
    blocks: "partial work reads as complete — six fittings and two look alike" },
  { id: "occlusion", name: "What this view can no longer resolve, and why", kind: "term",
    from: ["render", "layout", "sitephoto"],
    blocks: "'the camera cannot see it' gets scored as 'it is not done' — the engine starts lying" },
  { id: "forbidden", name: "What must NOT be visible yet", kind: "term",
    from: ["layout", "programme"],
    blocks: "a ceiling closed over untested duct passes as good progress" },
  { id: "hse", name: "What safety requires to be visible", kind: "term",
    from: ["hse", "manual", "sitephoto"],
    blocks: "no safety observation is possible from the daily walk" },
  { id: "housekeeping", name: "Access, debris, storage, blocked routes", kind: "term",
    from: ["sitephoto"],
    blocks: "the reason tomorrow's trade cannot start is invisible until tomorrow" },
];

const ALL = WORK.concat(VISUAL);
const BY_ID = {}; ALL.forEach(s => BY_ID[s.id] = s);
const FAMILY = {}; WORK.forEach(s => FAMILY[s.id] = "work"); VISUAL.forEach(s => FAMILY[s.id] = "visual");

// which signals a document of this kind is allowed to answer
function sought(docKind) {
  const k = String(docKind || "").toLowerCase();
  if (DOCS.indexOf(k) === -1) return { ok: false,
    why: "no judgement exists for a document of kind \"" + docKind + "\" — it is not on the declared list" , signals: [] };
  return { ok: true, signals: ALL.filter(s => s.from.indexOf(k) !== -1) };
}

// what is blocked, given the signal ids actually found. The whole point of
// the register: an answer about what is NOT there.
function blocking(foundIds) {
  const have = {}; (foundIds || []).forEach(i => have[i] = 1);
  return ALL.filter(s => !have[s.id])
    .map(s => ({ signal: s.id, family: FAMILY[s.id], name: s.name,
                 blocks: s.blocks, lookIn: s.from.slice() }));
}

// a reader that comes back with something not on the list has found
// something the engine cannot use yet, and must say so rather than drop it
function unknown(ids) {
  return (ids || []).filter(i => !BY_ID[i]);
}

const REG = { DOCS, WORK, VISUAL, ALL, BY_ID, FAMILY, sought, blocking, unknown };
root.SIGNAL_REGISTER = REG;
if (typeof module !== "undefined" && module.exports) module.exports = REG;

})(typeof window !== "undefined" ? window : globalThis);
