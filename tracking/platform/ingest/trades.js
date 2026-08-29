// ===================================================================
// DnB-OS . platform/ingest/trades.js . WHICH DISCIPLINE A FACT BELONGS TO
// A fit-out is bought, built and handed over by discipline. Knowledge that
// is not sorted the same way cannot be handed to the person who needs it.
//
//   DISCIPLINES        the declared list, in the order a floor is built
//   of(text)           which discipline a line belongs to, or null
//   group(facts)       facts sorted into disciplines, with what did not sort
//
// THE LAWS
//   . THE LIST IS DECLARED. Every discipline and every word that puts a
//     line into it is written here where a person can argue with it.
//     Nothing is clustered, guessed or learned.
//   . A LINE THAT SORTS NOWHERE IS REPORTED, NEVER FILED ANYWAY. Putting
//     an unknown line under "Interior" because it has to go somewhere is
//     how a scope item disappears into a category nobody reads.
//   . THE LONGER PHRASE WINS. "fire rated door" is joinery, not fire
//     fighting; "fire alarm cable" is FA, not electrical. Matching on the
//     longest declared phrase first is what keeps those apart.
//   . AN ABBREVIATION ONLY COUNTS ON ITS OWN. "FA" is the fire alarm
//     system; "sofa" contains it and is furniture. Short codes match as
//     whole words only.
// ===================================================================

