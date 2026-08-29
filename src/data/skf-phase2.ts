// SKF, Pune — Phase 2. A second project derived from the Phase 1 inputs with a
// fifth more of everything: more floor, more money, more work content.
//
// WHY IT IS DERIVED AND NOT COPIED
//   Duplicating skf.ts would mean two hundred lines of the same activities,
//   dependencies and BOQ packages maintained twice. The moment a duration is
//   corrected in one, the two projects silently disagree about the same building
//   — and nobody would know which had been fixed. Scaling the real inputs keeps
//   one source for the structure and states the difference in one place: SCALE.
//
// WHAT +20% ACTUALLY MOVES
//   Area, contract value and BCS value are scaled because they are the figures
//   the commercial screens read. Activity durations are scaled because that is
//   what makes this a genuinely different PROGRAMME rather than the same dates
//   with bigger numbers on them — the CPM re-runs, the critical path can differ,
//   manpower re-levels, and every procurement order-by date moves with the
//   activity it feeds.
//
// WHAT IS DELIBERATELY NOT SCALED
//   The contract duration stays at 75 calendar days. A fifth more work inside
//   the same window is the interesting case: it is what a real second phase
//   looks like when the client will not move the date, and it makes the engine
//   say so — the buffer shrinks, the invariant strains, and the levelling
//   warnings multiply. Scaling the window too would have hidden all of that
//   behind a plan that looks exactly like Phase 1.
import type { Activity, BoqPackage, ProjectInputs, Traced } from '../domain/types';
import { skf } from './skf';

/** The one number that says how this project differs from the one it came from. */
export const SCALE = 1.2;

const NOTE = `derived from ${skf.name} × ${SCALE} (Phase 2 scope uplift)`;

const scaleT = (t: Traced<number> | null): Traced<number> | null =>
  t ? { value: Math.round(t.value * SCALE), provenance: t.provenance, source: `${t.source} · ${NOTE}` } : null;

// clientAmount is required on a package and bcsAmount is not (HVAC has no BCS
// figure), so only the optional one may come back null.
const scalePkg = (p: BoqPackage): BoqPackage => ({
  ...p,
  clientAmount: scaleT(p.clientAmount) as BoqPackage['clientAmount'],
  bcsAmount: scaleT(p.bcsAmount),
});

// Durations round UP: a fifth more work in a trade that took five days is six,
// not five. Rounding down would quietly hand the programme free capacity it
// does not have, which is the failure this whole engine exists to prevent.
//
// ---- RECORDED PROGRESS: THIS PROJECT IS 20% BUILT ----
// Phase 2 carries actuals so the progress path can be seen working end to end —
// the S-curve's actual line, the PERT's percent and actual dates, the Gantt's
// fill, and the statuses on Design, Procurement and the to-do list.
//
// It is NOT a flat 20 on every row. A site 20% through has some things finished,
// some running and most not started; painting every activity "20% done" would
// draw a curve no real project has ever produced and would hide exactly the
// bugs this is meant to expose. Work is taken in programme order until a fifth
// of the total work content is used up: early activities read 100, the one on
// the boundary reads a part, the rest read 0.
const PROGRESS_SHARE = 0.2;
const workOf = (a: Activity) => Math.max(1, a.duration.value) * Math.max(1, a.crew.value);

function withProgress(list: Activity[]): Activity[] {
  const live = list.filter((a) => !a.isMilestone);
  const total = live.reduce((s, a) => s + workOf(a), 0);
  let budget = total * PROGRESS_SHARE;
  // programme order, so progress runs front-to-back the way a floor is built
  const order = [...live].sort((a, b) =>
    (a.plannedStartFromInput ?? '') < (b.plannedStartFromInput ?? '') ? -1 : 1);
  const pct = new Map<string, number>();
  for (const a of order) {
    const w = workOf(a);
    if (budget <= 0) { pct.set(a.id, 0); continue; }
    if (budget >= w) { pct.set(a.id, 100); budget -= w; continue; }
    pct.set(a.id, Math.round((budget / w) * 100));   // the one that straddles the line
    budget = 0;
  }
  return list.map((a) => {
    const p = pct.get(a.id);
    if (p == null || p === 0) return a;
    return {
      ...a,
      percentComplete: { value: p, provenance: 'input' as const,
        source: `site progress recorded on ${NOTE.replace('derived from ', '')} — ${Math.round(PROGRESS_SHARE * 100)}% of work content complete` },
    };
  });
}

const scaleActivity = (a: Activity): Activity => ({
  ...a,
  duration: {
    value: Math.max(1, Math.ceil(a.duration.value * SCALE)),
    provenance: a.duration.provenance,
    source: `${a.duration.source} · ${NOTE}`,
  },
});

export const skfPhase2: ProjectInputs = {
  ...skf,
  id: 'skf-pune-p2',
  name: 'SKF, Pune — Phase 2',
  client: skf.client,
  location: `${skf.location} (Phase 2 — 9th floor)`,
  areaSft: scaleT(skf.areaSft),
  contractValue: scaleT(skf.contractValue),
  bcsValue: scaleT(skf.bcsValue),
  // same start, same 75-day window — see the note at the top
  contractStart: skf.contractStart,
  contractDurationCalDays: skf.contractDurationCalDays,
  boqPackages: skf.boqPackages.map(scalePkg),
  scheduleActivities: withProgress(skf.scheduleActivities.map(scaleActivity)),
  materialItems: skf.materialItems.map((m) => ({
    ...m,
    quantity: m.quantity
      ? { ...m.quantity, value: Math.round(m.quantity.value * SCALE), source: `${m.quantity.source} · ${NOTE}` }
      : m.quantity,
  })),
};
