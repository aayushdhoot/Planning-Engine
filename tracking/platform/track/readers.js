// ===================================================================
// DnB-OS . platform/track/readers.js . SOURCE READERS
// Each reader takes raw text and returns { facts, queries, meta }.
// Law: a reader never invents. A field it cannot read becomes a
// query with the reason. Confidence rides on every fact.
// ===================================================================

;(function (root) {

const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

function isoDate(y, m, d) {
  return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

// reads "Jul. 14, 2026" / "July 7, 2026" / "14/07/2026"
function readDate(s) {
  if (!s) return null;
  let m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mo = MONTHS[m[1].slice(0,3).toLowerCase()];
    if (mo) return isoDate(+m[3], mo, +m[2]);
  }
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    return isoDate(y, +m[2], +m[1]);
  }
  return null;
}

// ---- WhatsApp DPR export -------------------------------------------
// Android shape: "07/07/2026, 18:45 - Rahul Singh: message"
//                "07/07/2026, 18:45 - Rahul Singh: IMG-xxx.jpg (file attached)"
//                "<Media omitted>" when exported without media
// iPhone shape:  "[07/07/26, 18:45:08] Vishal SKF Pune SPM: message"
//                attachments as "<attached: 00003009-PHOTO-...jpg>"
//                lines may carry U+200E marks and CR endings (real SKF chat, 16 Jul 2026)
const WA_LINE = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})(?:\s*[ap]m)?\s*-\s*([^:]+):\s*([\s\S]*)$/i;
const WA_LINE_IOS = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?(?:\s*[AP]M)?\]\s*([^:]+):\s*([\s\S]*)$/i;

// words that make a message a progress claim, not chatter
const CLAIM_WORDS = /(complete|completed|done|finish|start|started|pour|casting|marking|installed|installation|fixed|fixing|laid|erected|achieved|progress|work)/i;

function parseWhatsApp(text) {
  const facts = [], queries = [];
  let current = null, parsedLines = 0, mediaRefs = 0;
  const lines = String(text || "").split(/\r?\n/);
  for (const dirty of lines) {
    const raw = dirty.replace(/[\u200e\u200f\r]/g, "");
    const m = raw.match(WA_LINE) || raw.match(WA_LINE_IOS);
    if (m) {
      parsedLines++;
      const day = readDate(m[1]);
      const sender = m[3].trim();
      const body = m[4].trim();
      const attached = /\(file attached\)|<attached:/i.test(body);
      const media = /<media omitted>/i.test(body);
      if (attached || media) mediaRefs++;
      current = {
        kind: attached || media ? "evidence_ref" : (CLAIM_WORDS.test(body) ? "claim" : "note"),
        source: "dpr", day, person: sender, text: body,
        confidence: attached || media ? "medium" : (CLAIM_WORDS.test(body) ? "medium" : "low"),
        zone: null, task: null
      };
      facts.push(current);
    } else if (current && raw.trim()) {
      current.text += " " + raw.trim(); // continuation line
    }
  }
  if (parsedLines === 0 && String(text||"").trim())
    queries.push({ about: "WhatsApp export", question: "No line matched the WhatsApp pattern. Is this a chat export txt?", blocking: true });
  return { facts, queries, meta: { messages: parsedLines, mediaRefs } };
}

