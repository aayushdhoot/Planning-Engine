// ===================================================================
// DnB-OS . platform/track/highlights.js . WHICH AREAS A REPORT SHOWS
// A report cannot show 81 pins. It shows a handful, and which handful is
// a judgement that used to be made by whoever built the deck. This law
// makes it, from the reading, so two people building the same report
// pick the same pins.
//
// The laws:
//   . a pin is only offered if the walk actually shot it that day. A
//     report never holds a slot for a photo that does not exist.
//   . movement is counted from the reading, not assumed: how many work
//     items the reader saw started or ongoing at that pin.
//   . the big rooms lead. A client looks for reception, the boardroom
//     and the workstation floor, so those sort above a store cupboard.
//   . one pin per space until every space is used, so a report never
//     spends four of its ten slots on the same room.
//   . a pair needs a render. Asking for pairs never returns a pin the
//     design team has not rendered.
//   . asking for more than exists returns what exists. The caller is
//     told the shortfall so the page can say so instead of padding.
// ===================================================================

;(function (root) {

// The rooms a client and a director look for first. Matched loosely, so
// "Open Workstation Zone 2" and "Reception + Waiting Area" both land.
const HEADLINE = [
  /reception/i, /board\s*room|boardroom/i, /workstation/i, /cafeteria/i,
  /collab/i, /library/i, /\bhub\b/i, /meeting|MR[\s-]/i, /pantry/i, /cabin/i
];

function headlineRank(space) {
  const s = String(space || "");
  for (let i = 0; i < HEADLINE.length; i++) if (HEADLINE[i].test(s)) return i;
  return HEADLINE.length;   // everything else sorts last, never dropped
}

// how much the reader saw happening at each pin on a day
function pinActivity(RDG, day) {
  const by = {};
  for (const r of ((RDG && RDG.state && RDG.state.readings) || [])) {
    if (r.day !== day || r.source !== "pin_photo" || r.pin == null) continue;
    let n = 0;
    for (const it of (r.items || [])) {
      if (it.state === "started" || it.state === "ongoing") n += 1;
      else if (it.state === "done") n += 1;      // finished work is worth showing too
    }
    by[r.pin] = (by[r.pin] || 0) + n;
  }
  return by;
}

// The ordered candidate list for a day. shotPins is the set of pins the
// walk actually shot, so a slot is never held for a photo that is not
// there. Sort: headline rooms first, then most movement, then pin order.
function rank(RDG, day, pinsReg, shotPins) {
  const act = pinActivity(RDG, day);
  const shot = shotPins || null;
  const out = [];
  for (const p of ((pinsReg && pinsReg.pins) || [])) {
    if (shot && !shot[p.no]) continue;
    out.push({ pin: p.no, space: p.space, activity: act[p.no] || 0, rank: headlineRank(p.space) });
  }
  out.sort((a, b) => a.rank - b.rank || b.activity - a.activity || a.pin - b.pin);
  return out;
}

// one per space first, then fill from what is left, so a report spreads
// across the floor before it doubles up on a room
function spread(list, n) {
  const seen = {}, first = [], rest = [];
  for (const c of list) {
    if (!seen[c.space]) { seen[c.space] = 1; first.push(c); } else rest.push(c);
  }
  return first.concat(rest).slice(0, n);
}

// pick(n) . the areas a report shows. Returns { picks, asked, short }.
// short is how many slots could not be filled, so the page can say it
// plainly instead of printing an empty frame.
function pick(RDG, day, pinsReg, shotPins, n, opts) {
  const o = opts || {};
  let list = rank(RDG, day, pinsReg, shotPins);
  if (o.movingOnly) list = list.filter(c => c.activity > 0);
  const picks = spread(list, n);
  return { picks: picks, asked: n, short: Math.max(0, n - picks.length) };
}

// pickPairs(n) . the same choice, but only pins the design team rendered,
// so every slot can show the render beside the photo. A pin without a
// render is never offered here, however busy it is.
function pickPairs(RDG, day, pinsReg, shotPins, renderReg, n, opts) {
  const has = {};
  for (const r of ((renderReg && renderReg.RENDERS) || [])) has[r.pin] = r;
  const o = Object.assign({}, opts);
  let list = rank(RDG, day, pinsReg, shotPins).filter(c => has[c.pin]);
  if (o.movingOnly) list = list.filter(c => c.activity > 0);
  const picks = spread(list, n).map(c => Object.assign({}, c, { render: has[c.pin] }));
  return { picks: picks, asked: n, short: Math.max(0, n - picks.length) };
}

// the spaces where the most is happening, for a sentence rather than a
// photo. Returns [{space, activity, pins}] busiest first.
function movingSpaces(RDG, day, pinsReg, n) {
  const act = pinActivity(RDG, day);
  const by = {};
  for (const p of ((pinsReg && pinsReg.pins) || [])) {
    const a = act[p.no] || 0;
    if (!a) continue;
    const e = by[p.space] || (by[p.space] = { space: p.space, activity: 0, pins: [] });
    e.activity += a; e.pins.push(p.no);
  }
  return Object.keys(by).map(k => by[k])
    .sort((a, b) => b.activity - a.activity || headlineRank(a.space) - headlineRank(b.space))
    .slice(0, n || 99);
}

root.TRACK_HIGHLIGHTS = { HEADLINE, headlineRank, pinActivity, rank, spread, pick, pickPairs, movingSpaces };
if (typeof module !== "undefined") module.exports = root.TRACK_HIGHLIGHTS;

})(typeof window !== "undefined" ? window : globalThis);
