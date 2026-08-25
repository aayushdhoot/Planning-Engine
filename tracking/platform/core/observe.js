// ===================================================================
// DnB-OS . platform/core/observe.js . THE FRAME, THE PLAN, AND TODAY
// The render said what this exact view holds when the room is finished.
// The plan said when each trade is due in that room. The photo says what
// is there now. This is the law that puts the three side by side.
//
// It answers two different questions and never confuses them:
//   AGAINST THE FRAME   is this heading to the right finished state?
//   AGAINST THE PLAN    should it be there by now?
// A thing absent today is not late. A thing absent today that the plan
// says finished last week is. Only the second is worth waking anyone for.
//
//   verdict(exp, obs)          one item at one pin on one day
//   pin(expectations, obs, plan, day)   every item that pin can judge
//   day(byPin)                 the day's rollup and what it raises
//
// THE VERDICTS
//   on_the_way    the frame wants it, it is there, and it is not yet due
//   present       the frame wants it and it is there
//   not_yet       the frame wants it, it is not there, and the plan
//                 does not say it should be — normal, and not a finding
//   BEHIND        the frame wants it, it is not there, and the plan says
//                 it finished on or before today
//   unplanned     it is there and the frame says the finished room has
//                 no such thing — either the frame is wrong or the work is
//   unresolvable  the frame already said this view cannot see it. NEVER
//                 scored against anybody.
//   obscured      the frame could see it; today's photo could not
//
// THE LAWS
//   . WHAT THE FRAME CANNOT RESOLVE IS NEVER SCORED. The render said, in
//     advance, that this camera can never see the blockwork behind a
//     finished wall. A photo that does not show it has told us nothing,
//     and recording that as absence is how a tracking engine starts
//     lying about a trade that is complete.
//   . ABSENT IS NOT LATE WITHOUT A DATE. Marking every not-yet-built item
//     as a finding on day one produces a red board nobody reads. Only the
//     plan can turn absence into lateness, and where the plan is silent
//     the verdict says so rather than guessing.
//   . A CONTRADICTION IS NAMED, NEVER RESOLVED. Work present that the
//     finished frame does not contain is either a wrong frame or wrong
//     work. The engine reports both sides and asks.
//   . TODAY'S OBSCURED IS NOT THE FRAME'S CANNOT-RESOLVE. One is a
//     stack of boards in the way this morning; the other is a wall that
//     will hide it forever. They are different facts and different fixes.
//
// Pure: expectations, observations and a plan in, verdicts out. No clock.
// ===================================================================

