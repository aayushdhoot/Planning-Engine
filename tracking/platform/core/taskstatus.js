// ===================================================================
// DnB-OS . platform/core/taskstatus.js . WHAT HAPPENED TO THE WORK
// Phase 6. The plan says what should happen. This law holds what the
// person doing it says did happen, and what the engine concludes when
// nobody says anything at all.
//
//   STATES                    the four a task can be in
//   record(update, task)      validate one update from a person
//   resolve(task, updates, today)   the state a task is really in
//   dayList(tasks, updates, personId, today)  one person's day
//   rollup(resolved)          the counts a manager reads
//   toEvents(update, ctx)     the spine events an update becomes
//
// THE LAWS
//   . four states, and only four: done, in progress, on hold, delayed.
//   . ON HOLD NEEDS A REASON. A hold with no reason is the single most
//     useless record on a construction project: it stops the work and
//     tells nobody why, so the engine refuses it.
//   . a percent is OPTIONAL, and when given it is a claim, not a
//     measurement. It never reads as done, however close to 100.
//   . DONE NEEDS A DAY. Done with no date is not done . the same law the
//     tracking engine already keeps for its dependency register.
//   . DELAYED IS DERIVED, NEVER TYPED. Past its end date with no update
//     is delayed, and that is the engine's conclusion, not a person's
//     claim. Nobody has to remember to mark it.
//   . a later update supersedes an earlier one, but the earlier one is
//     never erased . the whole point of a day list is the trail.
//   . the engine never marks somebody's work done on their behalf.
//
// Pure: tasks and updates in, states out. The clock is passed in, so
// the guards can drive "today" by hand.
// ===================================================================

;(function (root) {

const STATES = ["done", "in_progress", "on_hold", "delayed", "not_started"];

const LABEL = {
  done: "Done", in_progress: "In progress", on_hold: "On hold",
  delayed: "Delayed", not_started: "Not started",
};

// ---- one update from a person ---------------------------------------
// Returns { ok, update } or { ok:false, why } . a refusal always says
// what is missing, because a form that just goes red teaches nobody.
function record(u, task) {
  const up = u || {};
  const state = String(up.state || "").trim();
  if (STATES.indexOf(state) === -1 || state === "delayed" || state === "not_started") {
    return { ok: false, why: state === "delayed"
      ? "Delayed is the engine's conclusion, not something a person marks. Say in progress, on hold, or done."
      : "Say what happened: done, in progress, or on hold." };
  }
  if (!up.taskId) return { ok: false, why: "The update does not say which task it is about." };
  if (!up.by)     return { ok: false, why: "The update does not say who is reporting it." };
  if (!up.day || !/^\d{4}-\d{2}-\d{2}$/.test(String(up.day)))
    return { ok: false, why: "Done with no date is not done. Every update carries the day it happened." };

  if (state === "on_hold" && !String(up.reason || "").trim())
    return { ok: false, why: "A hold needs a reason. A stopped task that tells nobody why is the least useful record on a site." };

  let pct = null;
  if (up.pct != null && up.pct !== "") {
    const n = Number(up.pct);
    if (!isFinite(n) || n < 0 || n > 100) return { ok: false, why: "A percent has to be a number between 0 and 100." };
    pct = Math.round(n);
    // a claim of 100 is not the same as saying done, and is not upgraded
    if (pct === 100 && state === "in_progress") pct = 99;
  }

  return { ok: true, update: {
    taskId: String(up.taskId), state, day: String(up.day), by: String(up.by),
    pct: state === "in_progress" ? pct : null,
    reason: state === "on_hold" ? String(up.reason).trim() : (up.reason ? String(up.reason).trim() : null),
    proof: up.proof ? String(up.proof) : null,      // a photo reference, optional
    at: up.at || null,
  } };
}

// ---- what state a task is really in ---------------------------------
// The latest update wins. With no update at all, the engine concludes:
// past its end date is DELAYED, otherwise not started or running to plan.
function resolve(task, updates, today) {
  const mine = (updates || []).filter(u => u && u.taskId === task.id)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : ((a.at || "") < (b.at || "") ? -1 : 1)));
  const last = mine[mine.length - 1] || null;

  if (last && last.state === "done") {
    return { id: task.id, state: "done", since: last.day, by: last.by, pct: 100,
      reason: null, proof: last.proof || null, derived: false, history: mine };
  }

  const overdue = !!(task.EF && today && today > task.EF);

  if (last && last.state === "on_hold") {
    return { id: task.id, state: "on_hold", since: last.day, by: last.by, pct: last.pct,
      reason: last.reason, proof: last.proof || null, derived: false, history: mine,
      alsoOverdue: overdue };
  }
  if (last && last.state === "in_progress") {
    // still running, and now past its finish, is delayed . but the person's
    // own words are kept, because they said something and the engine did not
    return { id: task.id, state: overdue ? "delayed" : "in_progress", since: last.day, by: last.by,
      pct: last.pct, reason: last.reason, proof: last.proof || null,
      derived: overdue, wasSaid: "in_progress", history: mine };
  }

  // nobody said anything
  if (overdue) return { id: task.id, state: "delayed", since: task.EF, by: null, pct: null,
    reason: "past its end date with no update", derived: true, history: [] };
  const started = !!(task.ES && today && today >= task.ES);
  return { id: task.id, state: started ? "in_progress" : "not_started", since: null, by: null,
    pct: null, reason: null, derived: true, silent: true, history: [] };
}

