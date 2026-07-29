// Schedule ingestion: turn an issued programme spreadsheet into engine activities.
//
// This closes the gap that forced Emirates' 392-row programme to be transcribed by hand
// (BUILD_REPORT §5.1). It reads the Flipspaces "Project Schedule" sheet layout:
//
//   Activity No. | Section | Activity Description | Pred. | Dur (Days) | Start | Finish | Float | Critical
//
// The design rule still holds: this module maps STRUCTURE (which activities exist, which
// waits on which, of what type). It never invents a date. Dependency lags are DERIVED from
// the sheet's own planned start dates, exactly as deriveLags() does for SKF, so the CPM
// baseline reproduces the issued programme instead of drifting from it.
import * as XLSX from 'xlsx';
import type { Activity, Dependency, DepType, Traced } from '../domain/types';
import norms from '../norms/norms-v1.json';

export interface ParsedSchedule {
  activities: Activity[];
  projectStart: string | null;
  /** total calendar days implied by the sheet's own day numbering, when it uses one */
  durationDays: number | null;
  sections: string[];
  warnings: string[];
  rowsScanned: number;
  rowsSkipped: number;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_MS = 86400000;

/** "7-Jul-26" / "07-Jul-2026" / "2026-07-07" / a real Date -> ISO, else null. */
export function parseScheduleDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
  if (mon < 0) return null;
  const yr = Number(m[3]);
  const year = yr < 100 ? 2000 + yr : yr;
  const d = new Date(Date.UTC(year, mon, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * "2.1 SS+1", "3.6, 4.1, 3.5", "9.6 SS+3, 11.1", "-", "" -> dependencies.
 * The sheet states the type and lag; a bare id means finish-to-start with no lag.
 * Lags parsed here are the sheet's *stated* intent — deriveLags() below then reconciles
 * them against the planned start dates, which are the authoritative record.
 */
export function parsePredecessors(raw: unknown): Dependency[] {
  const s = String(raw ?? '').trim();
  if (!s || s === '-' || s === '—') return [];
  const out: Dependency[] = [];
  for (const part of s.split(/[,;]/)) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^([A-Za-z]{0,4}[\d.]+)\s*(FS|SS|FF)?\s*([+-]\s*\d+)?$/i);
    if (!m) continue;
    out.push({
      pred: m[1].replace(/\.$/, ''),
      type: ((m[2] ?? 'FS').toUpperCase() as DepType),
      lag: m[3] ? Number(m[3].replace(/\s+/g, '')) : 0,
    });
  }
  return out;
}

/**
 * Strip-out work is a demolition gang regardless of which trade installed the thing being
 * removed — "Dismantling of existing services (cable, duct, pipe)" is civil labour, not an
 * HVAC crew. This guard runs before any description matching for exactly that reason.
 */
const DEMOLITION_SECTION = /demolition|dismantl|debris|strip|make-safe/i;

/**
 * Description keywords, checked first because "Services - Phase I/II" sections bundle several
 * trades under one heading. Word boundaries matter: without \b, "site induction" matches
 * "duct" and books an HVAC gang.
 */
const TRADE_BY_DESCRIPTION: [RegExp, string][] = [
  // site-establishment work first: "Hoarding, barricading & signages" is a site gang, not signage fitters
  [/hoarding|barricad|mobilis|induction|permit/i, 'general'],
  [/hvac|\bduct|vrf|diffuser|air.?handl/i, 'hvac'],
  [/blind/i, 'finishing'],
  [/electric|conduit|cabling|\bswitch|light fixture|\bdb\b|mcb/i, 'electrical'],
  [/sprinkler|flss|fire|detector|pa system/i, 'sprinkler'],
  [/network|cable laying|\brack|termination|cctv|access control|\bav\b|signage|wayfinding/i, 'lv'],
  [/phe|drainage|sanitary|water line|plumb/i, 'plumbing'],
  [/glass|glazing/i, 'glass'],
  [/carpet|flooring|\btile|marble/i, 'flooring'],
  [/paint|primer|putty/i, 'painting'],
  [/ceiling/i, 'ceiling'],
  [/joinery|furniture|door|ironmonger/i, 'carpentry'],
  [/cleaning/i, 'cleaning'],
];

/** Section name -> engine trade, used when the description carries no trade keyword. */
const TRADE_BY_SECTION: [RegExp, string][] = [
  [/mobilis|survey|site clearance|handover|milestone|testing/i, 'general'],
  [/civil/i, 'civil'],
  [/ceiling/i, 'ceiling'],
  [/joinery|furniture/i, 'carpentry'],
  [/toilet/i, 'plumbing'],
  [/finish/i, 'finishing'],
  [/hvac/i, 'hvac'],
  [/electric/i, 'electrical'],
  [/network|passive/i, 'lv'],
  [/flss|fire|sprinkler/i, 'sprinkler'],
];

/**
 * Map an activity to one of the trades the norms define (crewByTrade / crewCaps). An unknown
 * trade would silently fall back to the default cap and distort manpower levelling, so this
 * only ever returns a trade that exists in norms.
 */
export function tradeForSection(section: string, description = ''): string {
  if (DEMOLITION_SECTION.test(section)) return 'civil';
  for (const [re, trade] of TRADE_BY_DESCRIPTION) if (re.test(description)) return trade;
  for (const [re, trade] of TRADE_BY_SECTION) if (re.test(section)) return trade;
  return 'general';
}

const crewOf = (trade: string): Traced<number> => ({
  value: (norms.crewByTrade as Record<string, number>)[trade] ?? norms.crewByTrade.general,
  provenance: 'norm',
  source: `${norms.version}:crewByTrade.${trade}`,
});

interface RawRow {
  id: string;
  section: string;
  name: string;
  deps: Dependency[];
  duration: number;
  start: string;
  sheetRow: number;
}

/**
 * Derive dependency lags from the sheet's planned start dates. Identical in intent to
 * deriveLags() in src/data/skf.ts: the driving predecessor is lagged so the activity starts
 * exactly on its planned date; non-driving predecessors keep a non-positive lag and therefore
 * carry genuine float. Without this the network reproduces the *stated* logic rather than the
 * *issued* dates — and in real programmes the two disagree.
 */
function deriveLags(rows: RawRow[], startIso: string): RawRow[] {
  const base = Date.parse(`${startIso}T00:00:00Z`);
  const idx = new Map(rows.map((r) => [r.id, Math.round((Date.parse(`${r.start}T00:00:00Z`) - base) / DAY_MS)]));
  const dur = new Map(rows.map((r) => [r.id, r.duration]));
  return rows.map((r) => {
    if (!r.deps.length) return r;
    const selfStart = idx.get(r.id)!;
    const natural = r.deps.map((d) => {
      const ps = idx.get(d.pred);
      const pd = dur.get(d.pred);
      if (ps == null || pd == null) return null;
      const pe = ps + pd;
      return d.type === 'FS' ? pe : d.type === 'SS' ? ps : pe - r.duration;
    });
    if (natural.some((n) => n == null)) return r;
    const nat = natural as number[];
    const maxNat = Math.max(...nat);
    const driver = nat.indexOf(maxNat);
    return {
      ...r,
      deps: r.deps.map((d, i) => ({ ...d, lag: i === driver ? selfStart - maxNat : Math.min(0, selfStart - nat[i]) })),
    };
  });
}

export class ScheduleIngestionService {
  /**
   * Parse a programme workbook. `sheet` defaults to the first sheet whose header row carries
   * an activity-number and duration column.
   */
  parse(file: { name: string; data: ArrayBuffer | string }, sheet?: string): ParsedSchedule {
    const wb =
      typeof file.data === 'string'
        ? XLSX.read(file.data, { type: 'string', cellDates: true })
        : XLSX.read(new Uint8Array(file.data), { type: 'array', cellDates: true });

    const names = sheet ? [sheet] : wb.SheetNames;
    for (const n of names) {
      const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, blankrows: false, raw: false });
      const parsed = this.fromGrid(grid, `${file.name} · ${n}`);
      if (parsed.activities.length) return parsed;
    }
    return { activities: [], projectStart: null, durationDays: null, sections: [], warnings: [`No activity rows found in ${file.name}.`], rowsScanned: 0, rowsSkipped: 0 };
  }

  /** Exposed separately so tests can drive it with a literal grid. */
  fromGrid(grid: unknown[][], source: string): ParsedSchedule {
    const warnings: string[] = [];
    const cell = (r: unknown[], i: number) => String(r[i] ?? '').trim();

    // locate the header row: needs an activity-number column and a duration column
    let head = -1;
    for (let i = 0; i < Math.min(grid.length, 40); i++) {
      const joined = grid[i].map((c) => String(c ?? '').replace(/\s+/g, ' ').toLowerCase()).join('|');
      if (/activity ?no/.test(joined) && /dur/.test(joined)) {
        head = i;
        break;
      }
    }
    if (head < 0)
      return { activities: [], projectStart: null, durationDays: null, sections: [], warnings: ['No header row with "Activity No." and "Dur" columns.'], rowsScanned: grid.length, rowsSkipped: grid.length };

    const hdr = grid[head].map((c) => String(c ?? '').replace(/\s+/g, ' ').toLowerCase());
    const col = (re: RegExp, fallback: number) => {
      const i = hdr.findIndex((h) => re.test(h));
      return i < 0 ? fallback : i;
    };
    const cId = col(/activity ?no/, 0);
    const cSection = col(/^section/, 1);
    const cName = col(/description|task name/, 2);
    const cPred = col(/pred/, 3);
    const cDur = col(/^dur/, 4);
    const cStart = col(/^start/, 5);

    const raw: RawRow[] = [];
    const dayNumbered: { row: RawRow; day: number }[] = [];
    let skipped = 0;

    for (let i = head + 1; i < grid.length; i++) {
      const r = grid[i];
      const id = cell(r, cId);
      const name = cell(r, cName);
      const durTxt = cell(r, cDur);
      // phase banners, legend and note rows carry no id/description/duration triple
      if (!id || !name || durTxt === '' || !/^\d+(\.\d+)?$/.test(durTxt)) {
        skipped++;
        continue;
      }
      const start = parseScheduleDate(r[cStart]);
      const row: RawRow = {
        id,
        section: cell(r, cSection) || 'Programme',
        name,
        deps: parsePredecessors(r[cPred]),
        duration: Math.round(Number(durTxt)),
        start: start ?? '',
        sheetRow: i + 1,
      };
      if (start) raw.push(row);
      else {
        // milestones often carry a day NUMBER rather than a date — resolved once we know day 1
        const day = Number(cell(r, cStart));
        if (Number.isFinite(day) && day > 0) dayNumbered.push({ row, day });
        else {
          skipped++;
          warnings.push(`Row ${i + 1} ("${name}") has no readable start date; skipped.`);
        }
      }
    }

    if (!raw.length)
      return { activities: [], projectStart: null, durationDays: null, sections: [], warnings: [...warnings, 'No rows carried a readable start date.'], rowsScanned: grid.length, rowsSkipped: skipped };

    const projectStart = raw.reduce((m, r) => (r.start < m ? r.start : m), raw[0].start);
    const base = Date.parse(`${projectStart}T00:00:00Z`);

    // day N is N-1 calendar days after day 1
    for (const { row, day } of dayNumbered) {
      row.start = new Date(base + (day - 1) * DAY_MS).toISOString().slice(0, 10);
      raw.push(row);
    }
    const durationDays = dayNumbered.length ? Math.max(...dayNumbered.map((d) => d.day)) : null;

    // drop dependencies pointing at rows that did not survive parsing, so CPM cannot throw
    const known = new Set(raw.map((r) => r.id));
    for (const r of raw) {
      const before = r.deps.length;
      r.deps = r.deps.filter((d) => known.has(d.pred) && d.pred !== r.id);
      if (r.deps.length !== before) warnings.push(`Activity ${r.id}: ${before - r.deps.length} predecessor(s) not found in the sheet; dropped.`);
    }

    const ordered = [...raw].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id.localeCompare(b.id)));
    const activities: Activity[] = deriveLags(ordered, projectStart).map((r) => ({
      id: r.id,
      name: r.name,
      phase: r.section,
      trade: tradeForSection(r.section, r.name),
      duration: { value: r.duration, provenance: 'input', source: `${source} · row ${r.sheetRow} (Dur Days)` },
      deps: r.deps, // lags derived from the sheet's planned Start column
      crew: crewOf(tradeForSection(r.section, r.name)),
      isMilestone: r.duration === 0,
      plannedStartFromInput: r.start,
    }));

    return {
      activities,
      projectStart,
      durationDays,
      sections: [...new Set(ordered.map((r) => r.section))],
      warnings,
      rowsScanned: grid.length,
      rowsSkipped: skipped,
    };
  }
}
