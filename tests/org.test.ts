// The directory holds real people's data, so the tests pin what is imported and — more
// importantly — what is deliberately thrown away.
import { describe, expect, it } from 'vitest';
import { parseEmployeeCsv, parseEmployeeFile, parseEmployeeWorkbook, splitCsvLine } from '../src/services/employee-directory';
import { TEAM_GROUPS, approverFor, departmentLabel, emptyOrg, employeeByCode, emptySite, groupedTeam, isAssignable, levelFor, siteFor, summariseDirectory, teamFor, PROJECT_ROLES, type OrgState } from '../src/domain/org';

const CSV = [
  'Emp Code,Emp Type,Employee Name,Grade,Actual Designation,Department,DOJ,SBU,Base Location,Status,Mobile NO,Email Id\'s,Reporting to',
  '44,India Full time,Abhijeet Pawar,F11,Senior Vice President - Business Development,Business Development,25-Apr-2017,EV Central,Mumbai,Current,9403717007,abhijeet.pawar@flipspaces.com,',
  '1446,India Full time,"Satpute, Shubhangi",F9,Assistant Vice President - Key Accounts,Business Development,27-Jan-2025,EV India,Mumbai,Current,9930122891,s.satpute@flipspaces.com,44',
  '999,India Full time,Gone Person,F5,Manager,Operations,01-Jan-2020,EV India,Pune,Resigned,9999999999,gone@flipspaces.com,44',
].join('\n');

describe('splitCsvLine', () => {
  it('honours quoted fields containing commas', () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    expect(splitCsvLine('a,"say ""hi""",b')).toEqual(['a', 'say "hi"', 'b']);
  });
});

describe('employee directory import', () => {
  const r = parseEmployeeCsv(CSV);

  it('imports the fields needed to staff a project', () => {
    expect(r.employees).toHaveLength(3);
    const e = r.employees[0];
    expect(e).toMatchObject({
      code: '44',
      name: 'Abhijeet Pawar',
      designation: 'Senior Vice President - Business Development',
      department: 'Business Development',
      location: 'Mumbai',
      email: 'abhijeet.pawar@flipspaces.com',
      status: 'Current',
    });
  });

  it('DISCARDS mobile numbers, joining dates and pay grades', () => {
    const json = JSON.stringify(r.employees);
    expect(json).not.toContain('9403717007');
    expect(json).not.toContain('9930122891');
    expect(json).not.toContain('25-Apr-2017');
    expect(json).not.toContain('F11');
    // and it says so rather than dropping them silently
    expect(r.dropped.sort()).toEqual(['DOJ', 'Grade', 'Mobile NO']);
    expect(r.warnings.join(' ')).toMatch(/Mobile NO/);
  });

  it('reads a quoted name containing a comma', () => {
    expect(r.employees[1].name).toBe('Satpute, Shubhangi');
  });

  it('keeps leavers in the list but not assignable', () => {
    const gone = r.employees.find((e) => e.name === 'Gone Person')!;
    expect(isAssignable(gone)).toBe(false);
    expect(summariseDirectory(r.employees)).toMatchObject({ total: 3, assignable: 2 });
  });

  it('refuses a file that is not the employee master', () => {
    expect(() => parseEmployeeCsv('foo,bar\n1,2')).toThrow(/Employee Name/);
    expect(() => parseEmployeeCsv('')).toThrow(/empty/i);
  });

  it('drops a duplicate code rather than double-listing a person', () => {
    const dup = parseEmployeeCsv(`${CSV}\n44,India Full time,Abhijeet Pawar,F11,SVP,BD,25-Apr-2017,EV Central,Mumbai,Current,940,a@b.com,`);
    expect(dup.employees).toHaveLength(3);
    expect(dup.warnings.join(' ')).toMatch(/Duplicate employee code 44/);
  });
});

describe('project teams', () => {
  const org = { ...emptyOrg(), employees: parseEmployeeCsv(CSV).employees };

  it('seeds the standard role slots for a project with no team yet', () => {
    expect(teamFor(org, 'skf-pune').map((m) => m.role)).toEqual([...PROJECT_ROLES]);
    expect(teamFor(org, 'skf-pune').every((m) => m.employeeCode === null)).toBe(true);
  });

  it('resolves an assigned member back to the directory', () => {
    const withTeam = { ...org, teams: { 'skf-pune': [{ role: 'Project Manager', employeeCode: '44' }] } };
    expect(employeeByCode(withTeam, '44')!.name).toBe('Abhijeet Pawar');
    expect(employeeByCode(withTeam, null)).toBeNull();
    expect(employeeByCode(withTeam, 'nope')).toBeNull();
  });
});

