// Organisation: the employee directory and per-project team assignment.
//
// The directory is imported at runtime and held on this machine. It is deliberately NOT a
// checked-in data module: the master list carries 182 people's names, work emails and personal
// mobile numbers, and this repository is public. Mobile numbers are dropped on import — team
// assignment does not need them, and the smallest useful copy of personal data is the right
// one to hold.

export interface Employee {
  /** employee code from the master sheet — stable identity across re-imports */
  code: string;
  name: string;
  designation: string;
  department: string;
  location: string;
  email: string;
  /** business unit, e.g. "EV India" */
  sbu: string;
  /** 'Current' | 'Resigned' … — only current employees are assignable */
  status: string;
  reportingTo: string;
}

/** Roles a project team is staffed with, matching norms.resourceRoleNorms. */
export const PROJECT_ROLES = [
  'Project Manager',
  'Site Engineer (Civil/Interior)',
  'MEP Engineer',
  'Design Lead',
  'Procurement Owner',
  'Safety Officer',
  'QC / Snag Engineer',
] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export interface TeamMember {
  role: ProjectRole | string;
  /** employee code; null when the slot is named but unfilled */
  employeeCode: string | null;
}

/**
 * Where a project is in its life, as opposed to whether the ENGINE can plan it.
 * `plan.project.status` answers "do I have the inputs?"; this answers "is this live?".
 * They are deliberately separate — a handed-over project still has a valid plan.
 */
export const PROJECT_LIFECYCLE = ['Planning', 'WIP', 'On hold', 'Handed over', 'Closed'] as const;
export type ProjectLifecycle = (typeof PROJECT_LIFECYCLE)[number];

export interface OrgState {
  employees: Employee[];
  /** project id -> team */
  teams: Record<string, TeamMember[]>;
  /** project id -> lifecycle status */
  lifecycle: Record<string, ProjectLifecycle>;
  /** projects hidden from the switcher by an admin; the underlying data is untouched */
  archived: string[];
  importedAt: string | null;
}

export const emptyOrg = (): OrgState => ({ employees: [], teams: {}, lifecycle: {}, archived: [], importedAt: null });

export const isAssignable = (e: Employee): boolean => /current/i.test(e.status);

export function employeeByCode(org: OrgState, code: string | null): Employee | null {
  return code ? org.employees.find((e) => e.code === code) ?? null : null;
}

/** Team for a project, seeded with the standard role slots when nothing is set yet. */
export function teamFor(org: OrgState, projectId: string): TeamMember[] {
  const existing = org.teams[projectId];
  if (existing?.length) return existing;
  return PROJECT_ROLES.map((role) => ({ role, employeeCode: null }));
}

export interface DirectorySummary {
  total: number;
  assignable: number;
  byDepartment: { department: string; count: number }[];
  byLocation: { location: string; count: number }[];
}

export function summariseDirectory(employees: Employee[]): DirectorySummary {
  const tally = (key: (e: Employee) => string) => {
    const m = new Map<string, number>();
    for (const e of employees) m.set(key(e), (m.get(key(e)) ?? 0) + 1);
    return [...m.entries()].map(([k, count]) => ({ k, count })).sort((a, b) => b.count - a.count);
  };
  return {
    total: employees.length,
    assignable: employees.filter(isAssignable).length,
    byDepartment: tally((e) => e.department || '—').map(({ k, count }) => ({ department: k, count })),
    byLocation: tally((e) => e.location || '—').map(({ k, count }) => ({ location: k, count })),
  };
}
