// ===================================================================
// DnB-OS . platform/track/zones.js . ZONE REGISTRY (twin base)
// The digital twin starts here: the site as a list of zones taken
// from the CAD layout. Every piece of evidence pins to a zone.
// Until the DXF is absorbed, zones can seed from the plan or by hand,
// and each carries where it came from.
// ===================================================================

;(function (root) {

const state = { zones: [], source: "none" }; // source: none | plan | cad | manual

function slug(name) { return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

function add(name, meta) {
  if (!name) throw new Error("zone needs a name");
  const id = slug(name);
  if (state.zones.some(z => z.id === id)) return state.zones.find(z => z.id === id);
  const zone = { id, name, from: (meta && meta.from) || "manual",
    areaSqft: (meta && meta.areaSqft) || null, floor: (meta && meta.floor) || null };
  state.zones.push(zone);
  return zone;
}

function fromPlan(baselineFacts) {
  const names = new Set();
  for (const f of baselineFacts || []) if (f.zone) names.add(f.zone);
  for (const n of names) add(n, { from: "plan" });
  if (names.size && state.source === "none") state.source = "plan";
  return state.zones.length;
}

// pin discipline: pinning to a zone that does not exist is a query,
// never a silent create. The twin must not grow phantom rooms.
function pin(zoneId) {
  const z = state.zones.find(x => x.id === zoneId || x.name === zoneId);
  if (!z) return { ok: false, query: { about: "zone pin", question: `Evidence points to zone "${zoneId}" which is not in the registry. Name the zone or absorb the CAD layout.`, blocking: false } };
  return { ok: true, zone: z };
}

function reset() { state.zones = []; state.source = "none"; }

root.TRACK_ZONES = { state, add, fromPlan, pin, slug, reset };
if (typeof module !== "undefined") module.exports = root.TRACK_ZONES;

})(typeof window !== "undefined" ? window : globalThis);