// ---- one person's day ------------------------------------------------
// What is live for this person today, with the state each is really in,
// soonest finish first because that is what is most likely to slip.
function dayList(tasks, updates, personId, today) {
  // Live today, OR already past its end and not finished. Filtering on the
  // window alone drops overdue work off the list the moment it slips, which
  // is exactly when somebody needs to see it . the task disappears on the
  // day it becomes a problem.
  const rows = (tasks || [])
    .filter(t => t.ownerId === personId && t.ES && t.EF && t.ES <= today)
    .map(t => Object.assign({}, t, { status: resolve(t, updates, today) }))
    .filter(r => today <= r.EF || r.status.state !== "done");
  rows.sort((a, b) => {
    const rank = s => s === "delayed" ? 0 : s === "on_hold" ? 1 : s === "in_progress" ? 2 : s === "not_started" ? 3 : 4;
    return (rank(a.status.state) - rank(b.status.state)) || (a.EF < b.EF ? -1 : a.EF > b.EF ? 1 : 0);
  });
  return { person: personId, day: today, tasks: rows,
    counts: rollup(rows.map(r => r.status)) };
}

function rollup(resolved) {
  const c = { done: 0, in_progress: 0, on_hold: 0, delayed: 0, not_started: 0, total: 0 };
  for (const r of (resolved || [])) { c[r.state] = (c[r.state] || 0) + 1; c.total++; }
  c.reported = c.total - c.not_started;
  return c;
}

// ---- the spine ------------------------------------------------------
// One update is one event. The key carries the task and the day, so two
// updates on the same task on different days are two records, and the
// same update sent twice is one.
function toEvents(update, ctx) {
  const c = ctx || {};
  return [{
    kind: "taskStatus.set",
    key: update.taskId + "|" + update.day,
    value: { taskId: update.taskId, state: update.state, day: update.day, by: update.by,
      pct: update.pct, reason: update.reason, proof: update.proof },
    ts: update.at || (update.day + "T12:00:00.000Z"),
    actor: update.by,
    source: c.source || "site",
    project: c.project || null,
  }];
}

const TS = { STATES, LABEL, record, resolve, dayList, rollup, toEvents };
root.CORE_TASKSTATUS = TS;
if (typeof module !== "undefined" && module.exports) module.exports = TS;

})(typeof window !== "undefined" ? window : globalThis);
