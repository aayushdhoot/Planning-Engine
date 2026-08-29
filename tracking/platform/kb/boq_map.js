// ===================================================================
// DnB-OS · platform/kb/boq_map.js
// How the engine understands a BOQ: which priced line feeds which
// task type, with unit conversion. Lines that don't feed a task are
// CLASSIFIED, never dropped:
//   prelims — site running costs, no schedule task (debris, DLP...)
//   detail  — hardware/detail carried inside another task's work
//   ffe     — client FF&E installed inside the loose-furniture phase
//   suggest — real work the plan has NO task for -> engine raises it
// Every mapping carries why. sqft->m2 = 0.0929. GI duct ~8.5 kg/m2.
// ===================================================================

;(function () {

const SQFT = 0.0929;
const conv = { sqft2m2: q => q * SQFT, one: q => q, sqm2kg: q => q * 8.5, rm2no15: q => q / 1.5 };

// ---- line -> task-code mapping (share splits one line to many) ----
const MAP = [
  { lines:["CI.01"], code:"demo_ceiling",     c:"sqft2m2", why:"strip existing ceiling" },
  { lines:["CI.02"], code:"demo_floor_finish",c:"sqft2m2", why:"strip existing floor" },
  { lines:["CI.03"], code:"demo_partition",   c:"sqft2m2", why:"remove old partitions" },
  { lines:["CI.06"], code:"screed",           c:"sqft2m2", why:"self-levelling underlayment" },
  { lines:["CI.08"], code:"gi_stud_frame",    c:"sqft2m2", why:"partition system — frame" },
  { lines:["CI.08"], code:"board_one_face",   c:"sqft2m2", mult:2, why:"partition system — both faces" },
  { lines:["CI.08"], code:"partition_tape",   c:"sqft2m2", mult:2, why:"partition system — tape+joint" },
  { lines:["CI.09"], code:"glazing_partition",c:"sqft2m2", why:"toughened glass partitions" },
  { lines:["CI.10","CI.11"], code:"door_install", c:"one", why:"glass + flush doors" },
  { lines:["CI.12"], code:"carpet_tile",      c:"sqft2m2", why:"carpet tiles" },
  { lines:["CI.13","CI.20"], code:"stone_marble", c:"sqft2m2", why:"travertine floor + stone cladding" },
  { lines:["CI.14","CI.21"], code:"tile_vitrified", c:"sqft2m2", why:"vitrified floor + wall dado" },
  { lines:["CI.15"], code:"skirting",         c:"one", why:"skirting RM" },
  { lines:["CI.17","CI.25"], code:"paint_emulsion", c:"sqft2m2", why:"emulsion + soffit paint" },
  { lines:["CI.18","CI.19"], code:"joinery_panel", c:"sqft2m2", why:"veneer + acoustic panelling" },
  { lines:["CI.22","CI.24"], code:"ceiling_gypsum", c:"sqft2m2", why:"gypsum ceiling + timber raft (raft priced richer — flagged)" },
  { lines:["CI.23"], code:"ceiling_grid_tile",c:"sqft2m2", why:"mineral-fibre grid ceiling" },
  { lines:["CI.30"], code:"storage_unit",     c:"one", mult:0.5, why:"credenza RM ≈ 2 RM per unit" },
  { lines:["CI.33"], code:"workstation",      c:"one", why:"42 loose-furniture positions = the workstations" },
  { lines:["CI.43"], code:"final_clean",      c:"sqft2m2", why:"builder's clean" },
  { lines:["HV.10","HV.11"], code:"fcu_unit", c:"one", why:"cassettes + ductable units" },
  { lines:["HV.12","HV.13"], code:"duct_gi",  c:"sqm2kg", why:"GI duct area -> weight @8.5 kg/m2" },
  { lines:["HV.14"], code:"duct_insulation",  c:"one", why:"nitrile on supply ducts (sqm)" },
  { lines:["HV.16"], code:"grille_diffuser",  c:"rm2no15", why:"slot diffusers ~1.5 m each" },
  { lines:["HV.17"], code:"grille_diffuser",  c:"one", why:"square diffusers + return grilles" },
  { lines:["HV.02","HV.03","HV.04","HV.05"], code:"refnet_pipe", c:"one", why:"VRF copper pairs" },
  { lines:["HV.21","HV.22"], code:"cpvc_pipe",c:"one", why:"AC drain piping" },
  { lines:["EL.14"], code:"wiring_point",     c:"one", why:"lighting points" },
  { lines:["EL.16","EL.17","EL.18","EL.19","EL.20"], code:"wiring_point", c:"one", why:"power/UPS/16A/20A/geyser points" },
  { lines:["EL.24","EL.25","EL.26"], code:"conduit", c:"one", why:"GI conduit runs" },
  { lines:["EL.21","EL.22","EL.23","EL.59"], code:"cable_pull", c:"one", why:"circuit mains + submains + flex" },
  { lines:["EL.44","EL.45","EL.47","EL.48"], code:"light_fixture", c:"one", why:"panels + downlights + decorative + emergency" },
  { lines:["EL.46"], code:"light_fixture",    c:"rm2no15", why:"LED profile ~1.5 m per fitting" },
  { lines:["EL.01","EL.02","EL.03","EL.04","EL.05"], code:"db_panel", c:"one", why:"panel + DBs" },
  { lines:["PL.01","PL.02","PL.03","PL.04","PL.08"], code:"cpvc_pipe", c:"one", why:"CPVC supply + drainage" },
  { lines:["PL.06","PL.07","PL.12"], code:"sanitary_fixture", c:"one", why:"geysers + RO + sinks (sets)" },
  { lines:["FI.01","FI.02"], code:"sprinkler_head", c:"one", why:"new heads + relocated heads" },
  { lines:["FI.03","FI.04","FI.05","FI.06"], code:"sprinkler_pipe", c:"one", why:"new ranges/drops" },
  { lines:["FI.09","FI.10"], code:"elv_device", c:"one", why:"detectors + MCPs/hooters (fire devices)" },
  { lines:["NV.02"], code:"data_drop",        c:"one", why:"CAT-6A outlets" },
  { lines:["NV.08","NV.09","NV.11","NV.12","NV.15","NV.17"], code:"elv_device", c:"one", why:"APs, cameras, ACS doors, speakers, sensors, displays" },
];

// ---- classified non-task lines -------------------------------------
const CLASSES = {
  prelims: { lines:["CI.04","CI.05","CI.16","CI.41","CI.42","CI.44","HV.09","HV.26","HV.28","HV.29","HV.30","EL.06","EL.07","EL.08","EL.09","EL.10","EL.11","EL.12","EL.13","EL.15","EL.27","EL.28","EL.29","EL.30","EL.31","EL.32","EL.33","EL.34","EL.35","EL.36","EL.37","EL.38","EL.39","EL.40","EL.41","EL.43","EL.51","EL.52","EL.53","EL.54","EL.55","EL.56","EL.57","EL.58","EL.60","PL.05","PL.09","PL.10","PL.11","PL.13","FI.07","FI.08","FI.11","FI.12","FI.13","FI.15","FI.16","HV.06","HV.07","HV.08","HV.15","HV.18","HV.19","HV.20","HV.27","NV.03","NV.04","NV.05","NV.06","NV.07","NV.10","NV.13","NV.14","NV.19","NV.20","NV.21"],
    label:"Hardware, accessories, testing & site running costs", note:"carried inside the install tasks' rates and phases — no separate schedule line needed" },
  ffe: { lines:["CI.34","CI.35","CI.36","CI.37","CI.38"],
    label:"Loose furniture (FF&E)", note:"installed inside the loose-furniture phase alongside workstations" },
  suggest: { lines:["CI.07","CI.26","CI.27","CI.28","CI.29","CI.31","CI.32","CI.39","CI.40","HV.01","HV.23","HV.24","HV.25","EL.42","EL.49","EL.50","FI.14","NV.01","NV.16","NV.18"],
    label:"Real work the plan has no task for yet", note:"engine raises these as queries — it adds nothing without your OK" },
};

// suggested task per suggest-line — add = the real schedulable task the
// engine creates ON YOUR OK (proxy zone + effort-true qty, conf LOW until
// you confirm the zone; src explains itself)
const SUGGEST = {
  "CI.07":{ name:"Making good walls/soffit/screed after strip-out", phase:"civil",   qty:"4,320 sqft", add:{code:"plaster",qty:401,zone:"circulation"} },
  "CI.26":{ name:"Concealed LED strip lighting in ceiling coves",   phase:"electrical", qty:"356 RM",  add:{code:"light_fixture",qty:237,zone:"cafeteria"} },
  "CI.27":{ name:"Gypsum pelmets / curtain boxes",                  phase:"ceiling", qty:"46 RM",      add:{code:"ceiling_gypsum",qty:14,zone:"circulation"} },
  "CI.28":{ name:"Reception desk — fabricate + install",            phase:"joinery", qty:"1 no",       add:{code:"joinery_panel",qty:12,zone:"reception"} },
  "CI.29":{ name:"Window-ledge banquette seating",                  phase:"joinery", qty:"17.5 RM",    add:{code:"joinery_panel",qty:14,zone:"cafeteria"} },
  "CI.31":{ name:"Cafeteria service counters",                      phase:"joinery", qty:"22 RM",      add:{code:"joinery_panel",qty:18,zone:"cafeteria"} },
  "CI.32":{ name:"Product-display plinths, backlit",                phase:"joinery", qty:"1 lot",      add:{code:"joinery_panel",qty:10,zone:"display"} },
  "CI.39":{ name:"Roller blinds — supply + fix",                    phase:"closeout", qty:"2,600 sqft", add:{code:"joinery_panel",qty:30,zone:"workstations"} },
  "CI.40":{ name:"Internal brand signage",                          phase:"closeout", qty:"1 lot",     add:{code:"joinery_panel",qty:8,zone:"display"} },
  "HV.01":{ name:"VRF outdoor units — place + commission (48 TR)",  phase:"hvac",    qty:"6 ODUs",     add:{code:"fcu_unit",qty:6,zone:"services"} },
  "HV.23":{ name:"Treated fresh-air unit (TFA) — install",          phase:"hvac",    qty:"1 no",       add:{code:"fcu_unit",qty:1,zone:"services"} },
  "HV.24":{ name:"Toilet/pantry exhaust fans",                      phase:"hvac",    qty:"3 nos",      add:{code:"fcu_unit",qty:3,zone:"washrooms"} },
  "HV.25":{ name:"VRF controls + central touch controller",         phase:"hvac",    qty:"1 lot",      add:{code:"elv_device",qty:12,zone:"services"} },
  "EL.42":{ name:"65W USB-C charging outlets",                      phase:"electrical", qty:"12 nos",  add:{code:"wiring_point",qty:12,zone:"reception"} },
  "EL.49":{ name:"Track lighting at display spine",                 phase:"electrical", qty:"1 lot",   add:{code:"light_fixture",qty:12,zone:"display"} },
  "EL.50":{ name:"UPS system + battery bank — install",             phase:"electrical", qty:"1 set",   add:{code:"db_panel",qty:1,zone:"hub_room"} },
  "FI.14":{ name:"Clean-agent fire suppression — server/hub room",  phase:"fire",    qty:"1 lot",      add:{code:"sprinkler_head",qty:8,zone:"hub_room"} },
  "NV.01":{ name:"CAT-6A cable pulling (17 boxes ≈ 5,100 m)",       phase:"elv",     qty:"17 boxes",   add:{code:"cable_pull",qty:5100,zone:"workstations"} },
  "NV.16":{ name:"Boardroom video-conference system",               phase:"elv",     qty:"1 set",      add:{code:"elv_device",qty:6,zone:"boardroom"} },
  "NV.18":{ name:"Cafeteria menu displays + BGM",                   phase:"elv",     qty:"1 lot",      add:{code:"elv_device",qty:4,zone:"cafeteria"} },
};

// ---- apply: BOQ lines -> quantities per task code ------------------
function apply(boq) {
  const byId = {}; boq.lines.forEach(l => byId[l.id] = l);
  const byCode = {}, usedLines = {};
  MAP.forEach(m => {
    m.lines.forEach(id => {
      const l = byId[id]; if (!l) return;
      usedLines[id] = true;
      const q = conv[m.c](l.qty) * (m.mult || 1);
      const e = byCode[m.code] = byCode[m.code] || { qty: 0, lines: [], amount: 0, why: m.why };
      e.qty += q; e.lines.push(id); e.amount += l.amount * (m.code === "board_one_face" || m.code === "partition_tape" ? 0 : 1);
    });
  });
  Object.keys(byCode).forEach(c => byCode[c].qty = Math.round(byCode[c].qty));

  const classed = {};
  Object.keys(CLASSES).forEach(k => {
    classed[k] = { label: CLASSES[k].label, note: CLASSES[k].note, lines: [], amount: 0 };
    CLASSES[k].lines.forEach(id => {
      const l = byId[id]; if (!l) return;
      usedLines[id] = true; classed[k].lines.push(l); classed[k].amount += l.amount;
    });
  });
  const unread = boq.lines.filter(l => !usedLines[l.id]);
  const suggestions = (classed.suggest ? classed.suggest.lines : []).map(l =>
    Object.assign({ line: l.id, amount: l.amount, desc: l.desc }, SUGGEST[l.id] || { name: l.desc.slice(0, 60), phase: "?", qty: l.qty + " " + l.unit }));
  return { byCode, classed, unread, suggestions };
}

const BOQMAP = { MAP, CLASSES, SUGGEST, apply };
(function (g) { g.KB_BOQMAP = BOQMAP; })(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = BOQMAP;

})();
