// ===================================================================
// DnB-OS . platform/signals/judgements.js . HOW EACH KIND IS READ
// The same checklist, asked differently. A 3D render is authority on what
// should exist when the room is finished. A site photo is authority on
// what is there today and on nothing else. A layout says where and how
// big. An agreement says who owes what, by when. Reading all four the same
// way is how a render becomes evidence of progress, which it never is.
//
//   JUDGEMENTS            one per document kind
//   judge(kind)           the brief: signals, authority, refusals
//   promptFor(kind, ctx)  the instruction an agent is given, built from
//                         the register and the checklist — never freehand
//   receive(kind, reply)  the model's answer -> typed findings or refusals
//
// THE LAWS
//   . AUTHORITY IS PER SIGNAL, NOT PER DOCUMENT. A render is authority on
//     what a finished room contains and has NO authority on dates. A DPR
//     is authority on manpower and none on quantity. Saying so per signal
//     is what stops a plausible document from overwriting a measured one.
//   . EVERY JUDGEMENT NAMES WHAT IT MAY NOT CONCLUDE. The refusals are the
//     load-bearing half. "This render shows a finished ceiling" must never
//     become "the ceiling is finished".
//   . THE PROMPT IS BUILT, NOT WRITTEN. It is assembled from the declared
//     register and the closed checklist, so changing the law changes every
//     read. A prompt typed by hand drifts from the law within a week.
//   . AN ANSWER WITHOUT AN ADDRESS IS DISCARDED. Every finding must land
//     at a pin, an area, an item and a day, or it cannot be compared with
//     anything and is not information. See address.js.
//
// Pure: declarations and string building. No clock, no I/O, no model.
// ===================================================================

