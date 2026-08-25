// ===================================================================
// DnB-OS . platform/track/assess.js . THE STATUS LAW
// Turns a task's evidence into a status. One law, applied everywhere:
//   . no evidence never becomes progress
//   . a chat claim never becomes verified, only a photo or measure can
//   . a percent is never invented, it exists only when measured
//   . a task without planned dates is refused, not scored
// Statuses, weakest to strongest knowledge:
//   upcoming            window not open yet, nothing expected
//   no_evidence         window open or elapsed, engine holds nothing
//   commitment_only     a PO exists, execution unproven
//   materials_on_site   material arrival signal, no work evidence
//   in_progress         dated work evidence exists
//   claimed_done        someone said done, no visual proof
//   verified_done       done with photo or measured proof
// ===================================================================

;(function (root) {

const WORK_KINDS = { claim: 1, photo: 1, schedule: 1 };

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// assessTask(task, today) . task carries planned {start,finish},
// evidence [{day, kind, text, photos?, zones?, completes?}],
// materials [], commitments [], measured {done, unit, of} or null
function assessTask(t, today) {
  if (!t || !t.planned || !t.planned.start || !t.planned.finish) {
    return { refused: true, query: { about: (t && t.name) || "unnamed task",
      question: "Task arrived without planned start and finish. The law refuses to score what has no plan. Supply the dates.", blocking: false } };
  }
  const flags = [];
  const ev = (t.evidence || []).filter(e => {
    if (!e.day) { flags.push("an evidence entry had no day and was set aside"); return false; }
    if (e.day > today) { flags.push("an evidence entry was dated in the future and was set aside"); return false; }
    return true;
  }).slice().sort((a, b) => a.day < b.day ? -1 : 1);

  const work = ev.filter(e => WORK_KINDS[e.kind]);
  const photos = ev.reduce((n, e) => n + ((e.photos && e.photos.length) || 0), 0);
  const completes = ev.filter(e => e.completes === true);
  const completeProven = completes.some(e => (e.photos && e.photos.length) || e.measured);

  let status;
  if (completes.length && completeProven) status = "verified_done";
  else if (completes.length)              status = "claimed_done";
  else if (work.length)                   status = "in_progress";
  else if (today < t.planned.start)       status = "upcoming";
  else if ((t.materials || []).length)    status = "materials_on_site";
  else if ((t.commitments || []).length)  status = "commitment_only";
  else                                    status = "no_evidence";

  const done = status === "verified_done" || status === "claimed_done";
  const slipDays = (!done && today > t.planned.finish) ? daysBetween(t.planned.finish, today) : 0;
  const lateStart = (!work.length && !done && today > t.planned.start) ? daysBetween(t.planned.start, today) : 0;

  // percent is measured or it is nothing
  const percent = (t.measured && typeof t.measured.done === "number" && typeof t.measured.of === "number" && t.measured.of > 0)
    ? Math.round(100 * t.measured.done / t.measured.of) : null;
  if (!t.measured && work.length) flags.push("progress is observed but not measured, no percent will be shown until a measured quantity arrives");

  // how sure the engine is of this status
  const confidence = photos > 0 ? "high" : (work.length ? "medium" : ((t.materials||[]).length || (t.commitments||[]).length ? "medium" : "low"));
  if (work.length && work.every(e => e.kind === "schedule")) flags.push("only the schedule says so, no site evidence yet");

  return { refused: false, status, slipDays, lateStart, percent, confidence,
    evidenceCount: ev.length, photoCount: photos,
    firstEvidence: ev.length ? ev[0].day : null, lastEvidence: ev.length ? ev[ev.length - 1].day : null,
    flags };
}

// category rollup: counts per status, worst slip, the honest headline
function rollup(tasks, today) {
  const rows = tasks.map(t => ({ task: t, a: assessTask(t, today) }));
  const scored = rows.filter(r => !r.a.refused);
  const by = {};
  for (const r of scored) by[r.a.status] = (by[r.a.status] || 0) + 1;
  const worstSlip = scored.reduce((m, r) => Math.max(m, r.a.slipDays), 0);
  const slipped = scored.filter(r => r.a.slipDays > 0).length;
  return { rows, by, worstSlip, slipped, refused: rows.length - scored.length, total: tasks.length };
}

root.TRACK_ASSESS = { assessTask, rollup, daysBetween };
if (typeof module !== "undefined") module.exports = root.TRACK_ASSESS;

})(typeof window !== "undefined" ? window : globalThis);
