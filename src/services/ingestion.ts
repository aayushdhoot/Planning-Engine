// Ingestion is behind a service interface so the source (xlsx upload, Drive sync,
// ERP feed) can change without touching the engine.
import * as XLSX from 'xlsx';
import type { BoqPackage, ProjectInputs, Traced } from '../domain/types';
import { canonicalUnit } from '../engine/wbs';

/**
 * Where a BOQ's cells came from: a workbook, a CSV/TSV, or a table already read off a PDF
 * page by page. All three go through the same row loop below — the point of accepting rows
 * directly is that a PDF BOQ and an Excel BOQ cannot end up disagreeing about what a package is.
 */
export type BoqSource = ArrayBuffer | string | unknown[][];

export interface IngestedBoq {
  packages: BoqPackage[];
  areaSft: Traced<number> | null;
  contractValue: Traced<number> | null;
  bcsValue: Traced<number> | null;
  warnings: string[];
  rowsScanned: number;
  rowsSkipped: number;
}

export interface IngestionService {
  /** Parse a priced BOQ workbook or CSV into engine inputs. */
  parseBoq(file: { name: string; data: BoqSource }): IngestedBoq;
  /** Merge ingested BOQ data into an existing project shell. */
  applyToProject(base: ProjectInputs, boq: IngestedBoq, sourceName: string): ProjectInputs;
}

// ---------------------------------------------------------------- helpers

/** Parse messy money/number cells: "₹ 1,23,456.00", " 82,100,400 ", "(1,200)", "-", "" */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || s === '-' || s === '—' || /^n\/?a$/i.test(s)) return null;
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()₹$€£,\s]/g, '').replace(/^INR/i, '');
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Section codes used in Flipspaces BOQ summaries: A, A1, B2, C3, PHE, HVAC… */
const CODE_RE = /^([A-Z]{1,4}\d{0,2})$/;

const TRADE_BY_KEYWORD: [RegExp, string][] = [
  [/civil|block|plaster|masonry/i, 'civil'],
  [/interior|partition|panel|gypsum|ceiling|carpentry|door/i, 'partition'],
  [/glass|glazing|film|frost/i, 'glass'],
  [/carpet|floor|tile|vinyl/i, 'flooring'],
  [/furniture|modular|chair|workstation/i, 'modular'],
  [/electric|light|ups|lt panel|power/i, 'electrical'],
  [/hvac|duct|vrf|vav|air/i, 'hvac'],
  [/plumb|phe|sanitary|toilet/i, 'plumbing'],
  [/sprinkler|fire|security|cctv|fas|alarm|flss/i, 'sprinkler'],
  [/network|passive|node|data|lv/i, 'lv'],
  [/paint|putty|polish/i, 'painting'],
  [/sign|graphic|blind|planter|misc|gss/i, 'finishing'],
];

export function tradeFor(name: string): string {
  for (const [re, t] of TRADE_BY_KEYWORD) if (re.test(name)) return t;
  return 'general';
}

const isTotalRow = (s: string) => /grand\s*total|^total\b|sub\s*total|gst|bocw|taxes/i.test(s);

// ---------------------------------------------------------------- service

