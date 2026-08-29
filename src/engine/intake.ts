// Project intake: classify a Drive scan against the required-input checklist, then
// generate the questions the project head must answer BEFORE a plan is produced.
//
// The engine deliberately asks rather than assumes. Anything it cannot establish from the
// documents becomes a query; unanswered mandatory queries block plan generation.
import type { DriveFile, DriveScan } from '../services/drive';

/** The input checklist from the Planning-Engine-Structure sheet. */
export interface InputSlot {
  key: string;
  label: string;
  mandatory: boolean;
  /** patterns that identify a matching document */
  match: RegExp;
  hint: string;
}

export const INPUT_SLOTS: InputSlot[] = [
  // Listed before the BOQ so a programme sitting in a "BOQ & Project Plan" folder is
  // recognised as a programme. Optional: a project can be planned from scope alone, but when
  // an issued programme exists it is the highest-value input in the folder.
  { key: 'schedule', label: 'Issued programme / schedule', mandatory: false, match: /schedule|programme|program\b|pert|gantt|baseline/i, hint: 'Activity network with durations — the engine reproduces its dates exactly.' },
  { key: 'boq', label: 'Project BOQ (priced)', mandatory: true, match: /boq|bill of quant|bcs|bom[ _-]?cc|submission/i, hint: 'Priced BOQ with BCS — drives packages, value and cost.' },
  { key: 'layout', label: 'Project Layout', mandatory: true, match: /layout|floor ?plan|furniture layout/i, hint: 'Defines area and zoning.' },
  { key: 'drawings', label: 'Drawings', mandatory: true, match: /gfc|drawing|\.(dwg|dxf)\b|elevation|\brcp\b|shop ?drawing/i, hint: 'GFC set — gates execution.' },
  { key: 'day0Images', label: 'Day 0 site images', mandatory: true, match: /site ?(photo|picture|image|video)|day ?-? ?0|current site/i, hint: 'Establishes existing conditions.' },
  { key: 'contract', label: 'Project Contract / PO', mandatory: true, match: /contract|agreement|\bpo\b|work ?order|signed|con_/i, hint: 'Start date, duration, payment milestones, LD.' },
  { key: 'design3d', label: '3D Design', mandatory: true, match: /3d|render|view|visual/i, hint: 'Drives sampling and client approvals.' },
  { key: 'salesKt', label: 'Sales KT / email thread', mandatory: true, match: /kt|handover|mom|minutes|kick ?off|email|thread/i, hint: 'Captures commitments made during the sale.' },
  { key: 'makeList', label: 'Make list / sampling list', mandatory: true, match: /make ?list|brand ?list|specification|spec sheet|sampling|material.*(list|selection)|finish.*selection/i, hint: 'Approved makes and samples — drives lead times.' },
  { key: 'paymentTerms', label: 'Payment terms', mandatory: true, match: /payment|ra ?bill|milestone|commercial|fiscal/i, hint: 'Cashflow inflow schedule.' },
  { key: 'fitoutGuideline', label: 'Fitout guideline', mandatory: false, match: /fit ?-? ?out (manual|guideline)|house rules/i, hint: 'Builder rules — work hours, lifts, permits.' },
  { key: 'dbr', label: 'DBR', mandatory: false, match: /\bdbr\b|design basis/i, hint: 'Design basis report for MEP.' },
  { key: 'tender', label: 'Tender documents / RFP / RFQ', mandatory: false, match: /tender|rfp|rfq|proposal/i, hint: 'Scope baseline.' },
  { key: 'brand', label: 'Brand guideline', mandatory: false, match: /brand ?guide|identity|logo/i, hint: 'Signage and graphics.' },
  { key: 'clientPolicy', label: 'Policies of client', mandatory: false, match: /policy|policies|safety|ehs|red book|checklist/i, hint: 'Client-specific compliance.' },
];

export interface SlotStatus {
  slot: InputSlot;
  matches: DriveFile[];
  present: boolean;
}

export interface IntakeInventory {
  scan: DriveScan;
  slots: SlotStatus[];
  unmatched: DriveFile[];
  mandatoryMissing: string[];
  readyToRead: boolean;
}

