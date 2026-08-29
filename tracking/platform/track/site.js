// ===================================================================
// DnB-OS . platform/track/site.js . THE SITE MODEL
// Site tracking at three levels, smallest to largest:
//   image (a reading) -> space (open / closed / passage) -> whole site
// This module is generic machinery. The curated SKF data lives in
// project/skf_site.js. Rules:
//   . a group rollup only ever comes from the status law (assess.js)
//   . a space's status comes from readings, never from opinion
//   . channel health is computed, never asserted
// ===================================================================

;(function (root) {

// ---- channel health --------------------------------------------------
// A channel is one way evidence reaches the engine. status:
//   live     flowing, lastSeen known
//   building the pipe is built, deployment pending
//   waiting  agreed but nothing received yet
//   hold     parked by decision, placeholder kept on purpose
//   dark     expected but silent
function channelHealth(ch, today) {
  if (ch.status === "hold") return { state: "hold", label: "on hold", days: null };
  if (ch.status === "building") return { state: "building", label: "being built", days: null };
  if (ch.status === "waiting" && !ch.lastSeen) return { state: "waiting", label: "agreed, nothing received yet", days: null };
  if (!ch.lastSeen) return { state: "dark", label: "nothing yet", days: null };
  const days = Math.round((new Date(today) - new Date(ch.lastSeen)) / 86400000);
  if (days <= 1) return { state: "fresh", label: "fresh", days };
  if (days <= 3) return { state: "aging", label: days + " days old", days };
  return { state: "stale", label: days + " days stale", days };
}

// ---- group and site rollups -----------------------------------------
// groups = [{ name, boqCode?, tasks: [...] }] with status-law tasks.
function groupRollup(group, today) {
  const A = root.TRACK_ASSESS;
  const roll = A.rollup(group.tasks, today);
  const scored = roll.rows.filter(r => !r.a.refused);
  const moving = (roll.by.in_progress || 0) + (roll.by.claimed_done || 0) + (roll.by.verified_done || 0);
  return Object.assign(roll, { name: group.name, boqCode: group.boqCode || null, moving, scored });
}

function siteRollup(groups, today) {
  const out = { groups: [], total: 0, by: {}, slipped: 0, worstSlip: 0, worstGroup: null };
  for (const g of groups) {
    const r = groupRollup(g, today);
    out.groups.push(r);
    out.total += r.total;
    out.slipped += r.slipped;
    for (const k of Object.keys(r.by)) out.by[k] = (out.by[k] || 0) + r.by[k];
    if (r.worstSlip > out.worstSlip) { out.worstSlip = r.worstSlip; out.worstGroup = g.name; }
  }
  return out;
}

// ---- space board ------------------------------------------------------
// For every frozen space: the latest reading items that touch it, newest
// first. This is the drilldown behind the pin map. No readings = the
// space is honestly blank, never guessed at.
function spaceBoard(pinsReg, readingsMod) {
  const reg = pinsReg || root.TRACK_PINS;
  const R = readingsMod || root.TRACK_READINGS;
  const bySpace = {};
  for (const s of reg.spaces) bySpace[s.name] = { space: s, items: [], lastDay: null, readings: 0 };
  for (const r of R.state.readings) {
    if (!r.space || !bySpace[r.space]) continue;
    const b = bySpace[r.space];
    b.readings++;
    if (!b.lastDay || r.day > b.lastDay) b.lastDay = r.day;
    for (const it of r.items) b.items.push({ day: r.day, source: r.source, pin: r.pin,
      work: it.work, state: it.state, tag: it.tag, confidence: it.confidence, note: it.note || null, rule: it.rule || null });
  }
  for (const k of Object.keys(bySpace)) bySpace[k].items.sort((a, b) => a.day < b.day ? 1 : -1);
  return bySpace;
}

// spaces with any reading vs blank, for the site glance
function spaceCoverage(pinsReg, readingsMod) {
  const board = spaceBoard(pinsReg, readingsMod);
  const names = Object.keys(board);
  const covered = names.filter(n => board[n].readings > 0);
  return { total: names.length, covered: covered.length, blank: names.length - covered.length };
}

root.TRACK_SITE = { channelHealth, groupRollup, siteRollup, spaceBoard, spaceCoverage };
if (typeof module !== "undefined") module.exports = root.TRACK_SITE;

})(typeof window !== "undefined" ? window : globalThis);