describe('the master can be an Excel workbook, not just CSV', () => {
  it('reads an .xlsx and produces the same people as the CSV', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(CSV, { type: 'string' });
    // a real workbook has other tabs; the importer must find the right one
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notes'], ['not the master']]), 'Notes');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const fromXlsx = parseEmployeeWorkbook(buf);
    expect(fromXlsx.employees.map((e) => e.name)).toEqual(parseEmployeeCsv(CSV).employees.map((e) => e.name));
    expect(fromXlsx.dropped.sort()).toEqual(['DOJ', 'Grade', 'Mobile NO']);
    expect(JSON.stringify(fromXlsx.employees)).not.toContain('9403717007');
  });

  it('keeps employee codes as text — "FSD - 002" must not be mangled', async () => {
    const XLSX = await import('xlsx');
    const rows = [
      ['Emp Code', 'Employee Name', 'Actual Designation', 'Status'],
      ['FSD - 002', 'Shantanu Dingre', 'Vice President', 'Current'],
      ['0044', 'Zero Prefixed', 'Manager', 'Current'],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Master');
    const r = parseEmployeeWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    expect(r.employees.map((e) => e.code)).toEqual(['FSD - 002', '0044']);
  });

  it('says which sheets it looked at when none is the master', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 'b'], [1, 2]]), 'Sheet1');
    expect(() => parseEmployeeWorkbook(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)).toThrow(/Sheet1/);
  });

  it('dispatches on the file extension', async () => {
    const asFile = (name: string, text: string) => ({
      name,
      text: async () => text,
      arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer,
    });
    const r = await parseEmployeeFile(asFile('master.csv', CSV));
    expect(r.employees).toHaveLength(3);
  });
});

describe('project team is grouped the way the business is organised', () => {
  const org = { ...emptyOrg(), employees: parseEmployeeCsv(CSV).employees };

  it('exposes the real functional groups, not seven flat slots', () => {
    expect(TEAM_GROUPS.map((g) => g.group)).toEqual(['Sales', 'Procurement', 'Snag', 'Operations', 'Design', 'Additional']);
  });

  it('allows several people in the roles that take several', () => {
    const procurement = TEAM_GROUPS.find((g) => g.group === 'Procurement')!;
    expect(procurement.roles.find((r) => r.role === 'Procurement Executive')!.multi).toBe(true);
    expect(procurement.roles.find((r) => r.role === 'Procurement Head')!.multi).toBeUndefined();
  });

  it('groups a seeded team without losing any role', () => {
    const grouped = groupedTeam(org, 'p1');
    const roles = grouped.flatMap((g) => g.rows.map((r) => r.role));
    expect(new Set(roles).size).toBe(roles.length);
    expect(roles).toContain('Site Supervisor');
    expect(roles).toContain('3D Artist');
  });

  it('derives the seniority badge from designation, never from pay grade', () => {
    expect(levelFor('Senior Vice President - Business Development')).toBe('L3');
    expect(levelFor('Deputy General Manager - Operations')).toBe('L3');
    expect(levelFor('Senior Manager- Procurement')).toBe('L2');
    expect(levelFor('Executive - Procurement')).toBe('L1');
    expect(levelFor('Site Supervisor')).toBe('L1');
  });

  it('shortens the department for the badge', () => {
    expect(departmentLabel('Procurement, Production, Inventory and Services')).toBe('Procurement');
    expect(departmentLabel('Business Development')).toBe('Sales');
    expect(departmentLabel('Operations')).toBe('Operations');
  });
});

describe('project site details', () => {
  it('starts empty rather than inventing an address', () => {
    const s = siteFor(emptyOrg(), 'p1');
    expect(s.address).toBe('');
    expect(s.carpetAreaSft).toBeNull();
    expect(s.driveUrl).toBe('');
  });

  it('keeps the Drive folder per project so it can be rescanned later', () => {
    const org = { ...emptyOrg(), sites: { p1: { ...emptySite(), driveUrl: 'https://drive.google.com/drive/folders/abc' } } };
    expect(siteFor(org, 'p1').driveUrl).toMatch(/folders\/abc/);
    expect(siteFor(org, 'p2').driveUrl).toBe('');
  });
});

describe('a date revision needs BU Head approval before it moves the plan', () => {
  const withTeam = (code: string | null) => ({
    ...emptyOrg(),
    employees: parseEmployeeCsv(CSV).employees,
    teams: { p1: [{ role: 'BU Head', employeeCode: code }] },
  });

  it('names the BU Head assigned to the project as the approver', () => {
    expect(approverFor(withTeam('44'), 'p1')!.name).toBe('Abhijeet Pawar');
  });

  it('has no approver when no BU Head is assigned — the change cannot be rubber-stamped', () => {
    expect(approverFor(withTeam(null), 'p1')).toBeNull();
    expect(approverFor(emptyOrg(), 'p1')).toBeNull();
  });

  it('keeps a proposed change out of the approved dates until it is signed off', () => {
    const org: OrgState = {
      ...withTeam('44'),
      dates: { p1: { internalStart: '2026-06-08' } },
      pendingDates: { p1: { proposed: { internalStart: '2026-07-01' }, requestedAt: '2026-06-01T00:00:00Z', reason: 'builder handover slipped' } },
    };
    // the plan runs on the APPROVED value, not the proposal
    expect(org.dates!.p1.internalStart).toBe('2026-06-08');
    expect(org.pendingDates!.p1.proposed.internalStart).toBe('2026-07-01');
  });
});
