// ===================================================================
// DnB-OS . platform/core/zoning.js . THE WORK GETS A PLACE
// A floor-level quantity is one crew doing the whole floor in series, and
// the schedule it produces finishes years late. Real work runs in parallel
// across rooms. This puts each task's quantity into the areas it belongs
// to — where that can be done from measurement, and never otherwise.
//
//   BASIS                  how each task code spreads, declared per code
//   shares(areas, basis)   each area's share of the floor, by measurement
//   distribute(tasks, areas)   floor quantities -> per-area quantities
//
// THE LAWS
//   . DISTRIBUTE BY SHARE, NEVER BY AN ASSUMED CONSTANT. A room's share of
//     the floor is its measured area over the measured total, and a share
//     needs no ceiling height, no wall thickness and no rate. The parts
//     add back to the whole exactly, and a guard checks that they do.
//   . A COUNT CANNOT BE SPREAD BY AREA. Six hundred light fittings are not
//     laid out in proportion to square footage, and pretending otherwise
//     puts fittings in a room the drawing gives none. Counted work stays
//     at floor level and SAYS SO until somebody counts it per room.
//   . AN AREA WITH A GUESSED OUTLINE STILL TAKES ITS SHARE, AND CARRIES
//     THE FLAG. Refusing it would silently move its work into the rooms
//     next door, which is worse than a flagged number.
//   . AN UNNAMED AREA TAKES NO WORK. Nothing can be planned into a place
//     nobody can name, and quietly loading it is how a fifth of a floor
//     gets scheduled against a room that does not exist on any drawing.
//   . WHAT COULD NOT BE ZONED IS RETURNED, WITH THE REASON AND THE VALUE.
//     A zoned plan that hides its unzoned half is the same lie as a
//     schedule that hides its parked scope.
//
// Pure: tasks and areas in, tasks with places out. No clock, no I/O.
// ===================================================================

