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

export function unansweredBlocking(queries: IntakeQuery[]): IntakeQuery[] {
  return queries.filter((q) => q.blocking && !q.answer.trim());
}
