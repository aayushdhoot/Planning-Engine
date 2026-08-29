// ===================================================================
// DnB-OS . platform/ingest/kinds.js . WHICH JUDGEMENT A FILE GETS
// A render and a site photo are both a .png of a room. Read the same way
// they say the same thing, and a drawing of an intention becomes evidence
// of progress. So before anything is read, this decides what it IS — and
// where it cannot tell, it says so rather than picking the nearest.
//
//   RULES              declared: where a file sits, what it is called
//   classify(rel)      one path -> a document kind, with the reason
//   plan(files)        the whole folder -> what will be read as what
//
// THE LAWS
//   . THE FOLDER IS THE STRONGEST EVIDENCE. Somebody filed this document
//     under "03.4 GRN - delivery notes" on purpose. That beats anything
//     guessable from the file name, and it is the one signal that stays
//     right when a file is called "IMG_4471.jpg".
//   . A FILE THE RULES CANNOT PLACE IS NOT READ. Not read as the nearest
//     kind, not read with a general prompt — reported, with its path, so
//     a person files it or a rule is added. A document read under the
//     wrong judgement produces confident wrong facts, which is worse
//     than an unread document by a wide margin.
//   . THE PIN NUMBER IS PART OF THE ADDRESS, NOT PART OF THE KIND. A
//     render and a site photo of pin 44 are different documents about
//     the same place; the kind says how to read it, the address says
//     what it is about. See signals/address.js.
//   . A DATE IN A PATH IS A DAY, NOT A GUESS. Daily inputs carry the day
//     they belong to in the folder or the file name, and an observation
//     with no day cannot be compared with anything.
//
// Pure: paths in, kinds out. No clock, no I/O, no model.
// ===================================================================

