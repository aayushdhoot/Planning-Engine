// ===================================================================
// DnB-OS . platform/kb/dpr.js . READING A DAILY PROGRESS REPORT
//
// The walk records that people were AT a pin, never how many. So the one
// number a manpower page exists to show — how many turned up — was not on
// this engine anywhere, and the plan curve had nothing to be measured
// against. A DPR has that number every day, in a table nobody has ever
// bothered to get into a system.
//
// This reads one. Pasted from a PDF, copied out of Excel, typed into a
// WhatsApp message: the shapes differ and the content does not. A date
// somewhere near the top, then rows of "what trade" and "how many".
//
// THE LAWS
//   . A LINE WITHOUT A NUMBER IS NOT MANPOWER. Headings, notes and
//     narrative are skipped, not guessed at.
//   . A TRADE THIS ENGINE DOES NOT KNOW IS REPORTED, NEVER DROPPED. It
//     still counts towards the total on site; it just cannot be shown
//     against a trade curve until somebody says which trade it is.
//   . THE TOTAL ROW IS A CHECK, NOT AN INPUT. If the DPR states a total
//     and the rows do not add to it, both numbers are kept and the
//     difference is raised.
//   . NOTHING IS INVENTED. No date, no reading. A blank paste is a blank
//     result, not a zero.
//
// Pure: text in, rows out. No clock, no I/O, no model.
// ===================================================================

;(function (root) {

// ---- what a site calls a trade, and what this engine calls it ----------
// Left side is what appears on an Indian fit-out DPR. Longest match wins,
// so "civil helper" is civil and not a helper of unknown trade.
const TRADE_WORDS = [
  ["mason",            "civil"],      ["civil",             "civil"],
  ["civi",             "civil"],      ["electric",          "electrical"],
  ["helper",           "civil"],      ["labour",            "civil"],
  ["labor",            "civil"],      ["bhisti",            "civil"],
  ["carpenter",        "joinery"],    ["joinery",           "joinery"],
  ["carpentry",        "joinery"],    ["furniture",         "joinery"],
  ["electrician",      "electrical"], ["electrical",        "electrical"],
  ["wireman",          "electrical"], ["plumber",           "plumbing"],
  ["plumbing",         "plumbing"],   ["painter",           "painting"],
  ["painting",         "painting"],   ["putty",             "painting"],
  ["polish",           "painting"],   ["hvac",              "hvac"],
  ["duct",             "hvac"],       ["ducting",           "hvac"],
  ["ac tech",          "hvac"],       ["refrigeration",     "hvac"],
  ["fabricator",       "hvac"],       ["fire fight",        "fire"],
  ["sprinkler",        "fire"],       ["fire alarm",        "fire"],
  ["fire",             "fire"],       ["gypsum",            "drywall"],
  ["drywall",          "drywall"],    ["partition",         "drywall"],
  ["false ceiling",    "ceiling"],    ["ceiling",           "ceiling"],
  ["pop",              "ceiling"],    ["tiles",             "flooring"],
  ["tile",             "flooring"],   ["flooring",          "flooring"],
  ["floor finish",     "flooring"],   ["carpet",            "flooring"],
  ["vinyl",            "flooring"],   ["stone",             "flooring"],
  ["marble",           "flooring"],   ["demolition",        "demolition"],
  ["dismantl",         "demolition"], ["breaker",           "demolition"],
  ["housekeep",        "closeout"],   ["house keep",        "closeout"],
  ["cleaning",         "closeout"],   ["cleaner",           "closeout"],
  ["security",         "closeout"],
  ["glazing",          "joinery"],    ["glass",             "joinery"],
  ["aluminium",        "joinery"],    ["aluminum",          "joinery"],
  ["network",          "elv"],        ["data",              "elv"],
  ["cctv",             "elv"],        ["elv",               "elv"],
  ["low side",         "hvac"],       ["welder",            "hvac"],
  ["punning",          "ceiling"],    ["p.o.p",             "ceiling"],
  ["plaster",          "civil"],      ["shuttering",        "civil"],
  ["barbender",        "civil"],      ["bar bender",        "civil"],
].sort((a, b) => b[0].length - a[0].length);

// SHORT WORDS MATCHED WHOLE, NEVER AS A FRAGMENT. "fas" inside "fascia" and
// "pop" inside "popup" are the same class of mistake as the bare "mcb" rule
// that once billed 848 power points as distribution boards.
const TRADE_TOKENS = [
  [/\bfas\b/,           "fire"],       [/\bpop\b/,           "ceiling"],
  [/\bfa\b/,            "fire"],       [/\bit\b/,            "elv"],
];

// ---- and who is on the floor without laying a hand on the work ----------
// A project manager, a safety officer and a site engineer are all people on
// a floor and none of them is a crew. The demand curve is built from trade
// norms, so booking supervision into a trade would put men on a curve that
// never asked for them — and "supervisor -> closeout" did exactly that.
const STAFF_TOKENS = [
  /\bfs\s*staff\b/, /\bsf\s*staff\b/, /\bstaff\b/, /\bp\.?\s?m\.?\b/,
  /\bs\.?p\.?m\.?\b/, /\ba\.?p\.?m\.?\b/, /\ba\.?g\.?m\.?\b/, /\ba\.?v\.?p\.?\b/,
  /\bm\.?v\.?p\.?\b/, /\bsup\b/, /\bsupervisor\b/, /\bsupervision\b/,
  /\behs\b/, /\besh\b/, /\bsafety\b/, /\bengineer\b/, /\bdesigner\b/,
  /\barchitect\b/, /\bmanager\b/, /\bstore\s?keeper\b/, /^\s*mep\b/,
  // A GUARD IS ON THE FLOOR AND IS NOT A TRADE. Left unrecognised it fell
  // through to "unplaced", and unplaced counts INTO labour — so a security
  // guard was being added to the crew the demand curve is measured against.
  /\bsg\b/, /\bsecurity\b/, /\bguard\b/, /\bwatchman\b/,
];
const isStaff = (label) => {
  const s = String(label || "").toLowerCase();
  return STAFF_TOKENS.some(re => re.test(s));
};

// A LINE OF A REPORT'S FURNITURE IS NOT A ROW OF IT. "Tower-03" and
// "Floor = 7th" both read as a label and a number, and "Floor" is a trade
// word — so a soft rule that yields whenever a trade matches would let
// "Floor = 7th" through as seven men laying floor. These two never yield.
// "Floor 7th" is which floor the job is on, and it was reading as seven men
// laying floor on almost every day of a three month chat. A bare "floor" is
// always the building; the trade is "flooring", "tiles" or "carpet", and the
// word boundary keeps those safe.
const NOISE_HARD = new RegExp("\\b(tower|project|shift|revision|floor|level|wing)\\b");
// These do yield, because a real row can carry one of them by accident.
const NOISE_SOFT = new RegExp("\\b(report|prepared|activit|progress|client|contractor" +
  "|date|sr\\.?\\s*no|s\\.?\\s*no|description)\\b");

function tradeOf(label) {
  const s = String(label || "").toLowerCase();
  if (isStaff(s)) return null;
  for (const [re, trade] of TRADE_TOKENS) if (re.test(s)) return trade;
  for (const [word, trade] of TRADE_WORDS) if (s.indexOf(word) !== -1) return trade;
  return null;
}

// ---- the date, wherever it is hiding ------------------------------------
// dd.mm.yyyy, dd/mm/yyyy, dd-mm-yy, yyyy-mm-dd, "8 Aug 2026", "08 August 26"
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ISO   = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/;
const DMY   = /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/;
const WORDY = new RegExp("\\b(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(" + MONTHS.join("|") +
  ")[a-z]*\\.?,?\\s+(20\\d{2}|\\d{2})\\b", "i");

function dateIn(text) {
  const t = String(text || "");
  let m = t.match(ISO);
  if (m) return m[1] + "-" + String(+m[2]).padStart(2, "0") + "-" + String(+m[3]).padStart(2, "0");
  m = t.match(DMY);
  if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return y + "-" + String(+m[2]).padStart(2, "0") + "-" + String(+m[1]).padStart(2, "0"); }
  m = t.match(WORDY);
  if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return y + "-" + String(MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)) + 1).padStart(2, "0") +
      "-" + String(+m[1]).padStart(2, "0"); }
  return null;
}

