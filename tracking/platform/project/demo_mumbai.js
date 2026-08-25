// ===================================================================
// DnB-OS · platform/project/demo_mumbai.js
// Second project in the house: Invesco-style Mumbai office, 6,500 sqft.
// NO BOQ yet — the engine runs on layout areas × standard factors and
// says so honestly (readiness Low, every quantity flagged assumption).
// This is the "minimum input" path: layout + dates publish a draft.
// Drop its priced BOQ through scripts/read_boq.py to upgrade it.
// ===================================================================

;(function () {

const SQFT = 0.0929;

const ZONES = [
  { id:"reception",   name:"Reception",             area:520,  conf:"med", demo:1, floor:"stone",     ceiling:"gypsum", part:0.5,  glaze:0.2,  doors:0, joinery:18, texture:12, ac:1 },
  { id:"boardroom",   name:"Boardroom (14 pax)",    area:380,  conf:"med", demo:1, floor:"carpet",    ceiling:"gypsum", part:1.4,  glaze:0.5,  doors:1, joinery:22, data:8, ac:1 },
  { id:"cabins",      name:"Director cabins (3)",   area:420,  conf:"med", demo:1, floor:"carpet",    ceiling:"gypsum", part:1.4,  glaze:0.5,  doors:3, storage:3, data:9, ac:1 },
  { id:"meeting",     name:"Meeting rooms (2)",     area:260,  conf:"med", demo:1, floor:"carpet",    ceiling:"gypsum", part:1.5,  glaze:0.5,  doors:2, data:10, ac:1 },
  { id:"workstations",name:"Workstations (58 WS)",  area:2600, conf:"med", demo:1, floor:"carpet",    ceiling:"grid",   part:0.12, glaze:0.05, data:116, ws:58, ac:1 },
  { id:"cafeteria",   name:"Cafe & breakout",       area:950,  conf:"med", demo:1, floor:"vitrified", ceiling:"grid",   part:0.2,  glaze:0.08, doors:1, joinery:20, storage:2, data:4, ac:1 },
  { id:"washrooms",   name:"Washrooms",             area:380,  conf:"med", demo:1, wet:1, floor:"vitrified", ceiling:"gypsum", part:0, glaze:0, doors:2, sanitary:8, ac:0 },
  { id:"server",      name:"Server / store",        area:190,  conf:"low", demo:0, floor:"raised",    ceiling:"grid",   part:1.2,  glaze:0,    doors:2, db:2, data:16, elv:6, ac:1 },
];

// same transparent take-off recipe as Kohler v0 (shared factors)
function zoneTasks(z) {
  const A = z.area, M = A * SQFT, T = [];
  const add = (code, qty, note) => { if (qty >= 0.5) T.push({
    id: z.id + ":" + code, code, zone: z.id, qty: Math.round(qty), conf: z.conf,
    src: note || "layout area × factor — assumption, confirm" }); };
  if (z.demo) { add("demo_floor_finish", M); add("demo_ceiling", M*0.9); add("demo_partition", M*0.25); }
  if (z.wet) { add("blockwork", M*1.2); add("plaster", M*2.4); add("waterproofing", M*1.1); add("screed", M);
    add("tile_vitrified", M*2.7); add("cpvc_pipe", A*0.35); add("sanitary_fixture", z.sanitary||0); }
  if (z.part) { const f=M*z.part; add("gi_stud_frame", f); add("board_one_face", f*2); add("partition_tape", f*2); }
  add("wiring_point", A/35); add("conduit", A*0.3);
  if (z.ceiling==="gypsum") add("ceiling_gypsum", M*0.92);
  if (z.ceiling==="grid") add("ceiling_grid_tile", M*0.92);
  if (!z.wet) {
    if (z.floor==="stone"){ add("screed", M*0.95); add("stone_marble", M*0.95); }
    if (z.floor==="vitrified"){ add("screed", M*0.95); add("tile_vitrified", M*0.95); }
    if (z.floor==="carpet") add("carpet_tile", M*0.95);
    if (z.floor==="vinyl") add("vinyl_lvt", M*0.95);
    if (z.floor==="raised") add("raised_floor", M*0.95);
    add("skirting", M*0.4);
  }
  const wall=(z.part?M*z.part*2:0)+M*0.5;
  add("putty_primer", wall); add("paint_emulsion", wall);
  if (z.texture) add("texture_paint", z.texture);
  if (z.glaze) add("glazing_partition", M*z.glaze);
  if (z.doors) add("door_install", z.doors);
  if (z.joinery) add("joinery_panel", z.joinery);
  if (z.storage) add("storage_unit", z.storage);
  if (z.ws) add("workstation", z.ws);
  if (z.ac) { const duct=A*0.5; add("duct_gi", duct); add("duct_insulation", duct*0.09);
    add("fcu_unit", Math.max(1, Math.round(A/550))); add("grille_diffuser", A/160); }
  else add("grille_diffuser", A/200);
  add("cable_pull", A*0.45); add("light_fixture", A/55);
  add("sprinkler_pipe", A*0.12); add("sprinkler_head", A/130);
  if (z.data) add("data_drop", z.data);
  add("elv_device", (z.elv||0)+A/150);
  if (z.db) add("db_panel", z.db);
  add("final_clean", M);
  return T;
}
function buildTasks(){ let T=[]; ZONES.forEach(z=>{T=T.concat(zoneTasks(z));}); return T; }
function qtyMap(){ const m={}; buildTasks().forEach(t=>m[t.id]={qty:t.qty,conf:t.conf,src:t.src}); return m; }

const PROJECT = {
  id: "invesco-mumbai-6f",
  name: "Invesco · Mumbai 6F",
  sub: "Design & build fit-out · 6,500 sq ft · BOQ pending",
  carpetSqft: 6500,
  areas: { deck: 6500, boq: null },
  hasBoq: false,
  defaults: { intStart: "2026-08-03", extStart: "2026-08-03", extEnd: "2026-11-30" },
  zones: ZONES,
  buildTasks, qtyMap,
  version: "v0 — layout areas × standard factors; no BOQ read yet",
};

(function (g) {
  g.PROJ_REGISTRY = g.PROJ_REGISTRY || [];
  g.PROJ_REGISTRY.push(PROJECT);
})(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = PROJECT;

})();