;(function (root) {

// Ordered: the first rule that matches wins, so the specific ones come
// first. `where` matches the path, `name` the file name, `ext` the type.
const RULES = [
  // ---- the pin walk: two kinds of picture, told apart by their folder --
  { kind: "render",    where: /site.?tracking\/.*\b3d\b/i, ext: /\.(png|jpe?g|webp)$/i,
    pin: /^p\s*(\d+)/i,
    why: "a picture in the 3d folder of the site-tracking pack is a render — what the room will hold when it is done" },
  { kind: "sitephoto", where: /site.?tracking\/(pins|walk|daily)/i, ext: /\.(png|jpe?g|webp)$/i,
    pin: /^p\s*(\d+)/i, day: /(\d{4}-\d{2}-\d{2})/,
    why: "a picture in the pin-walk folder is what the camera saw that day" },
  { kind: "sitephoto", where: /05.*execution.*(site photos|videos)/i, ext: /\.(png|jpe?g|webp)$/i,
    day: /(\d{4}-\d{2}-\d{2})/,
    why: "filed under the daily execution folder as a site photo" },
  // THE FOLDER SAYS "8 Jul"; THE FILE SAYS 2026-07-07. A day the engine can
  // order has to be a real date, and the exported filename carries one —
  // reading the folder's shorthand instead refused every one of these.
  { kind: "sitephoto", where: /whatsapp.*dump/i, ext: /\.(png|jpe?g|webp)$/i,
    day: /(\d{4}-\d{2}-\d{2})/,
    why: "a picture out of the WhatsApp dump — the site sending what it saw" },

  // ---- contract and commercial ----------------------------------------
  { kind: "agreement", where: /01.*contract.*commercial\/01\.1/i, ext: /\.(pdf|docx?)$/i,
    why: "filed under Agreement & Client PO" },
  { kind: "boq",       where: /01\.2 boq/i, ext: /\.(xlsx?|csv)$/i,
    why: "filed under BOQ & BCS" },
  { kind: "po",        where: /01\.3 ra bills|01\.4 vendor invoices/i, ext: /\.(pdf|xlsx?)$/i,
    why: "filed under bills and invoices" },
  { kind: "po",        where: /03\.1 po register/i, ext: /\.(pdf|xlsx?)$/i,
    why: "filed under the PO register" },
  { kind: "challan",   where: /03\.4 grn/i, ext: /\.(pdf|xlsx?|jpe?g|png)$/i,
    why: "filed under GRN and delivery notes" },
  { kind: "submittal", where: /03\.3 material submittals|02\.7 samples/i, ext: /\.(pdf|xlsx?|docx?)$/i,
    why: "filed under material submittals or sample approvals" },
  { kind: "po",        where: /03\.2 vendor master/i, ext: /\.(pdf|xlsx?)$/i,
    why: "filed under the vendor master and rate contracts" },

  // ---- drawings --------------------------------------------------------
  { kind: "layout",    ext: /\.(dxf|dwg)$/i,
    why: "a CAD file is read as a layout, whatever folder it sits in" },
  { kind: "layout",    where: /02\.1 gfc.*architect/i, ext: /\.pdf$/i,
    why: "filed under GFC Architecture" },
  { kind: "layout",    where: /02\.2 gfc.*mep|02\.3 gfc.*elv/i, ext: /\.pdf$/i,
    why: "filed under GFC services" },
  { kind: "layout",    where: /02\.4 shop|02\.5 ifa|02\.6 as.?built/i, ext: /\.pdf$/i,
    why: "filed under shop, for-approval or as-built drawings" },
  { kind: "mom",       where: /02\.8 rfi/i, ext: /\.(pdf|docx?|xlsx?)$/i,
    why: "an RFI is a question and an answer between two parties, read as minutes" },

  // ---- the daily record ------------------------------------------------
  { kind: "dpr",       where: /05\.1 dpr|daily reports/i, ext: /\.(pdf|xlsx?|docx?|csv)$/i,
    day: /(\d{4}-\d{2}-\d{2})/, why: "filed under the daily progress reports" },
  { kind: "dpr",       where: /05\.2 weekly progress/i, ext: /\.(pdf|xlsx?|docx?)$/i,
    why: "filed under the weekly progress reports" },
  { kind: "mail",      where: /whatsapp/i, ext: /\.(txt|csv)$/i,
    why: "a WhatsApp export is a message thread" },

  // ---- the rest --------------------------------------------------------
  { kind: "programme", where: /04.*schedule|10\.1 weekly task tracker/i, ext: /\.(xlsx?|csv)$/i,
    why: "filed under the schedule or the weekly task tracker" },
  { kind: "hse",       where: /07.*hse/i, why: "filed under HSE" },
  { kind: "manual",    where: /00.*start here|fit.?out|guideline/i, ext: /\.(pdf|docx?|md|txt)$/i,
    why: "filed under the read-me or the fit-out guidelines" },
  { kind: "dbr",       where: /dbr|design basis/i, why: "named as a design basis report" },
  { kind: "kt",        where: /\bkt\b|handover note|briefing/i, why: "named as a sales KT note" },
  { kind: "mom",       where: /mom|minutes/i, ext: /\.(pdf|docx?|xlsx?)$/i, why: "named as minutes" },
];

// what the deterministic readers already open without a model
const DETERMINISTIC = /\.(dxf|xlsx|xlsm|xls|csv|tsv)$/i;

function classify(rel, opts) {
  const p = String(rel || "");
  const name = p.split("/").pop() || "";
  for (const r of RULES) {
    if (r.where && !r.where.test(p)) continue;
    if (r.ext && !r.ext.test(name)) continue;
    if (!r.where && !r.ext) continue;
    const out = { kind: r.kind, why: r.why, deterministic: DETERMINISTIC.test(name) };
    if (r.pin) { const m = r.pin.exec(name); if (m) out.pin = Number(m[1]); }
    if (r.day) { const m = r.day.exec(p); if (m) out.day = m[1]; }
    return out;
  }
  return { kind: null, deterministic: DETERMINISTIC.test(name),
    why: "no declared rule places this file. It is reported rather than read under the nearest " +
         "judgement, because a document read as the wrong kind produces confident wrong facts." };
}

// ---- the whole folder, before a single token is spent ------------------
function plan(files) {
  const rows = (files || []).map(f => ({ rel: f, ...classify(f) }));
  const byKind = {}, unplaced = [];
  rows.forEach(r => { if (r.kind) (byKind[r.kind] = byKind[r.kind] || []).push(r); else unplaced.push(r); });
  return { rows, byKind, unplaced,
    counts: Object.keys(byKind).sort().map(k => ({ kind: k, files: byKind[k].length,
      needsAModel: byKind[k].filter(r => !r.deterministic).length })),
    why: rows.length + " files: " + (rows.length - unplaced.length) + " placed into " +
      Object.keys(byKind).length + " kinds, " + unplaced.length + " the rules cannot place" };
}

const K = { RULES, DETERMINISTIC, classify, plan };
root.INGEST_KINDS = K;
if (typeof module !== "undefined" && module.exports) module.exports = K;

})(typeof window !== "undefined" ? window : globalThis);
