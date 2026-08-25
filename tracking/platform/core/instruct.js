// ===================================================================
// DnB-OS · platform/core/instruct.js
// The instruction box brain. The user writes what changed, in plain
// words; the engine turns it into structured changes, SHOWS its
// understanding, and only re-plans on confirm. Never a silent edit.
//
// Understands (v1, rule-based — model parsing arrives with launcher):
//   dates      "external end 5 Nov" · "internal start moves to 9 July"
//   slippage   "we lost 8 days" · "start slipped by 5 days"
//   buffer     "keep 10 days buffer"
//   crews      "use 4 fronts" · "only 3 teams" · "let the engine decide crews"
//   quantities "vitrified tiling is 5200 sqft" · "lights are 500 nos"
//   zones      "drop the pantry" · "add back the pantry"
//   calendar   "site shut 21 Aug to 25 Aug"
//   area basis "BOQ area is right" / "deck area is right"
//
// parse(text, ctx) -> { changes:[{kind, label, ...data}], unknown:[...] }
// ctx: { norms:[{code,name,unit}], zones:[{id,name}], win, year }
// ===================================================================

;(function () {

const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
const NUMWORDS = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };

function findDate(s, year) {
  // "5 nov", "nov 5", "5th november", "05/11", "2026-11-05"
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s*)?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*/i);
  if (m) return iso(year, MONTHS[m[2].toLowerCase()], +m[1]);
  m = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\s*(\d{1,2})(?:st|nd|rd|th)?/i);
  if (m) return iso(year, MONTHS[m[1].toLowerCase()], +m[2]);
  m = s.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (m) { const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : year; return iso(y, +m[2], +m[1]); } // dd/mm
  return null;
}
function iso(y, mo, d) { return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0"); }
function num(s) {
  const m = String(s).match(/[\d][\d,\.]*/);
  if (m) return parseFloat(m[0].replace(/,/g, ""));
  for (const w in NUMWORDS) if (new RegExp("\\b" + w + "\\b").test(s)) return NUMWORDS[w];
  return null;
}

// manual aliases (longest match wins), on top of the norm names
const QTY_ALIASES = [
  ["vitrified tiling", "tile_vitrified"], ["vitrified tile", "tile_vitrified"], ["vitrified", "tile_vitrified"],
  ["wall dado", "tile_vitrified"], ["tiling", "tile_vitrified"], ["tiles", "tile_vitrified"],
  ["carpet tiles", "carpet_tile"], ["carpet", "carpet_tile"],
  ["marble", "stone_marble"], ["travertine", "stone_marble"], ["stone flooring", "stone_marble"], ["stone", "stone_marble"],
  ["gypsum ceiling", "ceiling_gypsum"], ["grid ceiling", "ceiling_grid_tile"], ["false ceiling", "ceiling_gypsum"],
  ["emulsion", "paint_emulsion"], ["painting", "paint_emulsion"], ["paint", "paint_emulsion"],
  ["putty", "putty_primer"], ["primer", "putty_primer"],
  ["light fixtures", "light_fixture"], ["light fittings", "light_fixture"], ["lights", "light_fixture"], ["fixtures", "light_fixture"],
  ["wiring points", "wiring_point"], ["electrical points", "wiring_point"], ["points", "wiring_point"],
  ["cable pulling", "cable_pull"], ["cabling", "cable_pull"], ["cables", "cable_pull"],
  ["conduiting", "conduit"], ["conduit", "conduit"],
  ["ducting", "duct_gi"], ["duct", "duct_gi"],
  ["duct insulation", "duct_insulation"],
  ["diffusers", "grille_diffuser"], ["grilles", "grille_diffuser"],
  ["fcu", "fcu_unit"], ["cassettes", "fcu_unit"], ["indoor units", "fcu_unit"],
  ["refnet", "refnet_pipe"], ["copper piping", "refnet_pipe"],
  ["sprinkler pipe", "sprinkler_pipe"], ["sprinkler piping", "sprinkler_pipe"], ["sprinklers", "sprinkler_head"], ["sprinkler heads", "sprinkler_head"],
  ["detectors", "elv_device"], ["cameras", "elv_device"], ["speakers", "elv_device"],
  ["data points", "data_drop"], ["data drops", "data_drop"], ["lan points", "data_drop"], ["cat6", "data_drop"],
  ["glass partition", "glazing_partition"], ["glazing", "glazing_partition"], ["glass", "glazing_partition"],
  ["doors", "door_install"], ["flush doors", "door_install"],
  ["workstations", "workstation"], ["ws", "workstation"],
  ["storage units", "storage_unit"], ["credenza", "storage_unit"], ["storage", "storage_unit"],
  ["joinery", "joinery_panel"], ["panelling", "joinery_panel"], ["paneling", "joinery_panel"], ["veneer", "joinery_panel"],
  ["skirting", "skirting"],
  ["screed", "screed"], ["underlayment", "screed"],
  ["partition frame", "gi_stud_frame"], ["stud partition", "gi_stud_frame"], ["partitions", "gi_stud_frame"], ["partition", "gi_stud_frame"],
  ["boarding", "board_one_face"], ["gypsum board", "board_one_face"],
  ["blockwork", "blockwork"], ["plaster", "plaster"], ["waterproofing", "waterproofing"],
  ["cpvc", "cpvc_pipe"], ["plumbing pipe", "cpvc_pipe"], ["drain", "cpvc_pipe"],
  ["sanitary", "sanitary_fixture"], ["db", "db_panel"], ["distribution board", "db_panel"], ["panels", "db_panel"],
  ["raised floor", "raised_floor"], ["vinyl", "vinyl_lvt"], ["lvt", "vinyl_lvt"],
  ["demolition", "demo_partition"], ["final clean", "final_clean"], ["cleaning", "final_clean"],
];
const FAMILIES = {
  demolition: ["demo_ceiling","demo_partition","demo_floor_finish"],
  ceiling: ["ceiling_gypsum","ceiling_grid_tile","ceiling_tiles"],
  flooring: ["tile_vitrified","stone_marble","carpet_tile","vinyl_lvt","raised_floor"],
};
function resolveThing(thing, norms) {
  thing = thing.replace(/^the\s+/, "").trim();
  if (FAMILIES[thing]) return { codes: FAMILIES[thing], name: thing.charAt(0).toUpperCase()+thing.slice(1)+" (all "+FAMILIES[thing].length+" activities)" };
  const al = QTY_ALIASES.slice().sort((x,y)=>y[0].length-x[0].length).find(([k])=>thing===k||thing.includes(k)||k.includes(thing));
  if (al) { const n=(norms||[]).find(n2=>n2.code===al[1]); return { codes:[al[1]], name:(n&&n.name)||al[1] }; }
  const hits=(norms||[]).filter(n2=>n2.name.toLowerCase().includes(thing));
  if (hits.length) { const h=hits.sort((x,y)=>x.name.length-y.name.length)[0]; return { codes:[h.code], name:h.name }; }
  return null;
}
const SQFT = 0.0929;

function parse(text, ctx) {
  const year = ctx.year || 2026;
  const changes = [], unknown = [];
  // split into clauses on . ; , and "and" between statements
  const clauses = String(text).split(/[.;\n]|,(?![\d])/).map(s => s.trim()).filter(Boolean);

  clauses.forEach(raw => {
    const s = raw.toLowerCase();
    let matched = false;

    // ---- area basis --------------------------------------------------
    if (/\b(boq)\b.*\b(right|correct|truth|final)\b/.test(s)) {
      changes.push({ kind: "area", value: "boq", label: "Area basis: the BOQ" + (ctx.areas && ctx.areas.boq ? " (" + ctx.areas.boq.toLocaleString("en-IN") + " sqft)" : "") + " is the truth" }); matched = true;
    } else if (/\b(deck|layout)\b.*\b(right|correct|truth|final)\b/.test(s)) {
      changes.push({ kind: "area", value: "deck", label: "Area basis: the design layout" + (ctx.areas && ctx.areas.deck ? " (" + ctx.areas.deck.toLocaleString("en-IN") + " sqft)" : "") + " is the truth" }); matched = true;
    }

    // ---- deadline lock (the client date is immovable) ------------------
    if (/\b(deadline|committed date|client date)\b.*\b(locked?|immovable|holds?|fixed|final)\b|\bstick to\b.*\bdeadline\b|\bhold the deadline\b/.test(s)) {
      changes.push({ kind: "deadlinelock", value: true, label: "DEADLINE LOCKED — the committed client date is immovable; the engine now computes the path to it, not the size of the miss" });
      matched = true; return;
    }
    if (/\bunlock\b.*\bdeadline\b|\bdeadline\b.*\bunlocked?\b/.test(s)) {
      changes.push({ kind: "deadlinelock", value: false, label: "Deadline unlocked — slips report as findings again" });
      matched = true; return;
    }

    // ---- clear progress facts -----------------------------------------
    if (/^(?:clear|reset|delete)\s+(?:all\s+)?(?:progress|facts)$/.test(s)) {
      changes.push({ kind: "progressclear", label: "All recorded progress facts cleared — the plan returns to pure forecast" });
      matched = true; return;
    }

    // ---- PROGRESS FACTS (BEFORE everything — "demolition done" must
    // never be eaten by a scope or qty pattern). Grammar:
    //   [mark] <thing> done|finished|complete|started [in <zone>] [on <date>]
    //   <discipline drawings> approved|issued
    {
      // ETA fact: "<thing> [is] going till 10th nov" · "will finish by 5 dec"
      // · "ceiling till 10 nov [in cafeteria]" — pins the EXPECTED FINISH
      const em = s.match(/^(?:the\s+)?(.+?)\s+(?:is\s+|are\s+)?(?:going(?:\s+on)?|running|expected|will\s+(?:go|run|finish|end)|finish(?:ing|es)?|ends?)?\s*(?:till|until|upto|up\s+to|by)\s+(.+?)(?:\s+in\s+([a-z &\/\-]+))?\s*$/);
      if (em) {
        const hit = resolveThing(em[1].trim(), ctx.norms);
        const eta = findDate(em[2], year);
        if (hit && eta) {
          const z = em[3] && ctx.zones ? (ctx.zones.find(x => x.name.toLowerCase().includes(em[3].trim()) || em[3].includes(x.id)) || null) : null;
          hit.codes.forEach(c => changes.push({ kind: "progress", code: c, zone: z ? z.id : null, eta,
            label: "Fact: " + hit.name + (z ? " in " + z.name : " (all zones)") + " — running till " + eta + ", downstream re-planned off that date" }));
          matched = true; return;
        }
      }
      // percent fact first: "blockwork 60% [done] [in kitchen]" (TCS-style weekly tracking)
      const pcm = s.match(/^(?:mark\s+)?(.+?)\s+(\d{1,2})\s*%(?:\s*(?:done|complete[d]?))?(?:\s+in\s+([a-z &\/\-]+?))?\s*$/);
      if (pcm) {
        const thing = pcm[1].trim(), pct = +pcm[2]/100, zoneTxt = pcm[3];
        const hit = resolveThing(thing, ctx.norms);
        const z = zoneTxt && ctx.zones ? (ctx.zones.find(x => x.name.toLowerCase().includes(zoneTxt) || zoneTxt.includes(x.id)) || null) : null;
        if (hit && pct > 0 && pct < 1) {
          hit.codes.forEach(c => changes.push({ kind: "progress", code: c, zone: z ? z.id : null, pct,
            label: "Fact: " + hit.name + (z ? " in " + z.name : " (all zones)") + " — " + pcm[2] + "% complete, remainder rescheduled" }));
          matched = true; return;
        }
      }
      const pm = s.match(/^(?:mark\s+)?(.+?)\s+(done|finished|completed?|started|approved|issued)(?:\s+in\s+([a-z &\/\-]+?))?(?:\s+on\s+([a-z0-9 \-\/]+?))?\s*$/);
      if (pm) {
        const thing = pm[1].trim(), verb = pm[2], zoneTxt = pm[3], dateTxt = pm[4];
        const isStart = verb === "started";
        // date: loose parse, default today
        let iso = new Date().toISOString().slice(0, 10);
        if (dateTxt) { const d = new Date(dateTxt + " " + (ctx.year || new Date().getFullYear())); if (!isNaN(d)) iso = d.toISOString().slice(0, 10); }
        // 1) discipline drawings ("layouts", "rcp", "electrical drawings")
        const dwg = (ctx.drawings || []).find(d =>
          d.name.toLowerCase().includes(thing) || thing.includes(d.id.replace("dwg_", "")) ||
          d.id.replace("dwg_", "").includes(thing.replace(/ drawings?| layouts?| set/g, "")));
        // 2) package stage ("joinery po", "glazing delivery", "switchgear shop drawings")
        let pkgHit = null;
        if (!dwg && ctx.packages) for (const p of ctx.packages) {
          const pn = p.name.toLowerCase(), pid = p.id.replace(/_/g, " ");
          if (thing.includes(pid) || pn.includes(thing.replace(/ (po|order|delivery|submittal|shop drawings?|design|approval|manufactur\w*)$/, "").trim())) {
            const stage = /shop drawings?|design/.test(thing) ? "design" : /approval/.test(thing) ? "approval"
              : /po|order|award/.test(thing) ? "po" : /submittal|sample/.test(thing) ? "submittal"
              : /manufactur/.test(thing) ? "mfg" : /deliver/.test(thing) ? "delivery" : null;
            if (stage) { pkgHit = { id: "pkg:" + p.id + ":" + stage, label: p.name + " — " + stage }; break; }
          }
        }
        // 3) site work by norm name ("demolition", "waterproofing", "gypsum ceiling")
        let codeHit = null;
        if (!dwg && !pkgHit) {
          const nm = (ctx.norms || []).filter(n => n.name.toLowerCase().includes(thing) || thing.includes(n.name.toLowerCase().split(" ")[0].replace(/[^a-z]/g, "")) && thing.length > 3);
          const exact = nm.find(n => n.name.toLowerCase() === thing) || nm.sort((x, y) => x.name.length - y.name.length)[0];
          if (exact) codeHit = exact;
          else if (/demoli/.test(thing)) codeHit = { code: "demo_partition", name: "Demolition (all strip-out)" , _demoAll: true };
        }
        const z = zoneTxt && ctx.zones ? (ctx.zones.find(x => x.name.toLowerCase().includes(zoneTxt) || zoneTxt.includes(x.id)) || null) : null;
        const rec = o => { changes.push(Object.assign({ kind: "progress", label: "" }, o)); matched = true; }
        if (dwg && (verb === "approved" || verb === "done" || verb === "completed" || verb === "complete" || verb === "finished")) {
          rec({ id: "dwg:" + dwg.id + ":draw", af: iso, label: "Fact: " + dwg.name + " — issued (" + iso + ")" });
          rec({ id: "dwg:" + dwg.id + ":apr", af: iso, label: "Fact: " + dwg.name + " — client approved (" + iso + ")" });
        } else if (dwg && verb === "issued") {
          rec({ id: "dwg:" + dwg.id + ":draw", af: iso, label: "Fact: " + dwg.name + " — GFC issued (" + iso + "), approval still open" });
        } else if (pkgHit) {
          rec(isStart ? { id: pkgHit.id, as: iso, label: "Fact: " + pkgHit.label + " — started " + iso }
                      : { id: pkgHit.id, af: iso, label: "Fact: " + pkgHit.label + " — done " + iso });
        } else if (codeHit) {
          const codes = codeHit._demoAll ? ["demo_ceiling", "demo_partition", "demo_floor_finish"] : [codeHit.code];
          codes.forEach(c => rec(isStart
            ? { code: c, zone: z ? z.id : null, as: iso, label: "Fact: " + (codeHit.name || c) + (z ? " in " + z.name : " (all zones)") + " — started " + iso }
            : { code: c, zone: z ? z.id : null, af: iso, label: "Fact: " + (codeHit.name || c) + (z ? " in " + z.name : " (all zones)") + " — done " + iso }));
        }
        if (matched) return; // a fact clause is fully consumed
      }
    }

    // ---- approval SLA + pre-order (BEFORE fronts/buffer — most-specific
    // first: "approvals take 7 days" must never fall to a generic pattern)
    let m = s.match(/\bapprovals?\b[^\d]{0,20}(\d{1,2})\s*(?:working\s*|w)?days?\b/);
    if (m) {
      const n = +m[1];
      if (n >= 1 && n <= 30) { changes.push({ kind: "aprsla", value: n, label: "Client approval SLA: " + n + " working days per design package (confirmed — assumption cleared)" }); matched = true; }
    }
    if (!matched) {
      const off = s.match(/\b(?:cancel|stop|undo|no)\s+pre-?order(?:ing)?\b(?:\s+(?:on\s+)?([a-z &+\-]+?))?\s*$/);
      const on  = off ? null : s.match(/\bpre-?order(?:ing)?\b\s*(?:on\s+)?([a-z &+\-]*?)\s*$/);
      const pick = off || on;
      if (pick) {
        const namePart = (pick[1] || "").trim();
        const all = !namePart || /^(everything|all( packages)?|the lot)$/.test(namePart);
        let pkg = null;
        if (!all && ctx.packages) pkg = ctx.packages.find(p =>
          p.id.replace(/_/g, " ") === namePart || p.name.toLowerCase().includes(namePart) || namePart.includes(p.id.replace(/_/g, " ")));
        if (all || pkg) {
          changes.push({ kind: "preorder", pkg: all ? "all" : pkg.id, on: !off,
            label: (off ? "Pre-order OFF: " : "Pre-order ON: ") + (all ? "every design-gated package" : pkg.name) +
                   (off ? " — approval back in the serial chain" : " — PO on approved typicals; client approval parallel, gates delivery only") });
          matched = true;
        }
      }
    }

    // ---- duct insulation method (corpus contradiction answer) ---------
    if (/pre-?insulat/.test(s) && /duct/.test(s)) {
      changes.push({ kind: "ductmethod", value: "pre", label: "Duct method: PRE-INSULATED on ground (DHL method) — insulation precedes hanging, in-void leak gate dropped" }); matched = true;
    } else if (/\b(wrap|insulat\w*)\b.*\bafter\b.*\b(hang|duct|install)/.test(s)) {
      changes.push({ kind: "ductmethod", value: "wrap", label: "Duct method: wrap AFTER hanging (Emirates method) — duct → leak test → insulation" }); matched = true;
    }

    // ---- fronts / crews ----------------------------------------------
    m = s.match(/\b(?:engine|auto(?:matic)?)\b.*\b(front|crew|team|gang)/);
    if (m) { changes.push({ kind: "fronts", value: null, label: "Crews: back to the engine's own pick" }); matched = true; }
    m = matched ? null : s.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:working\s*)?(?:fronts?|teams?|crews?|gangs?)\b/);
    if (m) {
      const n = num(m[1]);
      if (n >= 1 && n <= 12) { changes.push({ kind: "fronts", value: n, label: "Crews: run " + n + " front" + (n > 1 ? "s" : "") + " (your call — engine pick overridden)" }); matched = true; }
    }

    // ---- buffer -------------------------------------------------------
    m = s.match(/\bbuffer\b[^\d]*(\d+)\s*days?|(\d+)\s*days?\s*(?:of\s*)?buffer\b/);
    if (m) {
      const n = +(m[1] || m[2]);
      changes.push({ kind: "buffer", value: n, label: "Buffer: internal deadline set " + n + " days before the external end" }); matched = true;
    }

    // ---- shell hold: trades vs demolition -------------------------------
    if (/\b(nothing|no (trade|work))\b.*\b(till|until|before)\b.*demoli|hold\b.*\b(trades?|works?)\b.*demoli|\bshell hold on\b|wait for (the )?(cleared )?shell/.test(s)) {
      changes.push({ kind:"shellHold", value:true, label:"Site rule ON: nothing starts until demolition is complete and the shell is cleared" }); matched = true;
    } else if (/\btrades? (can |may )?follow demoli|zone by zone after demo|\bshell hold off\b|overlap (the )?demoli/.test(s)) {
      changes.push({ kind:"shellHold", value:false, label:"Site rule OFF: trades follow demolition zone by zone (fastest, needs containment)" }); matched = true;
    }

    // ---- start from today / real start ---------------------------------
    if (/\b(start|replan|begin)\b.*\b(from\s+)?today\b|\btoday\b.*\b(start|onwards)\b/.test(s)) {
      const today = new Date().toISOString().slice(0, 10);
      changes.push({ kind:"date", field:"intStart", value: today,
        label:"Internal start moves to today (" + today + ") — contract dates and RA gates stay put" });
      matched = true;
    }

    // ---- slippage: "lost 8 days", "slipped by 5 days" -----------------
    m = s.match(/\b(?:lost|slip(?:ped)?|behind(?: by)?|delay(?:ed)?(?: by)?)\s*(\d+)\s*days?\b/);
    if (m) {
      changes.push({ kind: "slip", value: +m[1], label: "Slippage: internal start pushed " + m[1] + " days forward" }); matched = true;
    }

    // ---- site shut ----------------------------------------------------
    let shutHit = false;
    m = s.match(/\b(?:site\s*)?(?:shut|closed?|holiday|no work)\b/);
    if (m) {
      const d1 = findDate(s, year);
      if (d1) {
        const tail = s.slice(s.indexOf(m[0]) + m[0].length);
        const rangeM = s.match(/(?:to|until|till|through|-)\s*((?:\d{1,2}[^\d]{0,6})?(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\s*\d{0,2})/i);
        let d2 = null;
        if (rangeM) { d2 = findDate(rangeM[1], year); }
        if (d2 && d2 < d1) d2 = null;
        changes.push({ kind: "shut", from: d1, to: d2 || d1, label: "Site shut: " + d1 + (d2 && d2 !== d1 ? " to " + d2 : "") + " (added to the calendar)" });
        matched = true; shutHit = true;
      }
    }

    // ---- dates ---------------------------------------------------------
    if (!shutHit) {
      const d = findDate(s, year);
      const startWord = /\b(start|commence|begin|mobili[sz])/i.test(s);
      const endWord = /\b(end\b|deadline|finish|complet\w*|handover|deliver\w*)/i.test(s);
      if (d && (startWord || endWord)) {
        const internal = /\b(internal|our|team)\b/.test(s);
        const external = /\b(external|client|contract|committed)\b/.test(s);
        if (startWord) {
          const which = external ? "extStart" : internal ? "intStart" : "bothStart";
          changes.push({ kind: "date", field: which, value: d,
            label: (which === "bothStart" ? "Start (internal + external)" : which === "intStart" ? "Internal start" : "External start") + " moves to " + d });
        } else {
          const which = internal ? "intEnd" : external ? "extEnd" : "extEnd";
          changes.push({ kind: "date", field: which, value: d,
            label: (which === "intEnd" ? "Internal deadline" : "External (client) end" + (internal || external ? "" : " — no side named, took the client end")) + " moves to " + d });
        }
        matched = true;
      }
    }

    // ---- zones off / back ----------------------------------------------
    {
      const off = s.match(/\b(remove|drop|exclude|cut|skip|delete)\b(.*)/);
      const back = s.match(/\b(add back|restore|include|bring back)\b(.*)/);
      const zoneIn = txt => (ctx.zones || []).find(z =>
        txt.includes(z.id.replace(/_/g, " ")) || txt.includes(z.name.toLowerCase().split(" (")[0].split(" /")[0].split(" &")[0]));
      if (off) { const z = zoneIn(off[2]); if (z) { changes.push({ kind: "zoneOff", zone: z.id, label: "Scope: " + z.name + " removed from the plan" }); matched = true; } }
      else if (back) { const z = zoneIn(back[2]); if (z) { changes.push({ kind: "zoneOn", zone: z.id, label: "Scope: " + z.name + " back in the plan" }); matched = true; } }
    }

    // ---- quantity corrections -------------------------------------------
    {
      const qm = s.match(/(.*?)\b(?:is|are|=|to|now|should be|corrected to)\s*([\d][\d,\.]*)\s*(sq\s?ft|sft|sqft|m2|sqm|rm|nos?|m\b|kg)?/);
      if (qm && qm[2]) {
        const subject = qm[1];
        let hit = null;
        for (const [alias, code] of QTY_ALIASES) if (subject.includes(alias)) { hit = { alias, code }; break; }
        if (hit) {
          const norm = (ctx.norms || []).find(n => n.code === hit.code) || {};
          let qty = parseFloat(qm[2].replace(/,/g, "")), unit = (qm[3] || "").replace(/\s/g, "");
          let note = "";
          if (/^(sqft|sft|sqft)$/.test(unit) && norm.unit === "m2") { qty = Math.round(qty * SQFT); note = " (" + qm[2] + " sqft → " + qty + " m2)"; }
          else if (unit === "rm" && norm.unit === "m") unit = "m";
          changes.push({ kind: "qty", code: hit.code, value: Math.round(qty),
            label: "Quantity: " + (norm.name || hit.code) + " corrected to " + Math.round(qty).toLocaleString("en-IN") + " " + (norm.unit || unit) + note });
          matched = true;
        }
      }
    }

    if (!matched) unknown.push(raw);
  });

  return { changes, unknown };
}