export class BoqIngestionService implements IngestionService {
  parseBoq(file: { name: string; data: BoqSource }): IngestedBoq {
    const rows = this.toRows(file);
    const warnings: string[] = [];
    const packages: BoqPackage[] = [];
    let areaSft: Traced<number> | null = null;
    let contractValue: Traced<number> | null = null;
    let bcsValue: Traced<number> | null = null;
    let skipped = 0;
    const seen = new Set<string>();

    for (const [i, row] of rows.entries()) {
      const cells = row.map((c) => (c == null ? '' : String(c).trim()));
      const joined = cells.join(' ');
      if (!joined.trim()) {
        skipped++;
        continue;
      }

      // project area, wherever it appears
      if (!areaSft && /project\s*area/i.test(joined)) {
        const n = cells.map(parseAmount).find((x): x is number => x != null && x > 100);
        if (n) areaSft = { value: n, provenance: 'input', source: `${file.name} · row ${i + 1} (PROJECT AREA)` };
      }

      // grand total (excl. taxes) drives contract value; the adjacent BCS column drives cost
      if (/grand\s*total/i.test(joined) && !/with\s*taxes|gst/i.test(joined)) {
        const nums = cells.map(parseAmount).filter((x): x is number => x != null && x > 1000);
        if (nums.length && !contractValue) {
          const total = Math.max(...nums);
          contractValue = { value: total, provenance: 'input', source: `${file.name} · row ${i + 1} (GRAND TOTAL excl. taxes)` };
          // the BCS column sits beside the total; rate-per-sft cells are orders of magnitude
          // smaller, so require the candidate to be a plausible cost (40–95% of the total)
          const bcs = nums.filter((n) => n < total && n >= total * 0.4 && n <= total * 0.95).sort((a, b) => b - a)[0];
          if (bcs) bcsValue = { value: bcs, provenance: 'input', source: `${file.name} · row ${i + 1} (BCS column)` };
        }
      }

      if (isTotalRow(joined)) {
        skipped++;
        continue;
      }

      // a package line: leading code cell + a name + at least one amount
      const codeCell = cells.find((c) => CODE_RE.test(c));
      if (!codeCell) {
        skipped++;
        continue;
      }
      const codeIdx = cells.indexOf(codeCell);
      // merged-cell rows leave the name blank in the expected column — scan forward
      const name = cells.slice(codeIdx + 1).find((c) => c && parseAmount(c) === null && c.length > 2);
      if (!name) {
        skipped++;
        continue;
      }
      const amounts = cells
        .slice(codeIdx + 1)
        .map(parseAmount)
        .filter((x): x is number => x != null && x > 0);
      if (!amounts.length) {
        skipped++;
        continue;
      }
      // heuristic: largest amount is the client value; the next-largest below it that is
      // between 50% and 95% of it is the BCS cost (margin is typically 5–50%)
      const client = Math.max(...amounts);
      const bcsCandidate = amounts.filter((a) => a < client && a >= client * 0.5 && a <= client * 0.95).sort((a, b) => b - a)[0];

      if (seen.has(codeCell)) {
        warnings.push(`Duplicate package code ${codeCell} at row ${i + 1} — kept the first occurrence.`);
        skipped++;
        continue;
      }
      seen.add(codeCell);

      // QTY / UNIT columns, when the sheet is line-item rather than summary level
      let quantity: Traced<number> | undefined;
      let unit: string | undefined;
      const unitIdx = cells.findIndex((c) => c && canonicalUnit(c) !== null);
      if (unitIdx > codeIdx) {
        const canon = canonicalUnit(cells[unitIdx])!;
        // the quantity is the first plausible number after the unit cell, or just before it.
        // "UNIT, QTY" and "QTY, UNIT" are both ordinary BOQ layouts; in the second the cell
        // after the unit is the AMOUNT column, and preferring it unconditionally meant the
        // whole row lost its quantity rather than falling back to the cell on the other side.
        const after = parseAmount(cells[unitIdx + 1]);
        const before = parseAmount(cells[unitIdx - 1]);
        const usable = (n: number | null) => n != null && n > 0 && n !== client;
        const q = usable(after) ? after : usable(before) ? before : null;
        if (q != null && q !== client) {
          quantity = { value: q, provenance: 'input', source: `${file.name} · row ${i + 1} (${codeCell} QTY)` };
          unit = canon;
        }
      }

      packages.push({
        code: codeCell,
        name,
        clientAmount: { value: client, provenance: 'input', source: `${file.name} · row ${i + 1} (${codeCell})` },
        bcsAmount: bcsCandidate != null ? { value: bcsCandidate, provenance: 'input', source: `${file.name} · row ${i + 1} (${codeCell} BCS)` } : null,
        trade: tradeFor(name),
        quantity,
        unit,
      });
    }

    // roll-up rows (A) alongside their children (A1, A2) would double-count
    const childPrefixes = new Set(packages.filter((p) => /\d$/.test(p.code)).map((p) => p.code.replace(/\d+$/, '')));
    const deduped = packages.filter((p) => !(childPrefixes.has(p.code) && !/\d$/.test(p.code)));
    if (deduped.length !== packages.length)
      warnings.push(`Dropped ${packages.length - deduped.length} roll-up row(s) that would double-count their sub-packages.`);

    if (!deduped.length) warnings.push('No priced package rows recognised — check that the summary sheet is the first sheet.');
    if (!areaSft) warnings.push('Project area not found in the BOQ; per-sft norms will fall back to minimums.');
    if (!bcsValue) warnings.push('No BCS (internal cost) column detected; margin cannot be computed from the BOQ.');
    const withQty = deduped.filter((p) => p.quantity).length;
    warnings.push(
      withQty === 0
        ? 'No QTY/UNIT columns recognised — durations will be derived from package value rather than physical quantity. Upload a line-item BOQ for per-unit accuracy.'
        : `${withQty} of ${deduped.length} packages carry a physical quantity; those trades will be driven per-unit.`,
    );

    const sum = deduped.reduce((s, p) => s + p.clientAmount.value, 0);
    if (contractValue && sum > 0 && Math.abs(sum - contractValue.value) / contractValue.value > 0.05)
      warnings.push(`Package total ${Math.round(sum).toLocaleString('en-IN')} differs from the grand total ${contractValue.value.toLocaleString('en-IN')} by more than 5% — some lines may not have been recognised.`);

    return { packages: deduped, areaSft, contractValue, bcsValue, warnings, rowsScanned: rows.length, rowsSkipped: skipped };
  }

  applyToProject(base: ProjectInputs, boq: IngestedBoq, sourceName: string): ProjectInputs {
    return {
      ...base,
      boqPackages: boq.packages,
      areaSft: boq.areaSft ?? base.areaSft,
      contractValue: boq.contractValue ?? base.contractValue,
      bcsValue: boq.bcsValue ?? base.bcsValue,
      provided: { ...base.provided, boq: boq.packages.length > 0 },
      id: base.id,
      name: base.name === '' ? sourceName : base.name,
    };
  }

  private toRows(file: { name: string; data: BoqSource }): unknown[][] {
    // Already a table. A BOQ that only exists as a PDF is transcribed page by page by the
    // vision reader (services/extraction/boq-vision.ts) and arrives here as rows, so it goes
    // through the identical parser the workbook does rather than a second, divergent one.
    if (Array.isArray(file.data)) return file.data as unknown[][];
    if (typeof file.data === 'string') {
      // CSV/TSV
      const delim = file.data.includes('\t') && !file.data.includes(',') ? '\t' : ',';
      return file.data.split(/\r?\n/).map((line) => splitCsv(line, delim));
    }
    const wb = XLSX.read(file.data, { type: 'array' });
    // scan every sheet; summary tables are not always first
    const rows: unknown[][] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const arr = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
      rows.push(...arr);
    }
    return rows;
  }
}

/** Minimal CSV splitter that respects quoted fields containing the delimiter. */
export function splitCsv(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === delim && !q) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}
