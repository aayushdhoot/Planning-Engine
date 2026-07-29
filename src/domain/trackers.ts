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