;(function (root) {

const VERDICTS = ["present", "on_the_way", "not_yet", "behind", "unplanned",
                  "unresolvable", "obscured", "condition", "about_to_be_buried", "entailed"];

// A verdict that counts against somebody. The rest are states of the world.
const FINDINGS = { behind: 1, unplanned: 1 };

// ---- one item, one pin, one day ---------------------------------------
// exp:  what this pin's render said about this item
// obs:  what today's photo said about it
// due:  { finish } from the plan for this item in this area, or null
// opts.condition   true when this item is a site condition, not scope —
//                  PPE, housekeeping, people, material stacked. A render of
//                  a finished room shows none of them and never should.
// opts.buriedBy     the finished items that will hide this one. Work under
//                  way now and absent from the frame is not unplanned; it is
//                  about to be covered, and this is the LAST chance a camera
//                  will ever have to confirm it.
function verdict(exp, obs, due, opts) {
  const o = opts || {};

  // A SITE CONDITION IS NOT SCOPE. A render of a finished room contains no
  // scaffolding, no debris and nobody wearing a helmet, so the frame always
  // says "no" — and calling that a contradiction turns every safe, tidy,
  // properly-manned site into forty-nine findings a day.
  if (o.condition && obs && obs.answer === "yes")
    return { verdict: "condition", scored: false, stage: obs.stage || null,
      count: obs.count == null ? null : obs.count,
      why: "a site condition observed today — real, and never late or unplanned" };

  if (!exp) return { verdict: "unplanned", why: "the frame says nothing about this item at this pin" };

  // WHAT THE FRAME CANNOT RESOLVE IS NEVER SCORED
  if (exp.answer === "cannot_tell" && o.entailed)
    return { verdict: "entailed", scored: false, done: true,
      confidence: o.entailed.confidence, by: o.entailed.by, stage: o.entailed.stage,
      why: "no camera on this floor can resolve " + exp.item + ", but " + o.entailed.by + " is " +
           o.entailed.stage + " at this pin, and " + o.entailed.why };

  if (exp.answer === "cannot_tell")
    return { verdict: "unresolvable", scored: false,
      why: "this view can never resolve " + exp.item + " — the render said so before any photo was taken" +
           (exp.why ? ": " + String(exp.why).slice(0, 100) : "") };

  if (!obs) return { verdict: "not_yet", scored: false,
    why: "today's read did not answer this item" };

  // THE COVER PROVES WHAT IT BURIED. Before calling this obscured — which is
  // what half the conduit, cable and ductwork on a fit-out is, permanently —
  // ask whether something the camera COULD see could only be there if this
  // were done. A partition closed on both faces is not silence about the
  // conduit inside it; it is the answer. See platform/core/entail.js.
  if (obs.answer === "cannot_tell" && o.entailed)
    return { verdict: "entailed", scored: false, done: true,
      confidence: o.entailed.confidence, by: o.entailed.by, stage: o.entailed.stage,
      why: "the camera could not see it, but " + o.entailed.by + " is " + o.entailed.stage +
           " at this pin, and " + o.entailed.why };

  if (obs.answer === "cannot_tell")
    return { verdict: "obscured", scored: false,
      why: "the frame can normally see this, but today's photo could not" +
           (obs.why ? ": " + String(obs.why).slice(0, 100) : "") };

  const wanted = exp.answer === "yes";
  const there  = obs.answer === "yes";

  if (!wanted && there) {
    // THE FRAME SHOWS THE ROOM FINISHED, AND A FINISHED ROOM HIDES THINGS.
    // "No duct in the render" means no duct VISIBLE when done, not no duct.
    // Seeing it today, before the ceiling closes, is exactly right — and it
    // is the last time any camera on this floor will be able to say so.
    const cover = (o.buriedBy || []).filter(c => c.wanted);
    if (cover.length)
      return { verdict: "about_to_be_buried", scored: false, stage: obs.stage || null,
        confirmNow: true, coveredBy: cover.map(c => c.item),
        why: "it is there now and the finished room hides it behind " +
             cover.map(c => c.item).join(" and ") + ". Confirm it TODAY — once that closes, " +
             "no camera on this floor can ever see it again" };
    return { verdict: "unplanned", scored: true,
      why: "it is there, and the finished room in the render has no such thing — " +
           "either the frame is wrong or the work is, and the engine will not choose" };
  }

  if (!wanted && !there) return { verdict: "not_yet", scored: false,
    why: "the finished room has no such thing, and there is none" };

  if (wanted && there)
    return { verdict: due && due.finish ? "present" : "on_the_way", scored: false,
      stage: obs.stage || null,
      why: "the frame wants it and it is there" + (obs.stage ? ", at " + obs.stage : "") };

  // wanted, not there — only the PLAN can make this late
  if (!due || !due.finish) return { verdict: "not_yet", scored: false,
    why: "not there yet, and the plan carries no date for " + exp.item + " in this area, " +
         "so the engine will not call it late" };
  if (due.today && due.finish <= due.today)
    return { verdict: "behind", scored: true, dueOn: due.finish,
      why: "the plan has " + exp.item + " finishing " + due.finish + " and the camera does not see it" };
  return { verdict: "not_yet", scored: false, dueOn: due.finish,
    why: "not there yet, and not due until " + due.finish };
}

// ---- one pin on one day ------------------------------------------------
function pin(expectations, observations, opts) {
  const o = opts || {};
  const byItem = {};
  (expectations || []).forEach(e => byItem[e.item] = { exp: e, obs: null });
  (observations || []).forEach(x => (byItem[x.item] = byItem[x.item] || { exp: null, obs: null }).obs = x);

  const rows = [];
  for (const item of Object.keys(byItem)) {
    const { exp, obs } = byItem[item];
    const due = o.due ? o.due(item) : null;
    const v = verdict(exp, obs, due ? { ...due, today: o.day } : null,
      { condition: o.isCondition ? o.isCondition(item) : false,
        buriedBy: (o.hiddenBy ? o.hiddenBy(item) : []).map(c => ({ item: c,
          wanted: byItem[c] && byItem[c].exp && byItem[c].exp.answer === "yes" })) });
    rows.push({ item, pin: o.pin, area: o.area, day: o.day,
      expected: exp ? exp.answer : null, observed: obs ? obs.answer : null,
      stage: obs && obs.stage || null, count: obs && obs.count != null ? obs.count : null, ...v });
  }
  const counts = {};
  rows.forEach(r => counts[r.verdict] = (counts[r.verdict] || 0) + 1);
  return { pin: o.pin, area: o.area, day: o.day, rows, counts,
    findings: rows.filter(r => FINDINGS[r.verdict]),
    // the number that keeps the engine honest: how much of this pin's list
    // is simply not judgeable from this position, ever
    unresolvable: rows.filter(r => r.verdict === "unresolvable").length,
    // and the one worth acting on today rather than reading tomorrow
    confirmNow: rows.filter(r => r.confirmNow),
    why: rows.length + " items judged at pin " + o.pin + " on " + o.day + ": " +
      Object.entries(counts).map(([k, n]) => n + " " + k).join(", ") };
}

// ---- the whole day -----------------------------------------------------
function day(pins) {
  const all = (pins || []).flatMap(p => p.rows);
  const counts = {};
  all.forEach(r => counts[r.verdict] = (counts[r.verdict] || 0) + 1);
  const findings = all.filter(r => FINDINGS[r.verdict]);

  // WHAT NOBODY CAN SEE, GATHERED. An item every pin that could see it
  // reports unresolvable is work no camera on this floor will ever
  // confirm — it needs a person's report, and that is worth knowing as a
  // standing fact rather than one pin at a time.
  const seenSomewhere = {}, blindEverywhere = {};
  all.forEach(r => {
    if (r.verdict === "unresolvable") blindEverywhere[r.item] = (blindEverywhere[r.item] || 0) + 1;
    else seenSomewhere[r.item] = 1;
  });
  const neverVisible = Object.keys(blindEverywhere).filter(i => !seenSomewhere[i]);

  return { pins: (pins || []).length, items: all.length, counts, findings,
    neverVisible,
    confirmNow: all.filter(r => r.confirmNow),
    conditions: all.filter(r => r.verdict === "condition"),
    behind: all.filter(r => r.verdict === "behind"),
    unplanned: all.filter(r => r.verdict === "unplanned"),
    why: (pins || []).length + " pins, " + all.length + " judgements: " +
      (counts.behind || 0) + " behind, " + (counts.unplanned || 0) + " unplanned, " +
      (counts.unresolvable || 0) + " no camera can resolve" +
      (neverVisible.length ? ", and " + neverVisible.length +
        " items no pin on this floor can ever confirm" : "") };
}

// ===================================================================
// WHEN ONE PIN WAS PHOTOGRAPHED TWICE ON ONE DAY
//
// A pin can carry more than one frame for a day — a retake, a second angle.
// Ten thousand keys on this log are read from more than one photograph and
// fifteen hundred of them disagree. Every fold here used to take whichever
// event was written last, so the reading that stood was decided by which
// reader finished first, not by what was in front of the camera.
//
// THE RULE, and it is the engine's own doctrine: NOT SEEN IS NEVER NOT DONE.
// A frame that saw a thing is evidence it is there. A frame that did not see
// it may only have been pointing elsewhere, or had it behind a hoarding, or
// under a ceiling. So:
//
//   yes           beats everything — somebody photographed it
//   no            beats cannot_tell — a view that could resolve it and
//                 found nothing says more than a view that could not
//   cannot_tell   stands only when nothing better was ever recorded
//
// Between two readings of equal strength the later one stands, which is what
// the folds did before and keeps a retake's fuller description.
//
// THIS IS NOT THE RULE FOR SAFETY. PPE, hot work and the rest are counted
// frame by frame in manpower.js, deliberately: two frames showing different
// people are two observations, and folding them to the better one would hide
// the man with no helmet behind the man wearing one.
// ===================================================================
const STRENGTH = { yes: 3, no: 2, cannot_tell: 1 };
// `had` is the reading already held, `now` the one just met. Returns whichever
// stands. Either may be absent.
function stronger(had, now) {
  if (!had) return now;
  if (!now) return had;
  const a = STRENGTH[had.answer] || 0, b = STRENGTH[now.answer] || 0;
  return b >= a ? now : had;
}

const O = { VERDICTS, FINDINGS, verdict, pin, day, stronger, STRENGTH };
root.CORE_OBSERVE = O;
if (typeof module !== "undefined" && module.exports) module.exports = O;

})(typeof window !== "undefined" ? window : globalThis);
