// ===================================================================
// DnB-OS . platform/track/project/skf_seed.js . SKF PUNE SEED
// What the engine knew on day one (16 Jul 2026), read from the
// project SSOT on Google Drive. Every entry carries its source.
// Starting from scratch on purpose: no old session files were used.
// ===================================================================

;(function (root) {

const PROJECT = {
  name: "SKF India, Pune office fit-out",
  code: "FSINDB26270044",
  site: "Chapekar Chowk Flyover, Chinchwad, Pune 411033",
  ssot: "Drive: SKF India Pune Fit-out, Project SSOT",
  seededOn: "2026-07-16"
};

// the SSOT map, surveyed 16 Jul 2026. status: live = has files, empty = exists but nothing in it yet
const SOURCES = [
  { id: "00", name: "START HERE, read me",            role: "orientation",           status: "unchecked" },
  { id: "01", name: "Contract & Commercial",          role: "contract",              status: "unchecked" },
  { id: "02", name: "Design & Drawings",              role: "layouts, GFC, twin base", status: "live", note: "LAYOUTS has SKF_R1_GFC_FINAL LAYOUT.dxf (58.9 MB) and 8 layout PDFs. DXF is the twin base, transfer pending." },
  { id: "03", name: "Procurement",                    role: "PO, GRN, vendor",       status: "live", note: "03.1 has 30 Vizdom POs (FSL pdf). 03.4 GRN folder is EMPTY so deliveries are invisible to the engine today." },
  { id: "04", name: "Schedule & Plan",                role: "baseline plan",         status: "empty", note: "Master schedule folder empty. Baseline comes from the Planning Engine export." },
  { id: "05", name: "Execution, Daily & Weekly",      role: "DPR, site media",       status: "live", note: "WhatsApp Dump folder holds 8 Jul.zip (DPR chat + site images), transfer pending. 05.1 and 05.3 empty." },
  { id: "06", name: "Quality (QA-QC)",                role: "out of scope, QA engine", status: "unchecked" },
  { id: "07", name: "HSE",                            role: "later engine",          status: "unchecked" },
  { id: "08", name: "Statutory & Approvals",          role: "context",               status: "unchecked" },
  { id: "09", name: "Client & CSAT",                  role: "context",               status: "unchecked" },
  { id: "10", name: "Reports & Trackers",             role: "reporting engine later", status: "unchecked" },
  { id: "11", name: "UPLOAD HERE, feeds Command Center", role: "drop inbox: CCTV, 360, DPR, PO dump", status: "live", note: "11.1 CCTV & 360 empty, 11.2 PO dump empty, 11.3 DPR uploads empty. Site to start dropping daily." }
];

// facts absorbed on seed day: the three POs pulled and parsed from 03.1
const SEED_FACTS = [
  { kind: "commitment", source: "po", day: "2026-07-14",
    text: "PO FSL2026272077 rev 1 on A.R Khan for Plumbing: complete internal toilet plumbing (16 WC, 8 urinals, 13 wash basins, 2 bathrooms, pantry sinks, RO and geyser points)",
    po: "FSL2026272077", rev: 1, vendor: "A.R Khan", category: "Plumbing",
    orderDate: "2026-07-14", deliveryDate: "2026-06-23", value: 600000,
    confidence: "high", zone: null, task: null,
    flag: "delivery date reads BEFORE order date in the PO. Vizdom data issue, confirm real due date." },
  { kind: "commitment", source: "po", day: "2026-07-14",
    text: "PO FSL2026272008 rev 8 on RAZA ENTERPRISES",
    po: "FSL2026272008", rev: 8, vendor: "RAZA ENTERPRISES", category: null,
    orderDate: "2026-07-14", deliveryDate: null, value: 93321.48,
    confidence: "medium", zone: null, task: null,
    flag: "total taken from largest Total line, category and delivery date not readable, confirm." },
  { kind: "commitment", source: "po", day: "2026-07-14",
    text: "PO FSL2026272161 rev 4 on M.N.Electricals for CCTV: supply, install, test and commission 32 channel NVR with 4x4TB HDD",
    po: "FSL2026272161", rev: 4, vendor: "M.N.Electricals", category: "CCTV",
    orderDate: "2026-07-14", deliveryDate: "2026-07-07", value: null,
    confidence: "medium", zone: null, task: null,
    flag: "order value not readable from the 14 page PO text, confirm. Note: this PO IS the site CCTV, so the CCTV feed input becomes available after this installs." }
];

// what the engine is missing, thrown as queries on first load
const SEED_QUERIES = [
  { about: "baseline plan",  question: "No published SKF plan yet. Publish the SKF plan in the Planning Engine and drop its export here. Until then tracking has no plan to compare against.", blocking: true },
  { about: "CAD layout",     question: "SKF_R1_GFC_FINAL LAYOUT.dxf (58.9 MB) sits in Drive 02.1/LAYOUTS/CAD. It needs a local drop to become the twin base.", blocking: true },
  { about: "DPR WhatsApp",   question: "8 Jul.zip (WhatsApp DPR + site images) sits in Drive 05/Whatsapp Dump. It needs a local drop to be absorbed. Also: is one zip per day the routine?", blocking: false },
  { about: "GRN",            question: "GRN folder 03.4 is empty. Without GRNs the engine cannot see material arriving. Who uploads GRNs and from when?", blocking: false },
  { about: "CCTV & 360",     question: "11.1 CCTV & 360 walks is empty. Drop the first 360 walk and first CCTV clip so the media readers lock onto the real formats.", blocking: false },
  { about: "PO total FSL2026272161", question: "Confirm order value of the CCTV PO (not readable from text).", blocking: false },
  { about: "PO FSL2026272077 dates", question: "Plumbing PO shows delivery 23 Jun but order 14 Jul. Confirm the actual due date.", blocking: false },
  { about: "remaining POs",  question: "27 more POs sit in 03.1 beyond the 3 absorbed. Approve pulling all of them in the next sync.", blocking: false }
];

function seed(ledger, zones) {
  if (ledger.state.facts.length) return { seeded: false, why: "ledger already has facts" };
  for (const f of SEED_FACTS) ledger.addFact(f);
  for (const q of SEED_QUERIES) ledger.addQuery(q);
  ledger.addFile({ name: "FSL2026272077_1.pdf", size: 15023, at: PROJECT.seededOn, verdict: { type: "po", confidence: "high", label: "Purchase order" } });
  ledger.addFile({ name: "FSL2026272008_8.pdf", size: 23546, at: PROJECT.seededOn, verdict: { type: "po", confidence: "high", label: "Purchase order" } });
  ledger.addFile({ name: "FSL2026272161_4.pdf", size: 40280, at: PROJECT.seededOn, verdict: { type: "po", confidence: "high", label: "Purchase order" } });
  return { seeded: true, facts: SEED_FACTS.length, queries: SEED_QUERIES.length };
}

root.TRACK_PROJECT = { PROJECT, SOURCES, SEED_FACTS, SEED_QUERIES, seed };
if (typeof module !== "undefined") module.exports = root.TRACK_PROJECT;

})(typeof window !== "undefined" ? window : globalThis);
