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
  scheduleActivities: skf.scheduleActivities.map(scaleActivity),
  materialItems: skf.materialItems.map((m) => ({
    ...m,
    quantity: m.quantity
      ? { ...m.quantity, value: Math.round(m.quantity.value * SCALE), source: `${m.quantity.source} · ${NOTE}` }
      : m.quantity,
  })),
};
