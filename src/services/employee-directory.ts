// Imports the employee master sheet into the in-app directory.
//
// PRIVACY: the master carries a "Mobile NO" column. It is read and thrown away — team
// assignment needs a name, a role and a work address, not 182 people's personal phone numbers.
// Holding the smallest useful copy is the point, and this repository is public.
import type { Employee } from '../domain/org';

/** Header spellings seen in the master sheet, mapped to the fields the app needs. */
const COLUMNS: [keyof Employee, RegExp][] = [
  ['code', /^emp\s*code$/i],
  ['name', /^employee\s*name$/i],
  ['designation', /^(actual\s*)?designation$/i],
  ['department', /^department$/i],
  ['location', /^base\s*location$/i],
  ['email', /^e-?mail(\s*id'?s?)?$/i],
  ['sbu', /^sbu$/i],
  ['status', /^status$/i],
  ['reportingTo', /^reporting\s*to$/i],
];

/** Columns deliberately not imported, and why — kept explicit so nobody re-adds them casually. */
export const DROPPED_COLUMNS: Record<string, string> = {
  'Mobile NO': 'personal phone number — not needed to staff a project',
  DOJ: 'joining date — not needed to staff a project',
  Grade: 'internal pay grade — not needed to staff a project',
};

/** Split a CSV line, honouring quoted fields that contain commas. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export interface DirectoryImport {
  employees: Employee[];
  rowsRead: number;
  rowsSkipped: number;
  /** columns present in the file that were deliberately not imported */
  dropped: string[];
  warnings: string[];
}

export function parseEmployeeCsv(text: string): DirectoryImport {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) throw new Error('That file is empty.');

  const header = splitCsvLine(lines[0]);
  const index: Partial<Record<keyof Employee, number>> = {};
  for (const [field, re] of COLUMNS) {
    const i = header.findIndex((h) => re.test(h));
    if (i >= 0) index[field] = i;
  }
  if (index.name === undefined)
    throw new Error(`No "Employee Name" column found. Header was: ${header.slice(0, 8).join(', ')}`);

  const dropped = header.filter((h) => Object.keys(DROPPED_COLUMNS).some((d) => d.toLowerCase() === h.toLowerCase()));
  const warnings: string[] = [];
  const at = (cells: string[], f: keyof Employee) => (index[f] === undefined ? '' : cells[index[f]!] ?? '');

  const employees: Employee[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const name = at(cells, 'name');
    if (!name) {
      skipped++;
      continue;
    }
    // fall back to the name when the sheet has no code, so identity is still stable
    const code = at(cells, 'code') || `n:${name.toLowerCase().replace(/\s+/g, '-')}`;
    if (seen.has(code)) {
      warnings.push(`Duplicate employee code ${code} (${name}) — kept the first row.`);
      skipped++;
      continue;
    }
    seen.add(code);
    employees.push({
      code,
      name,
      designation: at(cells, 'designation'),
      department: at(cells, 'department'),
      location: at(cells, 'location'),
      email: at(cells, 'email'),
      sbu: at(cells, 'sbu'),
      status: at(cells, 'status') || 'Current',
      reportingTo: at(cells, 'reportingTo'),
    });
  }

  if (dropped.length)
    warnings.push(`Not imported: ${dropped.map((d) => `${d} (${DROPPED_COLUMNS[Object.keys(DROPPED_COLUMNS).find((k) => k.toLowerCase() === d.toLowerCase())!]})`).join('; ')}.`);

  return { employees, rowsRead: lines.length - 1, rowsSkipped: skipped, dropped, warnings };
}
