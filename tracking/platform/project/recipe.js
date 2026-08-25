// ===================================================================
// DnB-OS · platform/project/recipe.js
// The shared take-off recipe: a zone list (name, area, traits) becomes
// a full task set with quantities — standard fit-out factors, each one
// written where it is used. This is what lets a NEW project plan from
// nothing but its layout: every quantity flagged "factor — assumption,
// confirm" until its BOQ is read.
// Zone traits: floor carpet|vitrified|stone|vinyl|raised ·
//   ceiling gypsum|grid|none · wet · demo · ac · part (wall sqft per
//   sqft floor) · glaze · doors · joinery m2 · storage · ws · data ·
//   db · elv · sanitary · texture m2 · kitchen
// ===================================================================

;(function () {

const SQFT = 0.0929;

function zoneTasks(z) {
  const A = z.area, M = A * SQFT, T = [];
  const add = (code, qty, note) => { if (qty >= 0.5) T.push({
    id: z.id + ":" + code, code, zone: z.id, qty: Math.round(qty), conf: z.conf || "med",
    src: note || "layout area × factor — assumption, confirm" }); };
  if (z.demo) { add("demo_floor_finish", M, "strip floor finish · full zone");
    add("demo_ceiling", M*0.9, "old ceiling out · 90% of zone");
    add("demo_partition", M*0.25, "existing walls out · 0.25 m2 per m2 floor"); }
  if (z.wet) { add("blockwork", M*1.2, "wet-area walls"); add("plaster", M*2.4, "both faces");
    add("waterproofing", M*1.1, "floor + upturns"); add("screed", M, "full wet floor");
    add("tile_vitrified", M*2.7, "floor + wall tiling to height");
    add("cpvc_pipe", A*0.35, "supply+drain runs"); add("sanitary_fixture", z.sanitary||0, "fixture install"); }
  if (z.part) { const f = M*z.part;
    add("gi_stud_frame", f, "partition walls · " + z.part + " per m2 floor");
    add("board_one_face", f*2, "both faces of the frame");
    add("partition_tape", f*2, "tape + joint what was boarded"); }
  add("wiring_point", A/35, "1 point per 35 sqft");
  add("conduit", A*0.3, "overhead runs · 0.3 m per sqft");
  if (z.ceiling === "gypsum") add("ceiling_gypsum", M*0.92, "92% of zone ceilinged");
  if (z.ceiling === "grid") add("ceiling_grid_tile", M*0.92, "92% of zone ceilinged");
  if (!z.wet) {
    if (z.floor === "stone") { add("screed", M*0.95, "bed under stone"); add("stone_marble", M*0.95, "95% of zone"); }
    if (z.floor === "vitrified") { add("screed", M*0.95, "bed under tile"); add("tile_vitrified", M*0.95, "95% of zone"); }
    if (z.floor === "carpet") add("carpet_tile", M*0.95, "95% of zone");
    if (z.floor === "vinyl") add("vinyl_lvt", M*0.95, "95% of zone");
    if (z.floor === "raised") add("raised_floor", M*0.95, "95% of zone");
    add("skirting", M*0.4, "≈0.4 m per m2 floor");
  }
  const wall = (z.part ? M*z.part*2 : 0) + M*0.5;
  add("putty_primer", wall, "partition faces + shell walls");
  add("paint_emulsion", wall, "same surfaces, finish coats");
  if (z.texture) add("texture_paint", z.texture, "feature walls · designed m2");
  if (z.glaze) add("glazing_partition", M*z.glaze, "glazed fronts");
  if (z.doors) add("door_install", z.doors, "count of rooms");
  if (z.joinery) add("joinery_panel", z.joinery, "designed panelling m2");
  if (z.storage) add("storage_unit", z.storage, "count");
  if (z.ws) add("workstation", z.ws, "workstation count");
  if (z.ac) { const duct = A*0.5;
    add("duct_gi", duct, "0.5 kg per sqft served"); add("duct_insulation", duct*0.09, "duct surface");
    add("fcu_unit", Math.max(1, Math.round(A/550)), "1 unit per ~550 sqft");
    add("grille_diffuser", A/160, "1 per ~160 sqft"); }
  else add("grille_diffuser", A/200, "ventilation only");
  add("cable_pull", A*0.45, "0.45 m per sqft"); add("light_fixture", A/55, "1 per 55 sqft");
  add("sprinkler_pipe", A*0.12, "0.12 m per sqft"); add("sprinkler_head", A/130, "1 per 130 sqft");
  if (z.data) add("data_drop", z.data, "seat/room count");
  add("elv_device", (z.elv||0) + A/150, "access/CCTV/AV density");
  if (z.db) add("db_panel", z.db, "distribution boards");
  if (z.kitchen) {
    const kadd = (code, qty, note) => T.push({ id: z.id + ":kitchen_" + code, code, zone: z.id,
      qty: Math.round(qty), conf: "low", src: note });
    kadd("cpvc_pipe", 60, "kitchen drainage + trenching · confirm");
    kadd("duct_gi", 450, "kitchen exhaust ducting · confirm");
    kadd("joinery_panel", 14, "SS counters & kitchen works · confirm");
    kadd("sanitary_fixture", 4, "dishwash fixtures & sinks · confirm");
  }
  add("final_clean", M, "full zone");
  return T;
}

function buildFromZones(zones) {
  let T = []; zones.forEach(z => { T = T.concat(zoneTasks(z)); }); return T;
}
function qtyMapFromZones(zones) {
  const m = {}; buildFromZones(zones).forEach(t => m[t.id] = { qty: t.qty, conf: t.conf, src: t.src }); return m;
}

const RECIPE = { zoneTasks, buildFromZones, qtyMapFromZones };
(function (g) { g.PROJ_RECIPE = RECIPE; })(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = RECIPE;

})();