/** Classify every scanned file against the checklist. */
export function buildInventory(scan: DriveScan): IntakeInventory {
  const claimed = new Set<string>();
  const slots: SlotStatus[] = INPUT_SLOTS.map((slot) => {
    const matches = scan.files.filter((f) => slot.match.test(f.name) || slot.match.test(f.path));
    matches.forEach((m) => claimed.add(m.id));
    return { slot, matches, present: matches.length > 0 };
  });
  const unmatched = scan.files.filter((f) => !claimed.has(f.id));
  const mandatoryMissing = slots.filter((s) => s.slot.mandatory && !s.present).map((s) => s.slot.label);
  return { scan, slots, unmatched, mandatoryMissing, readyToRead: scan.files.length > 0 };
}

// ------------------------------------------------------------------ queries

export type QueryKind = 'date' | 'number' | 'text' | 'choice';

export interface IntakeQuery {
  id: string;
  question: string;
  /** why the engine needs it — shown to the project head */
  why: string;
  kind: QueryKind;
  options?: string[];
  /** the plan cannot be generated until this is answered */
  blocking: boolean;
  /** what the engine found in the documents, if anything */
  foundHint: string | null;
  answer: string;
  /**
   * What the documents proposed for this question, and where each proposal was read from.
   *
   * Present means the person is confirming rather than composing. Absent means the folder did
   * not answer it and the field is genuinely blank — the distinction is the whole point, since
   * a screen that showed a filled-in field with no way to tell "read from clause 12" apart from
   * "someone's guess last Tuesday" would be worse than the blank one it replaced.
   */
  prefill?: QueryPrefill;
  /** set once a person has accepted the proposal. A blocking question is not satisfied by a
   * proposal alone, however well sourced — see unansweredBlocking below. */
  confirmed?: boolean;
}

export interface QueryPrefill {
  /** the proposal, already coerced to what this question's control accepts */
  value: string;
  /** file + clause for each document that proposed it */
  sources: string[];
  /** what the documents said, verbatim, when it could not be coerced into the control's shape
   * (a duration written "twelve weeks", a working-hours clause that fits no option). The field
   * stays blank in that case and still blocks — but the person is shown what was read rather
   * than being sent back to the document to find it again. */
  rawOnly?: string;
  /** other documents proposed something different. Never resolved silently: a contract and a
   * fit-out guideline disagreeing about working hours is a fact about the project, not noise. */
  conflicts?: string[];
}

/** One proposed answer as it arrives from the extraction adapter. */
export interface FoundAnswer {
  key: string;
  value: string;
  source: string;
}

/**
 * Generate the questions for the project head. These are the things the engine
 * refuses to assume: dates, working conditions, sequencing constraints and
 * anything the document set left ambiguous.
 */
