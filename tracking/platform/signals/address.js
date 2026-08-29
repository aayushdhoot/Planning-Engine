// ===================================================================
// DnB-OS . platform/signals/address.js . WHERE A FINDING LANDS
// A finding with nothing to attach it to cannot be compared with
// anything, and a thing that cannot be compared is not information. This
// is the law that every answer — from a reader, from a photo, from a
// person — has to pass before it joins the record.
//
// An address is four parts, and which of them are required depends on
// what kind of finding it is:
//   day    when it was true          — always required
//   area   which of the 49 places    — or floor-wide, said explicitly
//   pin    which camera saw it       — required of anything seen
//   item   what it is about          — a checklist item or a task code
//
//   of(finding, ctx)     the address, or a refusal with the reason
//   key(address)         the stable string the log is keyed by
//   resolve(pin, ctx)    a pin implies its area; that is not a guess
//
// THE LAWS
//   . NO DAY, NO ADDRESS. "The ceiling grid is up" is a claim about a
//     moment. Without the day it can never be diffed against the plan,
//     never sequenced against yesterday, and never argued with.
//   . A THING SEEN CARRIES THE EYE THAT SAW IT. An observation with no
//     pin cannot be judged against that pin's expectation or its render,
//     so it is refused rather than floated at floor level.
//   . A PIN IMPLIES ITS AREA, AND ONLY ITS AREA. The pin pack says which
//     place each camera stands in. Deriving the area from the pin is a
//     lookup, not an inference — but a pin the pack does not carry
//     resolves to nothing and the finding is refused.
//   . FLOOR-WIDE IS SAID, NEVER ASSUMED. A finding that genuinely applies
//     to the whole floor sets area to the floor explicitly. A finding
//     that merely forgot its area is not the same thing and must not
//     read as though it were.
//   . AN AREA NOBODY HAS NAMED CANNOT HOLD A FINDING. The same law the
//     zoning keeps: nothing is planned into, or recorded against, a
//     place nobody can name.
//
// Pure: a finding and the registers in, an address or a refusal out.
// ===================================================================

;(function (root) {

const FLOOR = "__floor__";

// which parts each family of finding must carry
const NEEDS = {
  visual: ["day", "pin", "item"],     // what a camera saw
  work:   ["day", "item"],            // what a document says about the work
  status: ["day", "item"],            // what a person reports
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// A PIN IMPLIES ITS AREA. A lookup in the frozen pack, not an inference.
//
// THE PACK IS FROZEN; THE NAMES ARE NOT. The pin pack stays exactly as it
// was surveyed — that is the point of freezing it — so it still calls a room
// "Unnamed Space 11" after somebody names it Dry Pantry. The register holds
// the decision and carries what the area used to be called, so resolution
// goes through the register. Without this, naming a room silently orphans
// every finding from the pins standing in it.
function resolve(pin, ctx) {
  const pins = (ctx && ctx.pins) || [];
  const p = pins.find(x => Number(x.no) === Number(pin));
  if (!p) return { ok: false, why: "pin " + pin + " is not in the frozen pin pack" };
  const areas = (ctx && ctx.areas) || [];
  const hit = areas.find(a => a.name === p.space) ||
              areas.find(a => a.wasCalled === p.space);
  return { ok: true, area: hit ? hit.name : p.space,
    renamed: hit && hit.wasCalled === p.space ? p.space : null };
}

function of(finding, ctx) {
  const f = finding || {}, c = ctx || {};
  const family = f.family || (f.pin != null ? "visual" : "work");
  const needs = NEEDS[family];
  if (!needs) return { ok: false, why: 'no address law is declared for a "' + family + '" finding' };

  const a = { family, day: null, area: null, pin: null, item: f.item || f.code || null, floorWide: false };

  // ---- the day ---------------------------------------------------------
  const day = f.day || f.observedOn || null;
  if (!day) return { ok: false, why: "no day. A finding is a claim about a moment; without the day it can " +
    "never be diffed against the plan, sequenced against yesterday, or argued with." };
  if (!ISO.test(String(day))) return { ok: false, why: '"' + day + '" is not a day the engine can order (YYYY-MM-DD)' };
  a.day = String(day);

  // ---- the eye ---------------------------------------------------------
  if (f.pin != null) {
    const r = resolve(f.pin, c);
    if (!r.ok) return { ok: false, why: r.why };
    a.pin = Number(f.pin);
    a.area = r.area;
  }
  if (needs.indexOf("pin") !== -1 && a.pin == null)
    return { ok: false, why: "a thing seen carries the eye that saw it. Without a pin this cannot be judged " +
      "against that pin's expectation or its render, so it is refused rather than floated at floor level." };

  // ---- the place -------------------------------------------------------
  if (a.area == null) {
    if (f.area === FLOOR || f.floorWide === true) { a.area = FLOOR; a.floorWide = true; }
    else if (f.area) a.area = String(f.area);
  }
  if (a.area && a.area !== FLOOR) {
    const areas = (c.areas || []);
    const hit = areas.find(x => x.name === a.area);
    if (!hit) return { ok: false, why: '"' + a.area + '" is not an area in the register' };
    if (hit.named === false) return { ok: false, why: '"' + a.area + '" has no name yet, and nothing can be ' +
      "recorded against a place nobody can name" };
  }

  // ---- what it is about ------------------------------------------------
  if (needs.indexOf("item") !== -1 && !a.item)
    return { ok: false, why: "nothing to attach it to. A finding names a checklist item or a task code, " +
      "or there is no way to compare it with the plan." };
  if (a.item && c.items && c.items.indexOf(a.item) === -1)
    return { ok: false, why: '"' + a.item + '" is on no declared list — reported rather than filed under a near one' };

  return { ok: true, address: a, key: key(a) };
}

// the stable string the log keys an observation by: one eye, one place,
// one thing, one day
function key(a) {
  return [a.family, a.day, a.pin == null ? "-" : "p" + a.pin,
          a.area || "-", a.item || "-"].join("||");
}

// ---- a whole reply at once -------------------------------------------
function all(findings, ctx) {
  const addressed = [], refused = [];
  for (const f of (findings || [])) {
    const r = of(f, ctx);
    if (r.ok) addressed.push({ ...f, address: r.address, key: r.key });
    else refused.push({ ...f, why: r.why });
  }
  return { addressed, refused,
    why: addressed.length + " findings addressed, " + refused.length +
      " refused for want of an address — a finding nothing can be compared with is not information" };
}

const A = { FLOOR, NEEDS, of, key, all, resolve };
root.SIGNAL_ADDRESS = A;
if (typeof module !== "undefined" && module.exports) module.exports = A;

})(typeof window !== "undefined" ? window : globalThis);
