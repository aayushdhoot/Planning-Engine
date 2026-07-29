// The directory holds real people's data, so the tests pin what is imported and — more
// importantly — what is deliberately thrown away.
import { describe, expect, it } from 'vitest';
import { parseEmployeeCsv, splitCsvLine } from '../src/services/employee-directory';
import { emptyOrg, employeeByCode, isAssignable, summariseDirectory, teamFor, PROJECT_ROLES } from '../src/domain/org';

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
