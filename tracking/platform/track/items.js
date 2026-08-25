// ===================================================================
// DnB-OS . platform/track/items.js . ONE THING, COUNTED ONCE
//
// Four pins stand in Open Workstation Zone 1 and all four aim at the same
// point, so they overlap on purpose. That is good for evidence and bad for
// arithmetic. Ask "how many sprinkler heads are in" and add up what each
// pin saw, and the four pins report 31 sightings of 20 heads. Half the
// answer is the same head counted again.
//
// The completion law never hit this because it never counts things. It
// averages percentages, so nothing is added twice. That hides two faults
// instead of fixing them:
//   . dilution. Pin 1 can see 9 heads but a duct blocks 8 of them, so it
//     reads 11 percent. Pin 4 sees its own clearly and reads 75. The mean
//     is 43, which is not what either pin saw and not what is on the wall.
//     A blocked view drags down a clear one.
//   . weight. byPackage walks every element of every reading, so a bay
//     with four pins votes four times on its trade and a cabin with one
//     pin votes once. A well pinned area quietly decides the number.
//
// Both go away the moment the thing itself has a name. This law gives
// every item the layout specifies a durable id from where it sits, and
// rolls up by union over ids instead of by mean over pins.
//
// The laws:
//   . an id is the item. Two pins reporting the same id are one item, and
//     the rollup says so out loud by printing sightings beside distinct.
//   . not seen is never not built. An item no pin can look at is unseen,
//     and an item every looking pin found blocked is blocked. Neither is
//     ever folded into absent, because absent is a claim about the site
//     and these two are claims about the camera.
//   . one clear sighting beats any number of blocked ones. Fitted wins,
//     because a head does not un-exist because the next pin could not see
//     it through a duct.
//   . a disagreement is kept. One pin fitted, another absent, is disputed
//     and stays disputed. Averaging two contradictory reads invents a
//     third reading nobody took.
//   . two denominators, never mixed. Completion against what is specified
//     is the real number. Completion against what the pins can even see
//     is the read. Reporting the second as the first is how a camera grid
//     with holes in it starts to look like a finished job.
//   . pure. Items and sightings in, verdicts out. No clock, no storage.
// ===================================================================