export function buildQueries(inv: IntakeInventory): IntakeQuery[] {
  const has = (k: string) => inv.slots.find((s) => s.slot.key === k)?.present ?? false;
  const found = (k: string) => {
    const s = inv.slots.find((x) => x.slot.key === k);
    return s && s.matches.length ? s.matches.map((m) => m.name).slice(0, 2).join(', ') : null;
  };

  const q: IntakeQuery[] = [
    {
      id: 'q_start', question: 'What is the site commencement date?', kind: 'date', blocking: true,
      why: 'Every date in the plan is computed forward from this. The engine will not guess it.',
      foundHint: found('contract'), answer: '',
    },
    {
      id: 'q_duration', question: 'Contract duration in calendar days from commencement?', kind: 'number', blocking: true,
      why: 'Sets the external/client baseline and the buffer against the internal plan.',
      foundHint: found('contract'), answer: '',
    },
    {
      id: 'q_area', question: 'Carpet area in sft?', kind: 'number', blocking: true,
      why: 'Drives resource role counts and per-sft norm checks.',
      foundHint: found('boq'), answer: '',
    },
    {
      id: 'q_workmode', question: 'What working hours does the building permit?', kind: 'choice',
      options: ['Day & night (fastest)', 'Day only (normal)', 'Night only / no noisy work in the day (slowest)'],
      blocking: true,
      why: 'Materially changes durations. Getting this wrong invalidates the whole programme.',
      foundHint: has('fitoutGuideline') ? found('fitoutGuideline') : null, answer: '',
    },
    {
      id: 'q_weekoff', question: 'Which days are non-working on this site?', kind: 'choice',
      options: ['None — 7-day week', 'Sundays off', 'Sundays and alternate Saturdays off'],
      blocking: true,
      why: 'Flipspaces default is a 7-day week, but many buildings restrict weekend work.',
      foundHint: has('fitoutGuideline') ? found('fitoutGuideline') : null, answer: '',
    },
    {
      id: 'q_phasing', question: 'Is the floor handed over in one go, or in phases?', kind: 'text', blocking: true,
      why: 'Phased handover changes the sequence and usually the critical path.',
      foundHint: null, answer: '',
    },
    {
      id: 'q_scope', question: 'Which packages are in the GC scope vs client-supplied (IT, AV, furniture, white goods)?', kind: 'text', blocking: true,
      why: 'Client-supplied items are tracked as dependencies, not as our procurement.',
      foundHint: found('boq'), answer: '',
    },
    {
      id: 'q_longlead', question: 'Any long-lead items already ordered, or with a known vendor commitment?', kind: 'text', blocking: false,
      why: 'Prevents the procurement tracker showing order-by dates that have already been actioned.',
      foundHint: found('makeList'), answer: '',
    },
    {
      id: 'q_approvals', question: 'Which statutory approvals apply (BMC/MMRDA, Fire NOC, CFO, Mathadi) and who owns each?', kind: 'text', blocking: true,
      why: 'These sit on the critical path far more often than site work does.',
      foundHint: found('fitoutGuideline'), answer: '',
    },
    {
      id: 'q_milestones', question: 'What are the RA billing milestones (% and trigger)?', kind: 'text', blocking: true,
      why: 'Drives the cashflow inflow curve and the client billing schedule.',
      foundHint: found('paymentTerms'), answer: '',
    },
    {
      id: 'q_team', question: 'Who is the project head, site engineer, MEP engineer, design lead and procurement owner?', kind: 'text', blocking: false,
      why: 'Populates responsibility columns across the four trackers.',
      foundHint: found('salesKt'), answer: '',
    },
    {
      id: 'q_constraints', question: 'Any known site constraints — lift availability, storage, noise windows, occupied floors?', kind: 'text', blocking: false,
      why: 'These become dependency-tracker rows with dates rather than surprises later.',
      foundHint: found('fitoutGuideline'), answer: '',
    },
  ];

  // ask about anything mandatory that is missing from the folder
  for (const s of inv.slots.filter((x) => x.slot.mandatory && !x.present))
    q.push({
      id: `q_missing_${s.slot.key}`,
      question: `"${s.slot.label}" was not found in the folder. Where is it, or should the plan proceed without it?`,
      why: `${s.slot.hint} Without it the engine will record an explicit assumption rather than invent a value.`,
      kind: 'text',
      blocking: false,
      foundHint: null,
      answer: '',
    });

  return q;
}

/**
 * A blocking question is outstanding when it has no answer — or when the only answer is one the
 * documents proposed and nobody has yet accepted.
 *
 * The second half is the point of prefilling at all. Reading a commencement date out of a
 * contract is worth doing; treating that read as the project head's word for it is not. Editing
 * the value counts as accepting it: someone who retypes a figure has taken ownership of it just
 * as surely as someone who ticked the box.
 */
export function unansweredBlocking(queries: IntakeQuery[]): IntakeQuery[] {
  return queries.filter((q) => q.blocking && (!q.answer.trim() || (!!q.prefill && !q.confirmed)));
}

/** Every question still showing an unconfirmed proposal, blocking or not. */
export function awaitingConfirmation(queries: IntakeQuery[]): IntakeQuery[] {
  return queries.filter((q) => q.prefill && !q.confirmed);
}

// -------------------------------------------------------------- prefill

/**
 * A date in whatever form the document wrote it, as YYYY-MM-DD.
 *
 * Day-first is assumed for the ambiguous all-numeric forms, because every project this engine
 * plans is in India and "04/02/26" on an Indian fit-out contract is the fourth of February.
 * Returns null rather than a guess for anything else — a date is the one field where a wrong
 * value is worse than a blank one, since every date in the plan is computed forward from it.
 */
export function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return validDate(+iso[1], +iso[2], +iso[3]);

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  // "4 Feb 2026", "4th February 2026", "Feb 4, 2026"
  const named =
    s.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{4})\b/) ??
    s.match(/\b([A-Za-z]{3,9})[\s-]+(\d{1,2})(?:st|nd|rd|th)?[\s,-]+(\d{4})\b/);
  if (named) {
    const monthFirst = /^[A-Za-z]/.test(named[1]);
    const monthWord = (monthFirst ? named[1] : named[2]).slice(0, 3).toLowerCase();
    const month = MONTHS.indexOf(monthWord) + 1;
    if (month) return validDate(+named[3], month, +(monthFirst ? named[2] : named[1]));
  }

  const numeric = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (numeric) {
    const year = +numeric[3] < 100 ? 2000 + +numeric[3] : +numeric[3];
    return validDate(year, +numeric[2], +numeric[1]);
  }
  return null;
}

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

