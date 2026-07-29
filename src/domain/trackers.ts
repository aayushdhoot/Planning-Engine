// Tracker record types, matching the Flipspaces working formats.
// Every tracker row is editable in-app and carries its own status, so these are
// live registers rather than generated read-only lists.

export type TrackStatus = 'Not Started' | 'WIP' | 'Completed' | 'Delayed' | 'Hold' | 'Pending' | 'For information';
export const TRACK_STATUSES: TrackStatus[] = ['Not Started', 'WIP', 'Completed', 'Delayed', 'Hold', 'Pending', 'For information'];

export type Criticality = 'Very Critical' | 'High' | 'Medium' | 'Low';
export const CRITICALITIES: Criticality[] = ['Very Critical', 'High', 'Medium', 'Low'];

/**
 * Design tracker — format from the GFC/MEP/Sampling tracker sheet:
 * Category | Sub Category | Drawing name | Criticality | Revision |
 * Start Date | End Date (INT) | Revised End Date (INT) | Status (INT) |
 * End Date (Client) | Revised End Date (Client) | Status (Client)
 */
export interface DesignRow {
  id: string;
  category: 'GFC' | 'MEP' | 'SAMPLING';
  subCategory: string;
  drawingName: string;
  criticality: Criticality;
  revision: string;
  startDate: string | null;
  /** internal issue date target */
  endDateInt: string | null;
  revisedEndDateInt: string | null;
  statusInt: TrackStatus;
  /** client/consultant approval target */
  endDateClient: string | null;
  revisedEndDateClient: string | null;
  statusClient: TrackStatus;
  /** what this drawing releases downstream — the link to procurement & execution */
  releases: string[];
  /** provenance for the computed dates */
  basis: string;
}

export interface DesignSummary {
  drawings: number;
  approved: number;
  pending: number;
  percentComplete: number;
}

/**
 * RA milestone tracker — replaces the cashflow module.
 *
 * A billing milestone is not a date, it is a list of physical things that must be true on site
 * before the invoice can go out ("partition marking, frameworks, single-side skinning, civil
 * wall, plastering…"). The contract states those as prose; each clause becomes a checkable
 * line here, tied to the site activity that satisfies it, so billing readiness is tracked by
 * the project team rather than asserted on the due date.
 */
export interface RaCheckpoint {
  id: string;
  /** the clause text, e.g. "partition line marking" */
  description: string;
  /** 'execution' | 'material' | 'order' — the three kinds a milestone clause takes */
  kind: 'execution' | 'material' | 'order';
  /** activity whose completion evidences this clause, when one maps */
  activityId: string | null;
  activityName: string | null;
  /** date the linked activity is planned to finish */
  plannedDate: string | null;
  actualDate: string | null;
  status: TrackStatus;
  responsibility: string;
  remarks: string;
}

export interface RaMilestoneRow {
  id: string;
  /** RA1, RA2, ADV … */
  code: string;
  /** calendar days from contract start */
  dayOffset: number;
  /** % of contract value billed at this milestone */
  percent: number;
  /** amount, when a contract value is known; null in views where value is withheld */
  amount: number | null;
  dueDate: string;
  revisedDate: string | null;
  /** the clauses that must be satisfied to raise this bill */
  checkpoints: RaCheckpoint[];
  /** 0..100, from checkpoint completion */
  readiness: number;
  status: TrackStatus;
  invoiceNo: string;
  invoiceDate: string | null;
  remarks: string;
}

export interface RaSummary {
  milestones: number;
  billed: number;
  billedPercent: number;
  /** milestones whose due date has passed but which are not billed */
  overdue: number;
  nextDue: RaMilestoneRow | null;
}

export function summariseRa(rows: RaMilestoneRow[], today: string): RaSummary {
  const billed = rows.filter((r) => r.status === 'Completed');
  const pending = rows.filter((r) => r.status !== 'Completed');
  return {
    milestones: rows.length,
    billed: billed.length,
    billedPercent: Math.round(billed.reduce((s, r) => s + r.percent, 0) * 10) / 10,
    overdue: pending.filter((r) => (r.revisedDate ?? r.dueDate) < today).length,
    nextDue: pending.sort((a, b) => ((a.revisedDate ?? a.dueDate) < (b.revisedDate ?? b.dueDate) ? -1 : 1))[0] ?? null,
  };
}

/**
 * Procurement tracker — order-by and delivery-required only; no BOQ or BCS value.
 * Category | Sub Category | Criticality | Order By | Delivery Required |
 * Revised Date | Vendor | Order Status | Material Delivery Status | Responsibility | Remarks
 */
export interface ProcurementRow {
  id: string;
  category: string;
  subCategory: string;
  criticality: Criticality;
  /** latest date the PO can be released without hitting the programme */
  orderBy: string | null;
  /** date the material must be on site */
  deliveryRequired: string | null;
  revisedDate: string | null;
  vendor: string;
  orderStatus: 'Open' | 'Closed' | 'Hold' | 'Partially Ordered';
  deliveryStatus: 'Not Started' | 'In Transit' | 'Partially Delivered' | 'Delivered';
  responsibility: string;
  remarks: string;
  /** the design deliverable that must land before this can be ordered */
  gatedBy: string | null;
  /** the site activity this feeds */
  feeds: string | null;
  basis: string;
}

/**
 * To-do tracker — Description | Responsibility | Priority | Status |
 * Start Date | End Date | Revised Date | Notes
 */
export interface TodoRow {
  id: string;
  description: string;
  responsibility: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: TrackStatus;
  startDate: string | null;
  endDate: string | null;
  revisedDate: string | null;
  notes: string;
  category: 'site' | 'procurement' | 'design' | 'commercial';
}

/**
 * Client / builder dependency tracker —
 * Sr | Area | Description | Responsibility | Plan Date | Actual Date | Delay (days) | Status | Remarks
 */
export interface DependencyRow {
  id: string;
  sr: number;
  area: 'Kick Off' | 'Design' | 'Commercial' | 'Operation' | 'Design/Operation';
  description: string;
  responsibility: string;
  planDate: string | null;
  actualDate: string | null;
  status: TrackStatus;
  remarks: string;
  /** what slips if this is late */
  blocks: string | null;
}

/** Delay in days between plan and actual (or today when still open). */
export function delayDays(planDate: string | null, actualDate: string | null, today: string): number | null {
  if (!planDate) return null;
  const end = actualDate ?? today;
  if (end <= planDate) return 0;
  return Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(planDate + 'T00:00:00Z')) / 86400000);
}

export function isOpen(s: TrackStatus): boolean {
  return s !== 'Completed' && s !== 'For information';
}

export function summariseDesign(rows: DesignRow[]): DesignSummary {
  const approved = rows.filter((r) => r.statusClient === 'Completed').length;
  return {
    drawings: rows.length,
    approved,
    pending: rows.length - approved,
    percentComplete: rows.length ? Math.round((approved / rows.length) * 100) : 0,
  };
}