;(function (root) {

// How a task code spreads across a floor. Declared per code, because the
// answer is a fact about the trade and not about this project.
//   floor      proportional to floor area — finishes laid on the floor
//   perimeter  proportional to wall run — work that follows the walls
//   count      a number of things; cannot be spread by measurement
//   whole      one task for the whole floor, by its nature
const BASIS = {
  // laid on the floor
  demo_floor_finish: "floor", screed: "floor", self_leveling: "floor",
  carpet_tile: "floor", vinyl_lvt: "floor", tile_vitrified: "floor",
  stone_marble: "floor", epoxy_flooring: "floor", raised_floor: "floor",
  waterproofing: "floor", protection_covering: "floor",
  // overhead, and therefore also proportional to floor area
  ceiling_gypsum: "floor", ceiling_grid_tile: "floor", ceiling_tiles: "floor",
  metal_ceiling: "floor", stretch_ceiling: "floor", demo_ceiling: "floor",
  // following the walls
  blockwork: "perimeter", plaster: "perimeter", pop_punning: "perimeter",
  gi_stud_frame: "perimeter", board_one_face: "perimeter", board_close: "perimeter",
  partition_tape: "perimeter", glazing_partition: "perimeter", demo_partition: "perimeter",
  paint_emulsion: "perimeter", putty_primer: "perimeter", paint_final: "perimeter",
  texture_paint: "perimeter", wallpaper: "perimeter", joinery_panel: "perimeter",
  fluted_panel: "perimeter", lacquered_glass: "perimeter", wall_dado: "perimeter",
  skirting: "perimeter", blinds_film: "perimeter", insulation_partition: "perimeter",
  // things you count, not things you measure
  door_install: "count", fire_door: "count", workstation: "count", storage_unit: "count",
  light_fixture: "count", db_panel: "count", wiring_point: "count", switch_socket: "count",
  sanitary_fixture: "count", toilet_cubicle: "count", washroom_accessories: "count",
  grille_diffuser: "count", fcu_unit: "count", vav_unit: "count", odu_unit: "count",
  ahu_unit: "count", sprinkler_head: "count", fa_device: "count", elv_device: "count",
  data_drop: "count", network_rack: "count", av_system: "count", pa_system: "count",
  signage_evac: "count", graphics_planters: "count", ups_battery: "count",
  precision_ac: "count", gas_suppression: "count", white_goods: "count",
  // runs that thread the whole floor rather than sitting in one room
  conduit: "floor", cable_pull: "floor", wiring_circuit: "floor", circuit_wiring: "floor",
  duct_gi: "floor", duct_insulation: "floor", refnet_pipe: "floor", cpvc_pipe: "floor",
  sprinkler_pipe: "floor", floor_raceway: "floor", condensate_drain: "floor",
  // whole-floor by nature
  mobilisation: "whole", final_clean: "whole", pest_control: "whole",
  temporary_lighting: "whole", lineout_marking: "whole", snag_cycle: "whole",
  firestop: "whole", core_cut: "whole", bms_integration: "whole",
  wld_system: "whole", rodent_system: "whole", statutory_liaison: "whole",
};

function perimeterOf(pts) {
  let p = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    p += Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
  }
  return p;
}

// ---- each area's share of the floor, by measurement --------------------
// AN UNNAMED AREA TAKES NO WORK, and its share is reported separately so
// the hole it leaves is visible rather than absorbed by its neighbours.
function shares(areas, basis) {
  const usable = (areas || []).filter(a => a.named);
  const skipped = (areas || []).filter(a => !a.named);
  const weight = (a) => basis === "perimeter"
    ? (a.perimeter != null ? a.perimeter : (a.pts ? perimeterOf(a.pts) : 0))
    : (a.sqft || 0);
  const total = usable.reduce((t, a) => t + weight(a), 0);
  if (!total) return { rows: [], total: 0, skipped,
    why: "no named area carries a measurement on this basis, so nothing can be spread" };
  return { rows: usable.map(a => ({ id: a.id, name: a.name, guessed: !!a.guessed,
      weight: weight(a), share: weight(a) / total })),
    total, skipped,
    skippedShare: null,
    why: usable.length + " named areas carry the work; " + skipped.length +
      " unnamed areas take none, because nothing can be planned into a place nobody can name" };
}

// ---- floor quantities become per-area quantities -----------------------
function distribute(tasks, areas, opts) {
  const o = opts || {};
  const zoned = [], notZoned = [];
  // WHAT THE ENGINE ASSUMED IN ORDER TO KEEP MOVING. Carried out beside the
  // work, never folded into it — see platform/core/assume.js.
  const assumptions = [];
  const byBasis = { floor: shares(areas, "floor"), perimeter: shares(areas, "perimeter") };

  for (const t of (tasks || [])) {
    const basis = BASIS[t.code] || null;
    if (!basis) {
      notZoned.push({ ...t, basis: null,
        why: "no spreading basis is declared for " + t.code +
             " — it stays at floor level rather than being spread on a guess" });
      continue;
    }
    if (basis === "count") {
      // A COUNT CAN ONLY BE ZONED BY SOMEBODY COUNTING IT. Where a person has,
      // it is used exactly as given and checked against the bill's total; where
      // they have not, the work stays at floor level and says so.
      const given = (o.counts || {})[t.code];
      if (!given) {
        notZoned.push({ ...t, basis,
          why: t.code + " is counted, not measured. " + Math.round(t.qty) + " " + t.unit +
               " cannot be spread by floor area without inventing where they go — somebody has to count them per room" });
        continue;
      }
      const named = {}; (areas || []).filter(a => a.named).forEach(a => named[a.name] = a);
      let placed = 0; const rows = [];
      for (const zone of Object.keys(given)) {
        const n = Number(given[zone]) || 0;
        if (n <= 0) continue;
        if (!named[zone]) {
          notZoned.push({ ...t, basis,
            why: 'a count was given for "' + zone + '", which is not a named area — the whole count for ' +
                 t.code + " is left at floor level rather than half-placed" });
          rows.length = 0; break;
        }
        placed += n; rows.push({ zone, n, id: named[zone].id, guessed: !!named[zone].guessed });
      }
      if (!rows.length) { if (!notZoned.some(x => x.code === t.code))
        notZoned.push({ ...t, basis, why: "the counts given for " + t.code + " are all zero" }); continue; }
      // THE COUNTS AND THE BILL DISAGREE MORE OFTEN THAN THEY AGREE, AND
      // STOPPING THERE IS NOT NEUTRALITY — IT IS A CHOICE TO PRODUCE NOTHING.
      // Refusing left every counted trade at floor level, which means one
      // crew in series however many gangs are put on it, which is why the
      // resourced plan stopped improving after six fronts. The difference is
      // real and it is not the engine's to close — so the engine SAYS which
      // side it is proceeding on, how sure it is, and what would settle it,
      // and then it proceeds. The doubt travels on every task it produces.
      const gap = Math.abs(placed - t.qty);
      let assumed = null;
      if (gap > 0.5) {
        const overBought = t.qty > placed;
        assumed = {
          id: "count:" + t.code,
          what: overBought
            ? "the " + Math.round(t.qty) + " " + t.unit + " the bill prices for " + t.code +
              " are the same " + placed + " the rooms were counted to, priced at more than one stage"
            : "the rooms hold " + placed + " " + t.unit + " of " + t.code +
              " and the bill's " + Math.round(t.qty) + " is short",
          why: "somebody counted " + placed + " " + t.unit + " room by room; the bill prices " +
               Math.round(t.qty) + ". A room-by-room count is direct evidence of where the work is, " +
               "and a bill is a commercial document that routinely prices one item at several stages.",
          // A COUNT THAT IS A CLEAN MULTIPLE OF THE BILL IS STRONG EVIDENCE OF
          // STAGED PRICING. A ragged difference is far likelier to be scope.
          confidence: overBought && Math.abs(t.qty / Math.max(1, placed) - Math.round(t.qty / Math.max(1, placed))) < 0.25
            ? "medium" : "low",
          affects: "where " + t.code + " can be worked in parallel, and therefore the finish date",
          settledBy: "somebody who knows the package saying whether the bill's lines are stages of " +
                     "one item or separate items",
          instead: "leaving " + t.code + " at floor level, where no number of gangs can speed it up",
          value: { counted: placed, billed: Math.round(t.qty), unit: t.unit },
        };
        assumptions.push(assumed);
      }
      // the PLACES come from the count; the QUANTITY stays the bill's, shared
      // out in the proportion the count found. Neither side is overruled: the
      // rooms say where, the bill says how much.
      rows.forEach(r => zoned.push({ code: t.code, name: t.name, trade: t.trade, unit: t.unit,
        zone: r.zone, zoneId: r.id,
        qty: assumed ? (t.qty * r.n / placed) : r.n,
        value: (t.value || 0) * (r.n / placed),
        guessedOutline: r.guessed, basis: "counted",
        assumption: assumed ? assumed.id : null,
        confidence: assumed ? assumed.confidence : "high",
        why: assumed
          ? "somebody counted " + r.n + " of " + placed + " " + t.unit + " in " + r.zone +
            " — the bill's " + Math.round(t.qty) + " shared in that proportion, on a " +
            assumed.confidence + "-confidence assumption that the two are the same work"
          : "somebody counted " + r.n + " " + t.unit + " in " + r.zone }));
      continue;
    }
    if (basis === "whole") {
      notZoned.push({ ...t, basis,
        why: t.code + " is one task for the whole floor by its nature" });
      continue;
    }
    const s = byBasis[basis];
    if (!s.rows.length) { notZoned.push({ ...t, basis, why: s.why }); continue; }
    for (const r of s.rows) {
      const q = t.qty * r.share;
      if (q <= 0) continue;
      zoned.push({ code: t.code, name: t.name, trade: t.trade, unit: t.unit,
        zone: r.name, zoneId: r.id, qty: q,
        value: (t.value || 0) * r.share,
        guessedOutline: r.guessed, basis,
        why: r.name + " is " + (r.share * 100).toFixed(1) + "% of the floor by " +
             (basis === "floor" ? "measured area" : "wall run") });
    }
  }

  // THE PARTS ADD BACK TO THE WHOLE. Checked here rather than trusted.
  const back = {};
  zoned.forEach(z => back[z.code] = (back[z.code] || 0) + z.qty);
  const drift = [];
  for (const t of (tasks || [])) {
    if (back[t.code] == null) continue;
    const d = Math.abs(back[t.code] - t.qty);
    if (d > Math.max(1e-6, t.qty * 1e-9))
      drift.push({ code: t.code, was: t.qty, nowSums: back[t.code], off: d });
  }

  const val = (arr) => arr.reduce((s, x) => s + (Number(x.value) || 0), 0);
  return { zoned, notZoned, drift, assumptions,
    areasUsed: byBasis.floor.rows.length,
    areasSkipped: byBasis.floor.skipped.length,
    coverage: { zonedTasks: new Set(zoned.map(z => z.code)).size,
      notZonedTasks: notZoned.length,
      value: { zoned: val(zoned), notZoned: val(notZoned) } },
    why: new Set(zoned.map(z => z.code)).size + " task codes spread across " +
      byBasis.floor.rows.length + " named areas; " + notZoned.length +
      " stay at floor level — " + notZoned.filter(x => x.basis === "count").length +
      " because they are counted rather than measured, " +
      notZoned.filter(x => x.basis === "whole").length + " because they are whole-floor work, " +
      notZoned.filter(x => !x.basis).length + " because no basis is declared for them" };
}

const Z = { BASIS, perimeterOf, shares, distribute };
root.CORE_ZONING = Z;
if (typeof module !== "undefined" && module.exports) module.exports = Z;

})(typeof window !== "undefined" ? window : globalThis);