;(function (root) {

// Where an item sits IS its name. Coordinates come from the layout sheet,
// so the id survives a re read, a new revision of the pack, and a pin
// being moved. A name like "head 3" would not.
function idFor(discipline, kind, mm) {
  if (!mm || mm.length < 2) return null;
  return [discipline, kind, Math.round(mm[0]), Math.round(mm[1])].join("-");
}

// ---- which pins can even look at each item ----------------------------
// Pure geometry against the pin register: same cone the camera brief uses.
// This is what tells you an item is unseen rather than missing.
function visibleTo(items, pinsReg, opts) {
  const fov = (opts && opts.fov) || (pinsReg && pinsReg.fov) || 68;
  const reach = (opts && opts.reach) || 12000;
  const pins = (pinsReg && pinsReg.pins) || [];
  const deg = r => r * 180 / Math.PI;
  const norm = a => ((a % 360) + 360) % 360;
  return (items || []).map(it => {
    const by = pins.filter(p => {
      if (!p.aim || !it.mm) return false;
      if (opts && opts.space && p.space !== opts.space) return false;
      const dx = it.mm[0] - p.x, dy = it.mm[1] - p.y;
      if (Math.hypot(dx, dy) > reach) return false;
      const a0 = norm(deg(Math.atan2(p.aim[1] - p.y, p.aim[0] - p.x)));
      const a = norm(deg(Math.atan2(dy, dx)));
      return Math.abs(norm(a - a0 + 180) - 180) <= fov / 2;
    }).map(p => p.no);
    return Object.assign({}, it, { seenBy: by });
  });
}

// ---- the union rollup: one item, one verdict --------------------------
// sightings is a flat list of { id, pin, day, state } where state is one
// of fitted, absent or blocked. Anything else is ignored rather than
// guessed at.
const STATES = ["fitted", "absent", "blocked"];

function roll(items, sightings, day) {
  const byId = {};
  (items || []).forEach(it => { if (it.id) byId[it.id] = it; });

  // gather per id, keeping every pin that looked
  const seen = {};
  let sightingCount = 0;
  (sightings || []).forEach(s => {
    if (!s || !s.id || !byId[s.id]) return;
    if (day && s.day !== day) return;
    if (STATES.indexOf(s.state) === -1) return;
    sightingCount++;
    const e = seen[s.id] || (seen[s.id] = { fitted: [], absent: [], blocked: [] });
    e[s.state].push(s.pin);
  });

  const rows = (items || []).map(it => {
    const e = seen[it.id];
    // nobody could look: a fact about the camera grid, not about the site
    if (!e) {
      const canSee = (it.seenBy || []).length;
      return Object.assign({}, it, {
        verdict: canSee ? "not read" : "unseen",
        why: canSee ? "a pin can see it, no read recorded" : "no pin can see it",
        fittedBy: [], absentBy: [], blockedBy: [], disputed: false });
    }
    // one clear sighting settles it. A duct in front of pin 1 does not
    // undo what pin 4 saw.
    let verdict;
    if (e.fitted.length && e.absent.length) verdict = "disputed";
    else if (e.fitted.length) verdict = "fitted";
    else if (e.absent.length) verdict = "absent";
    else verdict = "blocked";
    return Object.assign({}, it, {
      verdict: verdict,
      why: verdict === "disputed"
        ? "pin " + e.fitted.join(", ") + " read it in, pin " + e.absent.join(", ") + " read it out"
        : verdict === "blocked"
          ? "every pin that looked had it obstructed"
          : "read by pin " + (e.fitted.concat(e.absent)).join(", "),
      fittedBy: e.fitted, absentBy: e.absent, blockedBy: e.blocked,
      disputed: verdict === "disputed" });
  });

  const n = v => rows.filter(r => r.verdict === v).length;
  const specified = rows.length;
  const observable = rows.filter(r => (r.seenBy || []).length > 0).length;
  const fitted = n("fitted");
  return {
    day: day || null,
    rows: rows,
    specified: specified,
    observable: observable,
    fitted: fitted,
    absent: n("absent"),
    blocked: n("blocked"),
    disputed: n("disputed"),
    unseen: n("unseen"),
    notRead: n("not read"),
    // the overlap, printed rather than hidden. sightings above distinct is
    // the number that would have been double counted.
    sightings: sightingCount,
    distinctRead: Object.keys(seen).length,
    inflation: Object.keys(seen).length
      ? Math.round(sightingCount / Object.keys(seen).length * 100) / 100 : null,
    // two denominators, never mixed
    pctOfSpecified: specified ? Math.round(fitted / specified * 100) : null,
    pctOfObservable: observable ? Math.round(fitted / observable * 100) : null,
    blindSpot: specified ? Math.round((specified - observable) / specified * 100) : null
  };
}

// ---- the sentence a reader gets ---------------------------------------
// It refuses to give one number where two are true. The gap between them
// is the camera grid's problem and the reader is told whose problem it is.
function line(r) {
  if (!r || !r.specified) return "no items specified here yet";
  const a = r.fitted + " of " + r.specified + " in place, " + r.pctOfSpecified + " percent of what the layout specifies";
  if (r.observable < r.specified)
    return a + ". The pins can only see " + r.observable + " of them, so " +
      (r.specified - r.observable) + " are unseen and this is a camera gap, not site progress.";
  return a + ".";
}

// The overlap note, so nobody has to trust that dedup happened.
function overlapNote(r) {
  if (!r || !r.distinctRead) return null;
  if (r.sightings === r.distinctRead)
    return r.sightings + " sightings of " + r.distinctRead + " items, no overlap on this day.";
  return r.sightings + " sightings resolved to " + r.distinctRead + " items. " +
    (r.sightings - r.distinctRead) + " would have been counted twice by adding pins up.";
}

root.TRACK_ITEMS = { idFor, visibleTo, roll, line, overlapNote, STATES };
if (typeof module !== "undefined") module.exports = root.TRACK_ITEMS;

})(typeof window !== "undefined" ? window : globalThis);
