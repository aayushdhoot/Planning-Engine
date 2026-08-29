// ===================================================================
// DnB-OS . platform/track/intake.js . TRACKING ENGINE INTAKE GATE
// Law: every file gets classified, nothing is dropped silently.
// A file the gate cannot place becomes an OPEN QUERY, never a skip.
// classify() is pure: name + size + a text sample in, verdict out.
// ===================================================================

;(function (root) {

const TYPES = {
  plan_baseline: { label: "Plan baseline",   route: "plan",   icon: "P" },
  readings_batch:{ label: "Site readings",   route: "readings", icon: "R" },
  cad_layout:    { label: "CAD layout",      route: "zones",  icon: "C" },
  drawing_pdf:   { label: "Drawing (PDF)",   route: "zones",  icon: "D" },
  photo_360:     { label: "360 walk",        route: "media",  icon: "3" },
  site_photo:    { label: "Site photo",      route: "media",  icon: "F" },
  site_video:    { label: "Site video",      route: "media",  icon: "V" },
  cctv_video:    { label: "CCTV video",      route: "media",  icon: "K" },
  dpr_whatsapp:  { label: "DPR (WhatsApp)",  route: "dpr",    icon: "W" },
  po:            { label: "Purchase order",  route: "po",     icon: "O" },
  grn:           { label: "GRN / delivery",  route: "grn",    icon: "G" },
  srn:           { label: "SRN / service",   route: "grn",    icon: "S" },
  unknown:       { label: "Unclassified",    route: "query",  icon: "?" }
};

function ext(name) {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

// name + content sniffing, ordered from strongest signal to weakest
function classify(file) {
  const name = String(file.name || "");
  const low  = name.toLowerCase();
  const e    = ext(name);
  const text = String(file.text || "");
  const out  = (type, confidence, why) => ({ type, confidence, why, route: TYPES[type].route, label: TYPES[type].label });

  // gated formats first: DWG is refused with a recovery path, never silently
  if (e === "dwg") return out("cad_layout", "gated", "DWG needs a DXF sibling. Export DXF from AutoCAD and drop that.");
  if (e === "dxf") return out("cad_layout", "high", "DXF layout, zone extraction ready");

  // readings batch: JSON carrying the readings marker, checked before
  // the plan marker so a readings file never lands as a plan
  if (e === "json" && /"dnbos"\s*:\s*"readings"/.test(text))
    return out("readings_batch", "high", "DnB-OS readings marker found");

  // plan baseline: JSON carrying the planning engine export marker
  if (e === "json") {
    if (/"dnbos"\s*:|"publishedPlan"|"planVersion"/.test(text)) return out("plan_baseline", "high", "Planning Engine export marker found");
    return out("unknown", "low", "JSON without a DnB-OS plan marker");
  }

  // WhatsApp chat export: the txt with its timestamp line pattern
  if (e === "txt" && (/^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}/m.test(text) || /whatsapp/i.test(low)))
    return out("dpr_whatsapp", "high", "WhatsApp chat export pattern");

  // procurement papers by number pattern and words
  if (/fsl\d{6,}/i.test(low) || /purchase\s*order/i.test(text)) return out("po", "high", "Vizdom PO number pattern");
  if (/\bgrn\b|goods\s*receipt|delivery\s*note|challan/i.test(low + " " + text.slice(0, 400))) return out("grn", "high", "GRN wording");
  if (/\bsrn\b|service\s*receipt/i.test(low + " " + text.slice(0, 400))) return out("srn", "high", "SRN wording");

  // media: 360 by camera fingerprints, CCTV by name, else site media
  if (/(insta360|theta|ricoh|pano|360)/i.test(low) && /(jpe?g|png|mp4|insp|insv)/.test(e))
    return out("photo_360", "high", "360 camera fingerprint in name");
  if (/(cctv|nvr|dvr|ch\d{1,2}[-_]|camera)/i.test(low) && /(mp4|avi|dav|mkv)/.test(e))
    return out("cctv_video", "high", "CCTV naming");
  if (["jpg","jpeg","png","heic","webp"].includes(e)) return out("site_photo", "medium", "image, treated as site photo until zone-pinned");
  if (["mp4","mov","avi","mkv"].includes(e)) return out("site_video", "medium", "video, source camera unconfirmed");

  // drawings as PDF
  if (e === "pdf" && /(layout|gfc|plan|elevation|section|drawing)/i.test(low))
    return out("drawing_pdf", "medium", "drawing-named PDF, not a CAD source");
  if (e === "pdf") return out("unknown", "low", "PDF without a known fingerprint, needs one look");

  return out("unknown", "low", "no rule matched, engine will not guess");
}

// the gate: classify and ALWAYS return work for the ledger.
// verdict "unknown" or "gated" yields a query, everything else routes.
function gate(file) {
  const v = classify(file);
  const item = { name: file.name, size: file.size || 0, at: new Date().toISOString(), verdict: v };
  if (v.type === "unknown" || v.confidence === "gated") {
    item.query = { about: file.name, question: v.why, blocking: v.confidence === "gated" };
  }
  return item;
}

root.TRACK_INTAKE = { TYPES, classify, gate, ext };
if (typeof module !== "undefined") module.exports = root.TRACK_INTAKE;

})(typeof window !== "undefined" ? window : globalThis);