// ---- command layer: everything the app can do, from one chat line ----
// parseCommand(text, ctx) -> { actions:[...instant, safe...],
//   changes:[...need confirm...], unknown:[...] }
// ctx adds: suggestions:[{line,name}], conflicts:[{code,name}],
//   hasIntEnd:boolean
function parseCommand(text, ctx) {
  const actions = [], changes = [], unknown = [];
  const t = String(text).trim(), s = t.toLowerCase();

  // ---- instant, safe: navigation / views / export / undo -------------
  const gb = /\b(?:group(?:ed)?|view|show|plan|arrange)\b[^.]*?\bby\s+(phase|zone|categor(?:y|ies)|trade)s?\b/.exec(s) || /^\s*by\s+(phase|zone|categor(?:y|ies)|trade)s?\s*$/.exec(s);
  if (gb) { const v = gb[1].startsWith("phase") ? "phase" : gb[1].startsWith("zone") ? "zone" : "cat";
    actions.push({ kind:"groupby", v, label:"Group the plan by " + (v==="cat"?"category":v) }); return { actions, changes, unknown }; }
  let m = s.match(/\b(?:open|show|go to|take me to|switch to)\b.*?(engine knowledge|knowledge|library|rulebook|sequence library|throughput|progress|s.?curve|earned value|velocity|training corpus|training|corpus|learning|all projects|projects|home|calendar|inputs|queries|intelligence|published plan|plan|long.?lead|critical|new project)/);
  if (m) {
    const map = { "all projects":"home", projects:"home", home:"home", calendar:"calendar",
      training:"corpus", corpus:"corpus", learning:"corpus", "training corpus":"corpus",
      knowledge:"knowledge", library:"knowledge", rulebook:"knowledge", "sequence library":"knowledge", throughput:"knowledge", "engine knowledge":"knowledge",
      progress:"progress", "s-curve":"progress", "s curve":"progress", "earned value":"progress", velocity:"progress",
      inputs:"inputs", queries:"queries", intelligence:"intel", "published plan":"plan",
      plan:"plan", "long lead":"track", "long-lead":"track", critical:"track", "new project":"newproj" };
    actions.push({ kind:"nav", view: map[m[1]] || "home", label: "Open " + m[1] });
    return { actions, changes, unknown };
  }
  if (/\bnew project\b/.test(s)) { actions.push({ kind:"nav", view:"newproj", label:"Open the new-project form" }); return { actions, changes, unknown }; }
  if (/\b(client view|client mode)\b/.test(s)) { actions.push({ kind:"mode", v:"client", label:"Switch to the client view" }); return { actions, changes, unknown }; }
  if (/\b(internal view|internal mode)\b/.test(s)) { actions.push({ kind:"mode", v:"internal", label:"Switch to the internal view" }); return { actions, changes, unknown }; }
  if (/\bgantt\b/.test(s) && !/\b(is|are|=)\b/.test(s)) { actions.push({ kind:"planview", v:"gantt", label:"Show the gantt" }); return { actions, changes, unknown }; }
  if (/\btable view\b/.test(s)) { actions.push({ kind:"planview", v:"table", label:"Show the table" }); return { actions, changes, unknown }; }
  m = s.match(/\b(category|sub.?category|activit(?:y|ies)|item|every item)\s*(level|detail)?\b/) && s.match(/\b(level|detail|roll|show)\b/) ? s.match(/\b(category|sub.?category|activit(?:y|ies)|every item|item)\b/) : null;
  if (m) { const lv = m[1].startsWith("sub") ? "sub" : m[1].startsWith("cat") ? "cat" : m[1].startsWith("activit") ? "act" : "item";
    actions.push({ kind:"level", v:lv, label:"Detail level: " + m[1] }); return { actions, changes, unknown }; }
  if (/\bexport\b.*\b(excel|xls)|\b(excel|xls)\b.*\bexport\b/.test(s)) { actions.push({ kind:"export", what:"xlsx", label:"Export Excel" }); return { actions, changes, unknown }; }
  if (/\bexport\b.*\bpdf\b|\bpdf\b.*\bexport\b|\bexport\b$/.test(s)) { actions.push({ kind:"export", what:"pdf", label:"Export PDF" }); return { actions, changes, unknown }; }
  if (/^undo\b|\bundo (that|last|it)\b/.test(s)) { actions.push({ kind:"undo", label:"Undo the last applied instruction" }); return { actions, changes, unknown }; }
  if (/\brefresh\b|\bre-?read\b|\bre-?sweep\b|\bsync\b.*\bdrive\b|\bdrive\b.*\b(sweep|sync|update)\b/.test(s)) { actions.push({ kind:"refresh", label:"Refresh inputs" }); return { actions, changes, unknown }; }

  // ---- publish (runs the testing gate, which itself asks) ------------
  if (/\bpublish\b/.test(s) && !/\bdon'?t|do not\b/.test(s)) {
    if (/\backnowledge|ack\b/.test(s)) actions.push({ kind:"pubAck", label:"Acknowledge the warnings and publish" });
    else actions.push({ kind:"publish", label:"Run the testing layers and publish (the gate will ask if anything is off)" });
    return { actions, changes, unknown };
  }

  // ---- confirmations as chat ------------------------------------------
  if (/\bapprove\b.*\bcalendar\b|\bcalendar\b.*\bapprove/.test(s)) {
    changes.push({ kind:"approveCal", label:"Approve the working calendar (signed as you)" });
  }
  if (/\b(dates?)\b.*\b(correct|right|confirmed?|final|ok(ay)?)\b|\bconfirm\b.*\bdates?\b/.test(s)) {
    if (ctx.hasIntEnd || findDate(s, ctx.year || 2026))
      changes.push({ kind:"datesOk", label:"Dates confirmed by you" });
    else
      unknown.push("To confirm dates, first give the internal deadline — e.g. \"internal deadline 22 Oct, dates are correct\"");
  }

  // ---- resolve a quantity fight by name: "lights — boq is right" -----
  const pick = /\b(boq|drawings?|layout)\b.*\b(right|correct|wins?|final)\b|go with (the )?(boq|drawings?)/.exec(s);
  if (pick && ctx.conflicts && ctx.conflicts.length) {
    const p = /drawing|layout/.test(pick[0]) ? "own" : "boq";
    for (const [alias, code] of QTY_ALIASES) {
      if (s.includes(alias) && ctx.conflicts.find(c => c.code === code)) {
        const c = ctx.conflicts.find(c => c.code === code);
        changes.push({ kind:"resolve", code, pick: p,
          label: "Settle " + c.name + ": " + (p === "boq" ? "the BOQ figure" : "the layout take-off figure") + " is right" });
        break;
      }
    }
  }

  // ---- suggested tasks: "add the reception desk" / "add all suggestions"
  if (ctx.suggestions && ctx.suggestions.length) {
    if (/\b(add|accept)\b.*\ball\b.*(suggest|task)/.test(s)) {
      changes.push({ kind:"suggestAll", action:"accepted", lines: ctx.suggestions.map(x=>x.line),
        label: "Add all " + ctx.suggestions.length + " BOQ-priced tasks the plan was missing" });
    } else {
      const addM = /\b(add|accept)\b/.test(s), disM = /\b(dismiss|not needed|reject|skip)\b/.test(s);
      if (addM || disM) {
        const hit = ctx.suggestions.find(x => {
          const words = x.name.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>3);
          return words.filter(w => s.includes(w)).length >= Math.min(2, words.length);
        });
        if (hit) changes.push({ kind:"suggest", line: hit.line, action: addM ? "accepted" : "dismissed",
          label: (addM ? "Add task: " : "Dismiss: ") + hit.name });
      }
    }
  }

  // ---- fall through to the plan-change parser -------------------------
  if (!changes.length && !actions.length) {
    const r = parse(t, ctx);
    return { actions, changes: r.changes, unknown: unknown.concat(r.unknown) };
  }
  // also collect plan changes that ride along in the same sentence
  const r = parse(t, ctx);
  const have = new Set(changes.map(c => c.kind + (c.code||"") + (c.field||"")));
  const resolving = changes.some(c => c.kind === "resolve");
  r.changes.forEach(c => {
    if (resolving && c.kind === "area") return; // the sentence was about a task, not the area basis
    if (!have.has(c.kind + (c.code||"") + (c.field||""))) changes.push(c);
  });
  return { actions, changes, unknown };
}

const INSTRUCT = { parse, parseCommand, findDate, QTY_ALIASES };
(function (g) { g.CORE_INSTRUCT = INSTRUCT; })(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = INSTRUCT;

})();