;(function (root) {

const REG = (typeof require !== "undefined") ? require("./register.js") : root.SIGNAL_REGISTER;
const CHK = (typeof require !== "undefined") ? require("./checklist.js") : root.SIGNAL_CHECKLIST;

// mode tells the reader what shape of question it is answering:
//   checklist  every item on the list, yes / no / cannot_tell
//   extract    named signals, each with the cell, page or line it sat on
const JUDGEMENTS = {
  render: {
    mode: "checklist", name: "3D render — the finished state",
    asks: "What will be in this view when the room is DONE.",
    signals: ["present", "marks", "countable", "occlusion"],
    authority: { present: "stated", marks: "stated", countable: "stated",
                 occlusion: "derived" },
    mayNotConclude: [
      "that any of it is built — a render is a drawing of an intention",
      "any date, duration or percentage",
      "that an item absent from the render is out of scope; the BOQ decides scope",
    ],
    note: "This is the reference frame every later site photo of this pin is compared against." },

  sitephoto: {
    mode: "checklist", name: "Site photo — the state today",
    asks: "What is actually there in this frame, today.",
    signals: ["present", "stage", "countable", "occlusion", "hse", "housekeeping"],
    authority: { present: "measured", stage: "stated", countable: "measured",
                 occlusion: "derived", hse: "stated", housekeeping: "stated" },
    mayNotConclude: [
      "that a task is complete — only a named person's report can say that",
      "a percentage of anything",
      "that work is missing when the view could not resolve it; that is cannot_tell",
      "what caused something; a photo shows a state, never a reason",
    ],
    note: "Judged against this pin's render and its dated expectation, never on its own." },

  layout: {
    mode: "extract", name: "Layout / GFC drawing",
    asks: "Where things are, how big, and what is drawn to be built.",
    signals: ["area", "quantity", "marks", "occlusion", "forbidden"],
    authority: { area: "measured", quantity: "measured", marks: "stated",
                 occlusion: "derived", forbidden: "derived" },
    mayNotConclude: [
      "a rate, a cost or a lead time",
      "that a room exists because a label sits near it — the label must be inside the polygon",
      "an area for a room whose polygon carries another room's label too",
    ] },

  boq: {
    mode: "extract", name: "Priced BOQ / BCS",
    asks: "What was bought: item, quantity, unit, rate, and where it applies.",
    signals: ["quantity", "spec", "rate", "material", "payment", "area"],
    authority: { quantity: "measured", spec: "stated", rate: "measured",
                 material: "stated", payment: "stated", area: "stated" },
    mayNotConclude: [
      "a duration or a crew size — those come from the norms, not the bill",
      "which room a line belongs to unless the line names it",
      "that an unpriced line is out of scope; it is a question with a price on it",
    ] },

  programme: {
    mode: "extract", name: "Programme / milestone sheet",
    asks: "Dates somebody is held to, planned durations, and declared status.",
    signals: ["milestone", "duration", "status", "manpower"],
    authority: { milestone: "stated", duration: "stated", status: "stated", manpower: "stated" },
    mayNotConclude: [
      "a quantity or a cost",
      "that a date is achievable — the engine re-derives that from quantities and norms",
      "that 'Completed' in a cell is a confirmed actual; it is a claim with a source",
    ] },

  materialtracker: {
    mode: "extract", name: "Material tracker / make list",
    asks: "Items, when they are needed, how long they take, and where they have got to.",
    signals: ["material", "leadtime", "spec", "status"],
    authority: { material: "stated", leadtime: "stated", spec: "stated", status: "stated" },
    mayNotConclude: [
      "a quantity the BOQ does not carry",
      "that a delivered item is installed",
    ] },

  agreement: {
    mode: "extract", name: "Agreement / client PO",
    asks: "What was promised, by when, on what terms, and who owes what.",
    signals: ["milestone", "payment", "timings", "dependency", "owner", "spec"],
    authority: { milestone: "stated", payment: "stated", timings: "stated",
                 dependency: "stated", owner: "stated", spec: "stated" },
    mayNotConclude: [
      "a quantity, a rate or a duration",
      "anything from a clause it cannot quote — every finding carries its clause",
    ] },

  po:        { mode: "extract", name: "Purchase order", asks: "What was ordered, from whom, when it is due.",
    signals: ["material", "leadtime", "rate", "spec"],
    authority: { material: "stated", leadtime: "stated", rate: "stated", spec: "stated" },
    mayNotConclude: ["that ordered means delivered"] },

  challan:   { mode: "extract", name: "Delivery challan / GRN", asks: "What physically arrived, how much, on what date.",
    signals: ["material", "status"],
    authority: { material: "measured", status: "stated" },
    mayNotConclude: ["that delivered means installed", "a rate or a quantity beyond what the challan lists"] },

  dpr:       { mode: "extract", name: "Daily progress report", asks: "Who was on site, by trade, and what they say was done.",
    signals: ["manpower", "status", "dependency"],
    authority: { manpower: "stated", status: "stated", dependency: "stated" },
    mayNotConclude: ["a percentage complete", "a quantity"] },

  mom:       { mode: "extract", name: "Minutes of meeting", asks: "What was agreed, by whom, by when.",
    signals: ["milestone", "dependency", "owner", "status", "timings"],
    authority: { milestone: "stated", dependency: "stated", owner: "stated",
                 status: "inferred", timings: "stated" },
    mayNotConclude: ["that a discussion is a decision — a decision names an owner and a date"] },

  mail:      { mode: "extract", name: "Mail / message thread", asks: "Commitments made, dates promised, things asked for.",
    signals: ["dependency", "owner", "milestone", "status"],
    authority: { dependency: "inferred", owner: "inferred", milestone: "inferred", status: "inferred" },
    mayNotConclude: ["anything as settled — a thread is the weakest source the engine holds"] },

  // A READ-ME CARRIES DATES. This one names the handover in its header and
  // the engine was not allowed to hear it — the judgement asked for rules
  // and forbade dates, so a fifth handover date sat in a document the
  // reader had open. What a kind MAY answer is a real decision, and getting
  // it too narrow loses things just as silently as getting it too wide.
  manual:    { mode: "extract", name: "Fit-out manual / building rules / project read-me",
    asks: "What the building permits and forbids, and any date the document states.",
    signals: ["timings", "dependency", "spec", "hse", "milestone"],
    authority: { timings: "stated", dependency: "stated", spec: "stated", hse: "stated",
                 milestone: "stated" },
    mayNotConclude: ["a quantity or a rate",
      "that a date here overrides the agreement — where they differ, both stand and it is a question"] },

  submittal: { mode: "extract", name: "Technical submittal / sample approval", asks: "What was specified and whether it was approved.",
    signals: ["spec", "leadtime", "marks", "status"],
    authority: { spec: "stated", leadtime: "stated", marks: "stated", status: "stated" },
    mayNotConclude: ["that approved means ordered"] },

  hse:       { mode: "extract", name: "HSE document", asks: "What safety requires, and what was observed.",
    signals: ["hse", "timings", "dependency"],
    authority: { hse: "stated", timings: "stated", dependency: "stated" },
    mayNotConclude: ["a progress claim of any kind"] },

  kt:        { mode: "extract", name: "Sales KT note", asks: "What was sold and what the client was told.",
    signals: ["spec", "milestone", "owner", "dependency"],
    authority: { spec: "inferred", milestone: "inferred", owner: "inferred", dependency: "inferred" },
    mayNotConclude: ["anything the agreement contradicts — the agreement wins and the difference is a question"] },

  dbr:       { mode: "extract", name: "Design basis report", asks: "What the design intends and why.",
    signals: ["spec", "marks", "dependency"],
    authority: { spec: "stated", marks: "stated", dependency: "stated" },
    mayNotConclude: ["a quantity, a rate or a date"] },
};

function judge(kind) {
  const j = JUDGEMENTS[String(kind || "").toLowerCase()];
  if (!j) return { ok: false, why: "no judgement is declared for \"" + kind +
    "\" — a document kind the engine has not been taught to read is reported, not guessed at" };
  const s = REG.sought(kind);
  // the judgement may not claim a signal the register does not let this
  // document kind answer. Two declarations, one of them wrong, is a bug
  // and it surfaces here rather than in a fact.
  const overreach = j.signals.filter(id => !s.signals.some(x => x.id === id));
  return { ok: true, kind, ...j,
    overreach: overreach.length ? overreach : null,
    why: overreach.length
      ? "this judgement claims " + overreach.join(", ") + " which the register does not allow from a " + kind
      : null };
}

// ---- the instruction an agent is actually given -----------------------
// Built from the law, never typed by hand.
function promptFor(kind, ctx) {
  const j = judge(kind);
  if (!j.ok) return j;
  const c = ctx || {};
  const head = [
    "You are reading one " + j.name + " for a fit-out project.",
    "ASK: " + j.asks,
    c.where ? "WHERE THIS SITS: " + c.where : null,
    c.frame ? "\n" + c.frame + "\n" : null,
  ].filter(Boolean);

  let body;
  if (j.mode === "checklist") {
    const items = (c.items && c.items.length ? c.items.map(i => CHK.BY_ID[i]).filter(Boolean) : CHK.ITEMS);
    body = [
      "Go through EVERY item below. For each one, `answer` is exactly one of THESE THREE WORDS:",
      "  yes | no | cannot_tell",
      "Never put a stage name in `answer`. \"absent\", \"present\", \"complete\", \"installed\" are STAGES,",
      "and they belong in the separate `stage` field. If the thing is not there, `answer` is \"no\".",
      "cannot_tell REQUIRES a reason — out of frame, too dark, obstructed, or covered over for good.",
      "Where you answer yes and the item has stages, give the stage. Where the item is countable, give the count.",
      "Do not add items. Do not skip items. If you see something the list does not name, list it separately under `unknown`.",
      "",
      "THE CHECKLIST:",
      items.map(i => "  " + i.id + " — " + i.name +
        " [" + i.d + "]" +
        (CHK.LADDER[i.ladder] ? " stages: " + CHK.LADDER[i.ladder].join(" > ") : "") +
        (i.countable ? " (countable)" : "") +
        "\n      tells it apart: " + i.marks).join("\n"),
    ].join("\n");
  } else {
    const sigs = j.signals.map(id => REG.BY_ID[id]).filter(Boolean);
    body = [
      "Find ONLY these signals. Nothing else is wanted from this document.",
      sigs.map(s => "  " + s.id + " — " + s.name).join("\n"),
      "",
      "Every finding must carry where it sat: sheet and cell, page and clause, or line number.",
      "A signal you looked for and did not find is an ANSWER — return it under `notFound` with where you looked.",
      "If a value is present but ambiguous, return it under `ask` with the ambiguity stated. Never resolve it yourself.",
    ].join("\n");
  }

  const tail = [
    "",
    "YOU MAY NOT CONCLUDE:",
    j.mayNotConclude.map(x => "  - " + x).join("\n"),
    "",
    "Answer as JSON only: " + (j.mode === "checklist"
      ? '{"answers":[{"item","answer","stage","count","why"}],"unknown":[],"ask":[]}'
      : '{"found":[{"signal","subject","value","unit","where"}],"notFound":[{"signal","lookedIn"}],"ask":[]}'),
  ].join("\n");

  return { ok: true, kind, mode: j.mode, prompt: head.join("\n") + "\n\n" + body + "\n" + tail };
}

// ---- typing what comes back -------------------------------------------
function receive(kind, reply) {
  const j = judge(kind);
  if (!j.ok) return j;
  const r = reply || {};
  if (j.mode === "checklist") {
    const cov = CHK.coverage(r.answers || []);
    return { ok: true, mode: "checklist", coverage: cov,
      unknown: r.unknown || [], ask: r.ask || [],
      // authority travels with the answer, from the judgement, not the model
      authority: j.authority };
  }
  const found = [], refused = [];
  for (const f of (r.found || [])) {
    if (j.signals.indexOf(f.signal) === -1) {
      refused.push({ ...f, why: "a " + kind + " has no authority over the signal \"" + f.signal + "\"" }); continue; }
    if (!f.where) { refused.push({ ...f, why: "no provenance — a finding with no sheet, cell, page or line is refused at the door" }); continue; }
    if (f.value == null || f.value === "") { refused.push({ ...f, why: "no value" }); continue; }
    found.push({ ...f, conf: j.authority[f.signal] || "inferred" });
  }
  return { ok: true, mode: "extract", found, refused,
    notFound: r.notFound || [], ask: r.ask || [] };
}

const J = { JUDGEMENTS, judge, promptFor, receive };
root.SIGNAL_JUDGEMENTS = J;
if (typeof module !== "undefined" && module.exports) module.exports = J;

})(typeof window !== "undefined" ? window : globalThis);
