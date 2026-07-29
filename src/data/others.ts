// Emirates OS & KOHLER OS — honest degraded-input datasets.
// The Drive folders contain a structured folder scaffold but no readable BOQ/schedule/contract
// files (Emirates subfolders hold only .DS_Store; KOHLER is an unresolvable shortcut).
// The engine must degrade gracefully (T1-DEGRADE): no fabricated numbers.
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

export const kohler: ProjectInputs = {
  ...emirates,
  id: 'kohler',
  name: 'KOHLER OS',
  client: 'Kohler',
};