;(function (root) {

// in the order a floor actually gets built, so a report reads in sequence
const DISCIPLINES = [
  { id:"civil",      name:"Civil",            words:["blockwork","aac","masonry","brick","plaster","screed","waterproof","punning","chipping","core cut","grouting","rcc","concrete","demolition","dismantl","debris"] },
  { id:"partition",  name:"Partitions & glazing", words:["partition","gi stud","stud frame","drywall","gypsum board","glazing","glass partition","mullion","spider","frameless"] },
  { id:"ceiling",    name:"Ceiling",          words:["ceiling","false ceiling","grid ceiling","baffle","stretch ceiling","metal ceiling","cove","pelmet"] },
  { id:"flooring",   name:"Flooring",         words:["flooring","floor finish","carpet","vitrified","terrazzo","lvt","epoxy floor","skirting","micro concrete","raised floor","tile"] },
  { id:"interior",   name:"Interior finishes",words:["paint","emulsion","putty","primer","wallpaper","wall finish","texture","cladding","laminate","veneer","fluted","acoustic panel","fabric panel","duco","lacquer"] },
  { id:"carpentry",  name:"Carpentry & joinery",words:["carpentry","joinery","credenza","counter","cabinet","shutter","door frame","wooden door","solid door","frd door","storage unit","pantry unit","reception desk","banquette"] },
  { id:"modular",    name:"Modular furniture",words:["modular","workstation","loose furniture","chair","desk","pedestal","table","sofa","seating","lounge"] },
  { id:"signage",    name:"Signage & graphics",words:["signage","sign board","wayfinding","graphic","vinyl","logo","branding element","nameplate"] },
  { id:"hvac",       name:"HVAC",             words:["hvac","ducting","duct","vav","ahu","fcu","odu","idu","refrigerant","copper piping","diffuser","grille","thermostat","chilled water","precision ac","ventilation","exhaust fan"] },
  { id:"electrical", name:"Electrical",       words:["electrical","conduit","wiring","cable tray","raceway","db","distribution board","panel","switchgear","light fixture","luminaire","socket","switch","earthing","ups","busbar","dg set","lt panel"] },
  { id:"plumbing",   name:"Plumbing & PHE",   words:["plumbing","phe","cpvc","upvc","drainage","sanitary","water supply","wc","washbasin","faucet","trap","pump","water tank","sewage"] },
  { id:"network",    name:"Networking & data",words:["network","data","cat6","cat 6","lan","patch","rack","passive","structured cabling","fiber","fibre","wifi","access point","server rack"] },
  { id:"fire",       name:"Fire fighting",    words:["fire fighting","sprinkler","hydrant","hose reel","wet riser","drencher","fire pump","extinguisher"] },
  { id:"fa",         name:"Fire alarm (FA)",  words:["fire alarm","smoke detector","heat detector","hooter","manual call point","mcp","fire panel","addressable"], codes:["fa","fas"] },
  { id:"pa",         name:"Public address (PA)", words:["public address","pa system","speaker","amplifier","ceiling speaker"], codes:["pa"] },
  { id:"acs",        name:"Access control (ACS)", words:["access control","card reader","boom barrier","flap barrier","turnstile","em lock","door controller"], codes:["acs"] },
  { id:"cctv",       name:"CCTV & surveillance", words:["cctv","surveillance","camera","nvr","dvr","video wall"] },
  { id:"novec",      name:"Gas suppression (NOVEC)", words:["novec","gas suppression","fm200","clean agent","inergen"] },
  { id:"vesda",      name:"Aspirating detection (VESDA)", words:["vesda","aspirating","asd"] },
  { id:"wld",        name:"Water leak detection (WLD)", words:["water leak","leak detection","wld"] },
  { id:"rr",         name:"Rodent repellent (RR)", words:["rodent","pest control","rr system"] },
  { id:"bms",        name:"BMS & integration",words:["bms","building management","integration","scada","ibms"] },
  { id:"av",         name:"AV",               words:["audio visual","\\bav\\b","projector","display","vc unit","video conferenc","sound system"] },
  { id:"statutory",  name:"Statutory & approvals", words:["noc","fire noc","occupancy","municipal","statutory","authority approval","cfo","permission"] },
  { id:"design",     name:"Design & drawings",words:["gfc","drawing","layout","design","rcp","elevation","section","detail","3d","render","dbr"] },
  { id:"commercial", name:"Commercial",       words:["boq","bcs","quotation","payment","invoice","ra bill","retention","variation","rate analysis","tender","rfp","rfq"] },
  { id:"programme",  name:"Programme",        words:["programme","schedule","milestone","pert","baseline","look ahead","duration"] },
];

// longest phrase first, so "fire alarm cable" never lands in Electrical
const PHRASES = (() => {
  const out = [];
  for (const d of DISCIPLINES) for (const w of (d.words || [])) out.push({ id: d.id, w: w.toLowerCase() });
  return out.sort((a, b) => b.w.length - a.w.length);
})();

// short codes match as WHOLE WORDS only . "sofa" must not become fire alarm
const CODES = (() => {
  const out = [];
  for (const d of DISCIPLINES) for (const c of (d.codes || [])) out.push({ id: d.id, c: c.toLowerCase() });
  return out;
})();

function of(text) {
  const s = String(text == null ? "" : text).toLowerCase();
  if (!s.trim()) return null;
  for (const p of PHRASES) {
    if (p.w.startsWith("\\b")) { if (new RegExp(p.w, "i").test(s)) return p.id; continue; }
    if (s.indexOf(p.w) !== -1) return p.id;
  }
  for (const c of CODES) if (new RegExp("(^|[^a-z])" + c.c + "([^a-z]|$)", "i").test(s)) return c.id;
  return null;
}

// facts sorted into disciplines. What sorts nowhere comes back as its own
// list, with its own count . never filed under a convenient heading.
function group(facts) {
  const by = {}, unsorted = [];
  for (const f of (facts || [])) {
    const id = of(f.subject) || of(f.note) || null;
    if (!id) { unsorted.push(f); continue; }
    (by[id] = by[id] || []).push(f);
  }
  const rows = DISCIPLINES.filter(d => by[d.id]).map(d => ({
    id: d.id, name: d.name, facts: by[d.id], n: by[d.id].length }));
  return { rows, unsorted,
    sorted: rows.reduce((s, r) => s + r.n, 0),
    why: unsorted.length
      ? unsorted.length + " lines match no discipline in the declared list — reported rather than filed under a convenient heading"
      : null };
}

const TRADES = { DISCIPLINES, of, group };
root.INGEST_TRADES = TRADES;
if (typeof module !== "undefined" && module.exports) module.exports = TRADES;

})(typeof window !== "undefined" ? window : globalThis);
