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

/**
 * The project team, grouped the way the business is actually organised rather than as a flat
 * list of seven slots. Some roles take one person, some take several — five procurement
 * executives and four interior designers on one project is normal.
 */
export interface RoleSpec {
  role: string;
  /** several people can hold this role on one project */
  multi?: boolean;
}

export interface TeamGroup {
  group: string;
  roles: RoleSpec[];
}

export const TEAM_GROUPS: TeamGroup[] = [
  { group: 'Sales', roles: [{ role: 'Sales Head' }, { role: 'Sales Person', multi: true }] },
  {
    group: 'Procurement',
    roles: [{ role: 'Procurement Head' }, { role: 'Category Head' }, { role: 'Procurement Manager' }, { role: 'Procurement Executive', multi: true }],
  },
  { group: 'Snag', roles: [{ role: 'Snag Head' }, { role: 'Snag Manager' }] },
  {
    group: 'Operations',
    roles: [
      { role: 'SBU Head' }, { role: 'Cluster Head' }, { role: 'BU Head' },
      { role: 'Senior Operations Manager' }, { role: 'Operations Manager' },
      { role: 'Senior Project Manager', multi: true }, { role: 'Project Manager' },
      { role: 'Site Supervisor', multi: true }, { role: 'MEP Engineer', multi: true },
      { role: 'Safety Officer', multi: true },
    ],
  },
  {
    group: 'Design',
    roles: [{ role: 'Design Head', multi: true }, { role: 'Design Manager' }, { role: 'Interior Designer', multi: true }, { role: '3D Artist', multi: true }],
  },
  { group: 'Additional', roles: [{ role: 'Additional Team Member', multi: true }] },
];

/** Every role name, in group order — used to seed a fresh team. */
export const PROJECT_ROLES: string[] = TEAM_GROUPS.flatMap((g) => g.roles.map((r) => r.role));

export interface TeamMember {
  role: string;
  /** employee code; null when the slot is named but unfilled */
  employeeCode: string | null;
}

/**
 * Seniority band shown against each name (e.g. "Operations - L3"), derived from the
 * DESIGNATION rather than the pay grade — grade is compensation data and is deliberately not
 * imported. Adjust the bands here if the business ladder changes; this is a convention, not a
 * measurement.
 */
export type SeniorityLevel = 'L1' | 'L2' | 'L3';

export function levelFor(designation: string): SeniorityLevel {
  if (/vice president|\bvp\b|general manager|\bgm\b|head|chief|director/i.test(designation)) return 'L3';
  if (/manager|lead/i.test(designation)) return 'L2';
  return 'L1';
}

/** Short department label for the badge, e.g. "Operations", "Procurement". */
export function departmentLabel(department: string): string {
  if (/procure|supply/i.test(department)) return 'Procurement';
  if (/design/i.test(department)) return 'Design';
  if (/operation/i.test(department)) return 'Operations';
  if (/business development|marketing/i.test(department)) return 'Sales';
  if (/human resource/i.test(department)) return 'HR';
  return department.split(',')[0] || '—';
}

/**
 * Where the project physically is, and how big. Captured here rather than derived, because a
 * BOQ's "PROJECT AREA" and the leasable carpet area are not always the same number and the
 * team needs to be able to correct it.
 */
export interface ProjectSite {
  projectCode: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pinCode: string;
  floors: string;
  /** carpet area in sft; when set it overrides the BOQ-derived figure in the plan */
  carpetAreaSft: number | null;
  loginDate: string | null;
  /** the Drive folder this project's documents live in */
  driveUrl: string;
}

export const emptySite = (): ProjectSite => ({
  projectCode: '', address: '', city: '', state: '', country: 'IN', pinCode: '',
  floors: '', carpetAreaSft: null, loginDate: null, driveUrl: '',
});

/**
 * Where a project is in its life, as opposed to whether the ENGINE can plan it.
 * `plan.project.status` answers "do I have the inputs?"; this answers "is this live?".
 * They are deliberately separate — a handed-over project still has a valid plan.
 */
export const PROJECT_LIFECYCLE = ['Planning', 'WIP', 'On hold', 'Handed over', 'Closed'] as const;
export type ProjectLifecycle = (typeof PROJECT_LIFECYCLE)[number];

export interface OrgState {
  employees: Employee[];
  /** project id -> site details */
  sites?: Record<string, ProjectSite>;
  /** project id -> team */
  teams: Record<string, TeamMember[]>;
  /** project id -> lifecycle status */
  lifecycle: Record<string, ProjectLifecycle>;
  /** projects hidden from the switcher by an admin; the underlying data is untouched */
  archived: string[];
  importedAt: string | null;
}

export const emptyOrg = (): OrgState => ({ employees: [], sites: {}, teams: {}, lifecycle: {}, archived: [], importedAt: null });

export function siteFor(org: OrgState, projectId: string): ProjectSite {
  return org.sites?.[projectId] ?? emptySite();
}

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

/** The team arranged into its groups, so the screen mirrors how the business is organised. */
export function groupedTeam(org: OrgState, projectId: string): { group: string; rows: { role: string; multi: boolean; members: TeamMember[] }[] }[] {
  const team = teamFor(org, projectId);
  return TEAM_GROUPS.map((g) => ({
    group: g.group,
    rows: g.roles.map((r) => ({
      role: r.role,
      multi: !!r.multi,
      members: team.filter((m) => m.role === r.role),
    })),
  }));
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