/** A count out of a cell that may carry separators, a unit, or a whole sentence around it. */
export function toNumber(raw: string): number | null {
  const m = raw.replace(/[, ]/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Map free text onto one of a choice question's options.
 *
 * Keyword rules rather than nearest-string: the options differ by meaning, not by spelling, and
 * "no work permitted on Sundays" shares almost no characters with "Sundays off". Returns null
 * when nothing matches confidently — the option list decides the programme's whole calendar, so
 * an unmatched clause is shown to the person verbatim instead of being rounded to a neighbour.
 */
export function matchOption(raw: string, options: string[]): string | null {
  const s = raw.toLowerCase();
  const pick = (i: number) => options[i] ?? null;

  const isWorkMode = options.some((o) => /night/i.test(o));
  if (isWorkMode) {
    if (/24\s*[x*/]\s*7|round the clock|day (and|&) night|both shifts|no restriction on (working )?hours/.test(s)) return pick(0);
    if (/night only|no (noisy|hot) work (in|during) the day|only at night|night shift only/.test(s)) return pick(2);
    if (/day only|daytime only|\bno night (work|working)\b|\d{1,2}\s*(am|hrs|:00)?\s*(to|-|–)\s*\d{1,2}\s*(pm|hrs|:00)/.test(s)) return pick(1);
    return null;
  }

  const isWeekOff = options.some((o) => /saturday/i.test(o));
  if (isWeekOff) {
    if (/alternate saturday|2nd and 4th saturday|second and fourth saturday/.test(s)) return pick(2);
    if (/sunday.{0,20}(off|holiday|non.?working|closed)|no work.{0,20}sunday|closed on sunday/.test(s)) return pick(1);
    if (/7.?day week|seven.?day week|all days|no week.?off|working all seven/.test(s)) return pick(0);
    return null;
  }

  return options.find((o) => s.includes(o.toLowerCase())) ?? null;
}

/**
 * Fold the documents' proposed answers into the question list.
 *
 * Nothing is applied: every proposal lands in `prefill`, and `confirmed` stays false until a
 * person says otherwise. Values that cannot be coerced into their control's shape are kept as
 * `rawOnly` and leave the field blank — showing "twelve weeks" inside a number input, or an
 * unmatched clause silently rounded to the nearest dropdown option, would put a wrong figure in
 * front of someone whose job at this screen is to glance and agree.
 */
export function applyPrefill(queries: IntakeQuery[], found: FoundAnswer[]): IntakeQuery[] {
  const byKey = new Map<string, FoundAnswer[]>();
  for (const f of found) {
    if (!f.value?.trim()) continue;
    const list = byKey.get(f.key) ?? [];
    list.push(f);
    byKey.set(f.key, list);
  }

  return queries.map((q) => {
    // The twelve question ids are `q_<key>` by construction; see buildQueries above.
    const proposals = byKey.get(q.id.replace(/^q_/, ''));
    if (!proposals?.length || q.answer.trim()) return q;

    const coerce = (v: string): string | null =>
      q.kind === 'date' ? toIsoDate(v)
        : q.kind === 'number' ? (toNumber(v) != null ? String(toNumber(v)) : null)
          : q.kind === 'choice' ? matchOption(v, q.options ?? [])
            : v.trim() || null;

    const coerced = proposals.map((p) => ({ ...p, value: coerce(p.value) }));
    const usable = coerced.filter((c): c is FoundAnswer => c.value != null);
    const distinct = [...new Set(usable.map((u) => u.value))];

    const prefill: QueryPrefill = usable.length
      ? {
          value: usable[0].value,
          sources: usable.filter((u) => u.value === usable[0].value).map((u) => u.source),
          conflicts: distinct.length > 1
            ? usable.filter((u) => u.value !== usable[0].value).map((u) => `${u.value} — ${u.source}`)
            : undefined,
        }
      : {
          value: '',
          sources: proposals.map((p) => p.source),
          rawOnly: proposals.map((p) => `"${p.value}" — ${p.source}`).join('; '),
        };

    return { ...q, answer: prefill.value, prefill, confirmed: false };
  });
}
