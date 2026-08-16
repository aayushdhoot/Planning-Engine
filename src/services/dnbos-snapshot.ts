import type { ProjectInputs } from '../domain/types';
import type { Plan } from '../engine/planner';

export interface DnbosSnapshot {
  schema: 1;
  project: {
    id: string;
    name: string;
    client: string | null;
    location: string | null;
    areaSft: number | null;
    contractValue: number | null;
  };
  plan: Array<{ v: number; tasks: DnbosTask[] }>;
  zones: Record<string, unknown>;
  people: Record<string, unknown>;
  allocation: Record<string, unknown>;
  manpowerPlan: Record<string, unknown>;
  materialPlan: Record<string, unknown>;
  expectations: Record<string, unknown>;
  observations: Record<string, unknown>;
  taskStatus: Record<string, unknown>;
  actions: Record<string, unknown>;
  revisions: unknown[];
  conditions: Record<string, unknown>;
  facts: Record<string, unknown>;
  queries: Record<string, unknown>;
  unknown: unknown[];
  refused: unknown[];
  tombstones: Record<string, unknown>;
  seen: Record<string, unknown>;
  events: number;
}

export interface DnbosTask {
  id: string;
  code: string;
  name: string;
  trade: string | null;
  zone: string | null;
  gate: boolean;
  ES: string;
  EF: string;
  critical: boolean;
}

export function planToDnbosSnapshot(
  projectId: string,
  project: ProjectInputs,
  plan: Plan,
  version: number,
): DnbosSnapshot {
  const tasks: DnbosTask[] = plan.modules.timeline.activities.map((act) => ({
    id: act.id,
    code: act.id,
    name: act.name,
    trade: act.trade ?? null,
    zone: null,
    gate: false,
    ES: act.startDate,
    EF: act.endDate,
    critical: !!act.critical,
  }));

  return {
    schema: 1,
    project: {
      id: projectId,
      name: project.name,
      client: project.client || null,
      location: project.location || null,
      areaSft: project.areaSft?.value ?? null,
      contractValue: project.contractValue?.value ?? null,
    },
    plan: [{ v: version, tasks }],
    zones: {},
    people: {},
    allocation: {},
    manpowerPlan: {},
    materialPlan: {},
    expectations: {},
    observations: {},
    taskStatus: {},
    actions: {},
    revisions: [],
    conditions: {},
    facts: {},
    queries: {},
    unknown: [],
    refused: [],
    tombstones: {},
    seen: {},
    events: 0,
  };
}
