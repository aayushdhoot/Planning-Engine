// Emirates OS — honest degraded-input dataset, kept as the T1-DEGRADE fixture.
// The folder holds a structured scaffold but no readable BOQ/schedule/contract files, so the
// engine must refuse to plan rather than fabricate numbers.
//
// KOHLER has since been supplied with real documents and moved to src/data/kohler.ts.
// `pendingKohler` preserves the degraded shape so the degrade gate still has a project that
// exercises it independently of whether KOHLER's documents are present.
import type { ProjectInputs } from '../domain/types';

export const emirates: ProjectInputs = {
  id: 'emirates',
  name: 'Emirates OS',
  client: 'Emirates',
  location: '—',
  areaSft: null,
  contractStart: null,
  contractDurationCalDays: null,
  contractValue: null,
  bcsValue: null,
  milestones: [],
  boqPackages: [],
  scheduleActivities: [],
  provided: { boq: false, contract: false, layout: false, drawings: false, day0Images: false, design3d: false, salesKt: false, makeList: false, paymentTerms: false },
  ldPercentPerWeek: null,
  ldCapPercent: null,
  dlpMonths: null,
};

/** A project whose folder has no readable inputs — the T1-DEGRADE fixture. */
export const pendingKohler: ProjectInputs = {
  ...emirates,
  id: 'kohler-pending',
  name: 'KOHLER OS (no inputs)',
  client: 'Kohler',
};
