// ===================================================================
// DnB-OS . platform/ingest/claude.js . READING WHAT PROSE HOLDS
// A contract, a KT note, a DBR, a fit-out manual, a photograph. No
// deterministic reader opens those, and they carry most of what a project
// actually agreed to. This asks Claude, through the CLI the tracking
// engine already uses, and turns the answer into facts.
//
//   prompt(kind)          the reading law, per document kind
//   parse(text, doc)      the model's answer -> facts, or refusals
//   READABLE              the formats this can be pointed at
//
// THE LAWS
//   . EVERYTHING IT RETURNS IS `inferred`. The fact model already treats
//     inferred as ALWAYS MATERIAL, so every line goes to the materiality
//     gate as a question rather than becoming an authoritative number.
//     Claude reads and proposes; the deterministic laws still decide.
//   . NO PROVENANCE, NO FACT. The model is required to say where in the
//     document each value came from . a clause, a page, a heading. A line
//     with no `where` is dropped, and the drop is reported. This is the
//     same door every other reader comes through.
//   . IT MAY SAY IT DOES NOT KNOW. The prompt tells it that returning
//     nothing is a correct answer, because a model that always finds
//     something will invent a payment term on a page that has none.
//   . NOTHING IS SUMMARISED. It extracts values, not prose. A summary
//     cannot be checked against the document; a clause reference can.
//   . THE ANSWER IS PARSED STRICTLY. Anything that is not a well formed
//     row is refused and counted, never coerced into a fact.
//
// Pure: text in, facts out. The CLI call lives in tools/ingest.js.
// ===================================================================

;(function (root) {

const READABLE = [".pdf", ".docx", ".doc", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp"];

// what to look for, by what the document is. Declared per kind so the ask
// is narrow . "read this contract" gets vaguer answers than "find the LD
// clause, the payment stages and the completion date".
const ASKS = {
  contract: [
    "the contract or order value, and its currency",
    "liquidated damages: the rate, what it is charged on, and any cap",
    "the payment stages or RA schedule: each stage, its percentage, and what triggers it",
    "retention percentage and when it is released",
    "the payment credit period in days, and what it counts from",
    "the completion or handover date, and the start date it counts from",
    "any defect liability period",
  ],
  kt: [
    "the project's carpet or built-up area, with its unit",
    "the client's named contacts and their roles",
    "the agreed start date and completion date",
    "anything recorded as free-issue by the client",
    "any constraint on working hours, access or noise",
  ],
  dbr: [
    "the design intent per discipline",
    "any specification that fixes a product, make or standard",
    "any performance requirement with a number",
  ],
  manual: [
    "any rule the landlord or client imposes on working hours",
    "any rule on access, lifts, material movement or debris",
    "any permit or approval the fit-out needs before starting",
  ],
  photo: [
    "which trades are visibly under way",
    "anything that looks finished",
    "anything that is a safety issue",
  ],
  generic: [
    "any quantity with its unit",
    "any date and what it refers to",
    "any amount of money and what it is for",
    "any named person and their role",
  ],
};

function kindOf(name) {
  const n = String(name || "").toLowerCase();
  if (/contract|agreement|\bpo\b|work order|loi/.test(n)) return "contract";
  if (/\bkt\b|handover|briefing/.test(n))                 return "kt";
  if (/dbr|design basis/.test(n))                          return "dbr";
  if (/manual|guideline|fit.?out|policy/.test(n))          return "manual";
  if (/\.(png|jpe?g|webp)$/.test(n))                       return "photo";
  return "generic";
}

function prompt(name) {
  const k = kindOf(name);
  const asks = ASKS[k] || ASKS.generic;
  return [
    "Read the file " + JSON.stringify(name) + " in this folder and extract only what it actually states.",
    "",
    "Look for:",
    ...asks.map(a => "  - " + a),
    "",
    "Return ONLY a JSON array. One object per value you found:",
    '  {"kind":"money|date|duration|quantity|term|person|scope|rate|count",',
    '   "subject":"what it is about, a short phrase",',
    '   "value":"the value exactly as the document gives it",',
    '   "unit":"the unit, or null",',
    '   "where":"the clause number, page, or heading it came from"}',
    "",
    "Rules you must follow:",
    "  - Every object needs `where`. If you cannot say where in the document a",
    "    value came from, do not return it.",
    "  - Do not summarise, interpret or infer. Extract values that are written.",
    "  - If the document does not state something, leave it out.",
    "  - Returning an empty array [] is a correct and useful answer.",
    "  - No prose before or after the JSON.",
  ].join("\n");
}

// the model's answer -> facts. Strict: anything malformed is refused and
// counted, never coerced.
function parse(text, doc, idFn) {
  const out = [], refused = [];
  let raw = String(text == null ? "" : text).trim();
  // the CLI wraps its answer; find the array
  const a = raw.indexOf("["), b = raw.lastIndexOf("]");
  if (a === -1 || b === -1 || b < a)
    return { facts: [], refused: [], why: "the model did not return a JSON array" };
  let rows;
  try { rows = JSON.parse(raw.slice(a, b + 1)); }
  catch (e) { return { facts: [], refused: [], why: "the model's JSON did not parse: " + e.message }; }
  if (!Array.isArray(rows)) return { facts: [], refused: [], why: "the model returned something that is not a list" };

  const KINDS = ["money","date","duration","quantity","term","person","scope","rate","count","area"];
  for (const r of rows) {
    if (!r || typeof r !== "object")       { refused.push({ row: r, why: "not an object" }); continue; }
    if (KINDS.indexOf(r.kind) === -1)      { refused.push({ row: r, why: "unknown kind: " + r.kind }); continue; }
    if (r.value == null || r.value === "") { refused.push({ row: r, why: "no value" }); continue; }
    if (!r.subject)                        { refused.push({ row: r, why: "no subject" }); continue; }
    // THE DOOR. No provenance, no fact . the same rule every reader meets.
    if (!r.where)                          { refused.push({ row: r, why: "no `where` in the document" }); continue; }
    out.push({
      id: idFn ? idFn(r.kind) : (doc + ":" + r.kind + ":" + r.subject),
      kind: r.kind, subject: String(r.subject).slice(0, 120),
      value: r.value, unit: r.unit || null,
      // ALWAYS INFERRED. The fact model treats inferred as always material,
      // so every one of these reaches a person as a question.
      conf: "inferred",
      note: "read by Claude from prose — confirm before the engine plans on it",
      source: { doc, where: String(r.where).slice(0, 120), read: "claude" },
    });
  }
  return { facts: out, refused, why: null };
}

const CLAUDE = { READABLE, ASKS, kindOf, prompt, parse };
root.INGEST_CLAUDE = CLAUDE;
if (typeof module !== "undefined" && module.exports) module.exports = CLAUDE;

})(typeof window !== "undefined" ? window : globalThis);