// ---- Vizdom purchase order (FSL...) --------------------------------
function parsePO(text) {
  const t = String(text || "");
  const facts = [], queries = [];
  const po = (t.match(/FSL\d{6,}/) || [])[0] || null;
  const rev = (t.match(/Revision:\s*(\d+)/) || [])[1] || "0";
  const projCode = (t.match(/\(\s*(FS[A-Z0-9]{6,})\s*\)/) || [])[1] || null;

  // order date is the date nearest "Order Date", delivery nearest "Delivery"
  const orderDate = readDate((t.match(/Order Date[\s\S]{0,120}?([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/) || [])[1]);
  const deliveryDate = readDate((t.match(/Delivery[\s\S]{0,140}?([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/) || [])[1]);

  // vendor: first non-empty line after "Vendor details"
  let vendor = null;
  const vm = t.match(/Vendor details\s*\n?\s*([A-Za-z0-9 .,&()'-]{3,60})/);
  if (vm) vendor = vm[1].trim().split(/\s{2,}|\n/)[0];

  // category: first known category word near line items
  const cat = (t.match(/\b(Plumbing|Electrical|HVAC|Civil|Carpentry|Painting|CCTV|ELV|Fire|Flooring|Ceiling|Furniture|Glass|Partition)\b/i) || [])[1] || null;

  // total: only trust a number that sits near the word Total; else query
  let value = null;
  const totals = [...t.matchAll(/Total[^0-9]{0,40}([0-9][0-9,]*\.\d{2})/gi)].map(x => parseFloat(x[1].replace(/,/g, "")));
  if (totals.length) value = Math.max(...totals);

  if (!po) queries.push({ about: "PO file", question: "No FSL number found. Which PO is this?", blocking: true });
  if (po && value == null) queries.push({ about: po, question: "PO total not readable from text. Confirm the order value.", blocking: false });
  if (po && !deliveryDate) queries.push({ about: po, question: "Delivery date not readable. When is this due on site?", blocking: false });

  if (po) facts.push({
    kind: "commitment", source: "po", day: orderDate,
    text: `PO ${po} rev ${rev}${vendor ? " on " + vendor : ""}${cat ? " for " + cat : ""}`,
    po, rev: +rev, vendor, category: cat, projectCode: projCode,
    orderDate, deliveryDate, value,
    confidence: value != null && deliveryDate ? "high" : "medium",
    zone: null, task: null
  });
  return { facts, queries, meta: { po, vendor, value, deliveryDate } };
}

// ---- GRN / SRN ------------------------------------------------------
// contract defined now, tuned when the first real GRN lands (folder 03.4 is empty today)
function parseGRN(text) {
  const t = String(text || "");
  const facts = [], queries = [];
  const po = (t.match(/FSL\d{6,}/) || [])[0] || null;
  const day = readDate(t);
  const qty = (t.match(/(?:qty|quantity)[^0-9]{0,10}([0-9.]+)/i) || [])[1];
  if (!po && !day) {
    queries.push({ about: "GRN", question: "GRN carries no PO number and no date the reader can see. Send the standard format once and the reader locks onto it.", blocking: true });
  } else {
    facts.push({ kind: "delivery", source: "grn", day, po, qty: qty ? +qty : null,
      text: `Material received${po ? " against " + po : ""}`,
      confidence: po && day ? "high" : "low", zone: null, task: null });
  }
  return { facts, queries, meta: { po, day } };
}

// ---- Plan baseline import (from the Planning Engine export) ---------
// contract: { dnbos: "plan", project, version, published, tasks: [
//   { id, name, category, sub, dept, person, zone, start, end } ] }
function importPlan(json) {
  const facts = [], queries = [];
  let plan = json;
  if (typeof json === "string") { try { plan = JSON.parse(json); } catch (e) { plan = null; } }
  if (!plan || plan.dnbos !== "plan" || !Array.isArray(plan.tasks)) {
    queries.push({ about: "plan import", question: "File is not a Planning Engine plan export (needs dnbos:'plan' and a tasks array).", blocking: true });
    return { facts, queries, meta: { ok: false } };
  }
  let bad = 0;
  for (const task of plan.tasks) {
    if (!task.name || !task.start || !task.end) { bad++; continue; }
    facts.push({ kind: "baseline", source: "plan", day: task.start,
      text: task.name, task: task.id || task.name,
      category: task.category || null, sub: task.sub || null,
      dept: task.dept || null, person: task.person || null,
      zone: task.zone || null, start: task.start, end: task.end,
      planVersion: plan.version || "v1", confidence: "locked" });
  }
  if (bad) queries.push({ about: "plan import", question: `${bad} task(s) in the plan export missing name or dates. Republish from the Planning Engine.`, blocking: bad === plan.tasks.length });
  return { facts, queries, meta: { ok: facts.length > 0, tasks: facts.length, version: plan.version || "v1" } };
}

root.TRACK_READERS = { parseWhatsApp, parsePO, parseGRN, importPlan, readDate };
if (typeof module !== "undefined") module.exports = root.TRACK_READERS;

})(typeof window !== "undefined" ? window : globalThis);