// A DATE IS NOT A HEADCOUNT. "08 Aug 2026" ends in a number, and taking the
// last number on a line would book 2,026 people onto the job. Take the date
// out of the line as it was WRITTEN — not as this module normalises it — and
// see whether a number is left over.
function withoutDates(text) {
  return String(text || "").replace(ISO, " ").replace(DMY, " ").replace(WORDY, " ");
}

// ---- one pasted report --------------------------------------------------
function parse(text, opts) {
  const o = opts || {};
  const raw = String(text || "");
  if (!raw.trim()) return { ok: false, why: "nothing was pasted" };

  const day = o.day || dateIn(raw);
  const lines = raw.split(/\r?\n/);
  const rows = [], unknown = [], staffRows = [];
  let stated = null, statedIsGrand = false;

  // A TYPED MESSAGE PUTS SEVERAL TRADES ON ONE LINE. "mason 12, helper 24,
  // carpenter 18" is three rows, and taking the last number on the line
  // would read one of them and lose two. A tabbed or columnar row is one
  // trade, so it is only split where a comma or a semicolon says so.
  const pieces = [];
  for (const line of lines) {
    const L = line.trim(); if (!L) continue;
    if (/[,;]/.test(L) && !/\t/.test(L) && (L.match(/\d+/g) || []).length > 1)
      L.split(/[,;]+/).forEach(p => { if (p.trim()) pieces.push(p.trim()); });
    else pieces.push(L);
  }

  for (const line of pieces) {
    const L = line.trim();
    if (!L) continue;
    // A DATE LINE IS NOT A MANPOWER ROW. Strip the date as written; if what
    // is left carries no number, this line was only ever telling us the day.
    if (dateIn(L) && !/\d/.test(withoutDates(L))) continue;
    // A LINE WITHOUT A NUMBER IS NOT MANPOWER. Take the LAST number on the
    // line: a DPR row is usually "3  Electrician  12" and the leading 3 is
    // a serial number, not a headcount.
    const nums = L.match(/\d+(?:\.\d+)?/g);
    if (!nums) continue;
    const n = Math.round(Number(nums[nums.length - 1]));
    if (!isFinite(n) || n <= 0 || n > 5000) continue;
    // the label is whatever text sits before that number
    // WHATSAPP EMPHASIS IS NOT PART OF THE LABEL. "*Grand Total : 37*" is a
    // stated total, and leaving the asterisk on the front made it fail the
    // anchor and fall through as an unknown trade of thirty seven people.
    const label = withoutDates(L.slice(0, L.lastIndexOf(nums[nums.length - 1])))
      .replace(/[*_~`]+/g, " ")
      .replace(/^[\s.]*\d+[).\-:.]?\s*/, "")    // drop the serial
      .replace(/[|,;:\t]+/g, " ").replace(/\s+/g, " ").trim();
    if (!label) continue;
    // A GRAND TOTAL OUTRANKS ANY OTHER TOTAL ON THE PAGE. One report carried
    // "TOTAL LABOURERS COUNT 16" above rows adding to 31 and a grand total of
    // 37 — taking whichever came last would have called the good number bad.
    if (/^(total|grand total|sum|t o t a l)\b/i.test(label)) {
      const grand = /grand|manpower|man power/i.test(label);
      if (grand || !statedIsGrand) { stated = n; statedIsGrand = statedIsGrand || grand; }
      continue;
    }
    const low = label.toLowerCase();
    if (NOISE_HARD.test(low)) continue;
    if (NOISE_SOFT.test(low) && !tradeOf(label)) continue;
    // SUPERVISION IS NOT A CREW, and it is not an unknown trade either.
    if (isStaff(label)) { staffRows.push({ label, count: n }); continue; }
    const trade = tradeOf(label);
    if (trade) rows.push({ label, trade, count: n });
    // A TRADE THIS ENGINE DOES NOT KNOW STILL TURNED UP. Kept, counted in
    // the total, and named so somebody can say which trade it is.
    else unknown.push({ label, count: n });
  }

  // ---- "FS Staff - 06" AND THEN THE SIX OF THEM, ONE PER LINE ------------
  // Every report in this chat states a staff headline and then breaks it
  // down: FS Staff 05, then SPM 1, PM 1, SUP 2, EHS 1. Adding the header to
  // its own breakdown books the supervision team twice, and on a floor whose
  // ceiling is counted in bodies that is not a rounding error.
  // THE HEADER ALWAYS WINS, even where its own breakdown does not add to it.
  // One report states FS Staff 05 and then lists four people; adding the two
  // together to make nine is worse than either number, and the difference is
  // worth saying out loud rather than burying in a sum.
  const header = staffRows.filter(r => /\b(fs|sf)?\s*staff\b/i.test(r.label));
  const breakdown = staffRows.filter(r => header.indexOf(r) === -1);
  const headSum = header.reduce((t, r) => t + r.count, 0);
  const brkSum = breakdown.reduce((t, r) => t + r.count, 0);
  const staff = header.length ? headSum : brkSum;
  const staffMismatch = header.length > 0 && breakdown.length > 0 && headSum !== brkSum
    ? { stated: headSum, listed: brkSum } : null;

  const counted = rows.reduce((t, r) => t + r.count, 0);
  const extra = unknown.reduce((t, r) => t + r.count, 0);
  // LABOUR is what the demand curve is made of and the only thing it can be
  // measured against. TOTAL is every body on the floor, which is what the
  // density ceiling counts.
  const labour = counted + extra;
  const total = labour + staff;

  const byTrade = {};
  rows.forEach(r => byTrade[r.trade] = (byTrade[r.trade] || 0) + r.count);

  return {
    ok: !!day && total > 0,
    day, rows, unknown, byTrade,
    total, labour, staff, counted, unplaced: extra,
    staffRows, staffMismatch,
    stated,
    // THE TOTAL ROW IS A CHECK. Both numbers are kept when they disagree.
    disagrees: stated != null && Math.abs(stated - total) > 0,
    why: !day ? "no date found in the paste — add one, or set it above"
       : !total ? "no manpower rows found: a row needs a trade and a number"
       : null,
  };
}

const DPR = { TRADE_WORDS, tradeOf, dateIn, parse };
root.KB_DPR = DPR;
if (typeof module !== "undefined" && module.exports) module.exports = DPR;

})(typeof globalThis !== "undefined" ? globalThis : this);
