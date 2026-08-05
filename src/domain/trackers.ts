// Tracker record types, matching the Flipspaces working formats.
// Every tracker row is editable in-app and carries its own status, so these are
// live registers rather than generated read-only lists.

export type TrackStatus = 'Not Started' | 'WIP' | 'Completed' | 'Delayed' | 'Hold' | 'Pending' | 'For information';
export const TRACK_STATUSES: TrackStatus[] = ['Not Started', 'WIP', 'Completed', 'Delayed', 'Hold', 'Pending', 'For information'];

export type Criticality = 'Very Critical' | 'High' | 'Medium' | 'Low';
export const CRITICALITIES: Criticality[] = ['Very Critical', 'High', 'Medium', 'Low'];

/**
 * Design tracker — two target dates and nothing else.
 *
 * Every other date the sheet used to carry (a prep start, two "revised" columns) was noise:
 * what the team actually manages is when a drawing is ready to issue and when the client has
 * to have approved it. Slippage is tracked by status against those two targets.
 */
export interface DesignRow {
  id: string;
  category: 'GFC' | 'MEP' | 'SAMPLING';
  subCategory: string;
  drawingName: string;
  criticality: Criticality;
  revision: string;
  /** zone this row applies to; finishes vary by location, so sampling is per zone */
  zone: string | null;
  /** target date the drawing is ready to issue */
  readyBy: string | null;
  statusInt: TrackStatus;
  /** target date the client must have approved it by */
  approvalBy: string | null;
  statusClient: TrackStatus;
  /** what this drawing releases downstream — the link to procurement & execution */
  releases: string[];
  /** provenance for the computed dates */
  basis: string;
  /**
   * Deadline validation. A tracker with dates nobody checked is worse than no tracker: these
   * are the ways the two targets can be wrong relative to each other or to the programme.
   */
  issues: string[];
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
  /**
   * The milestone this sub-milestone sits under — "Civil Work", "Electrical", "HVAC",
   * "Key Order Closures". The tracking sheet groups sub-milestones under these, so a whole
   * discipline can be read at a glance rather than as a flat list of clauses.
   */
  group: string;
  /** the sub-milestone text, e.g. "Block wall" */
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
  /** the same figure with GST applied */
  amountIncTax: number | null;
  /** amount payable after retention is withheld; equals amountIncTax when no retention applies */
  postRetention: number | null;
  dueDate: string;
  revisedDate: string | null;
  /** the clauses that must be satisfied to raise this bill */
  checkpoints: RaCheckpoint[];
  /** 0..100, from checkpoint completion */
  readiness: number;
  status: TrackStatus;
  invoiceNo: string;
  invoiceDate: string | null;
  /** what was actually invoiced, excluding tax — tracked, not computed */
  invoiceRaised: number | null;
  /** what actually landed */
  amountReceived: number | null;
  paymentDate: string | null;
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
  /** BOQ package code this row buys — the join the material register uses to link back here */
  packageCode: string;
  category: string;
  subCategory: string;
  criticality: Criticality;
  /** long-lead packages are the ones that sink a programme if ordered late */
  longLead: boolean;
  /** lead time in days used to compute the order-by date */
  leadDays: number;
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

// ------------------------------------------------------------ site materials

/**
 * How a material reaches site. The distinction matters because it decides who is chased when
 * it is late: our own procurement desk, the work contractor, or the client.
 */
export type MaterialSupply = 'procured' | 'vendor' | 'client';
export const MATERIAL_SUPPLIES: MaterialSupply[] = ['procured', 'vendor', 'client'];
export const SUPPLY_LABEL: Record<MaterialSupply, string> = {
  procured: 'Procured by us',
  vendor: 'Vendor supplied',
  client: 'Client free issue',
};

/** Where the consignment has got to. Distinct from the package-level procurement status. */
export type MaterialStatus = 'Not Ordered' | 'Ordered' | 'In Transit' | 'Partially Delivered' | 'Delivered' | 'Returned';
export const MATERIAL_STATUSES: MaterialStatus[] = ['Not Ordered', 'Ordered', 'In Transit', 'Partially Delivered', 'Delivered', 'Returned'];

/** What site said about it when it was unloaded. */
export type MaterialInspection = 'Pending' | 'Accepted' | 'Accepted with deviation' | 'Rejected';
export const MATERIAL_INSPECTIONS: MaterialInspection[] = ['Pending', 'Accepted', 'Accepted with deviation', 'Rejected'];

/**
 * Site material register — what physically has to land at site, when, and from whom.
 *
 * The procurement tracker works one level up, at BOQ-package level: "Electrical, order by
 * 12-Jun". Site does not receive a package; it receives gypsum boards, ply, wire drums, GI
 * ducting and workstations, each with its own lead time, its own vendor and its own delivery
 * note. This is that register.
 *
 * Every row states how it arrives: bought on our own PO (and therefore linked to the
 * procurement row that raises it, inheriting its vendor), supplied by the work contractor
 * against their own PO/WO, or free-issued by the client. Quantities and GRN dates are entered
 * by site — the engine has no way to know what was unloaded, so it computes only the dates.
 */
export interface MaterialRow {
  id: string;
  /** BOQ package this material is bought under; '' for client free-issue items outside the BOQ */
  packageCode: string;
  /** the procurement row that raises the PO for it, when we buy it ourselves */
  procurementId: string | null;
  /** package name, used as the grouping heading */
  category: string;
  /** the material itself, e.g. "Gypsum board 12.5mm" */
  item: string;
  /** make from the approved make list / norms; blank when not fixed yet */
  make: string;
  unit: string;
  supply: MaterialSupply;
  /** vendor for a contractor- or client-supplied material; ours comes from the procurement row */
  vendor: string;
  /** PO / WO reference — ours when procured, theirs when supplied */
  poNumber: string;
  /** entered by site; the engine does not derive quantities from a value-only BOQ */
  orderedQty: number | null;
  deliveredQty: number | null;
  /** lead time used to back-schedule the order-by date */
  leadDays: number;
  /** latest date the order can be placed for it to land on time */
  orderBy: string | null;
  /** date it must be on site — two days before the activity that consumes it starts */
  requiredOnSite: string | null;
  expectedDelivery: string | null;
  actualDelivery: string | null;
  status: MaterialStatus;
  inspection: MaterialInspection;
  /** where it is stacked once it lands */
  storage: string;
  /** the site activity that consumes it */
  consumedBy: string | null;
  /** the drawing or sample approval that must land before it can be ordered */
  gatedBy: string | null;
  responsibility: string;
  remarks: string;
  /** provenance for the computed dates */
  basis: string;
  /** ways this row's dates cannot work as scheduled */
  issues: string[];
}

export interface MaterialSummary {
  items: number;
  delivered: number;
  inTransit: number;
  /** anything not fully delivered */
  awaiting: number;
  /** required date has passed and it is not on site — the register's whole point */
  shortOnSite: number;
  /** order-by has passed and nothing has been ordered */
  orderOverdue: number;
  clientSupplied: number;
  /** earliest not-yet-delivered material, by required date */
  nextRequired: MaterialRow | null;
}

const DELIVERED: MaterialStatus[] = ['Delivered'];

export function summariseMaterials(rows: MaterialRow[], today: string): MaterialSummary {
  const outstanding = rows.filter((r) => !DELIVERED.includes(r.status));
  return {
    items: rows.length,
    delivered: rows.filter((r) => DELIVERED.includes(r.status)).length,
    inTransit: rows.filter((r) => r.status === 'In Transit').length,
    awaiting: outstanding.length,
    shortOnSite: outstanding.filter((r) => r.requiredOnSite && r.requiredOnSite < today).length,
    orderOverdue: rows.filter((r) => r.status === 'Not Ordered' && r.orderBy && r.orderBy < today).length,
    clientSupplied: rows.filter((r) => r.supply === 'client').length,
    nextRequired:
      outstanding
        .filter((r) => r.requiredOnSite)
        .sort((a, b) => (a.requiredOnSite! < b.requiredOnSite! ? -1 : 1))[0] ?? null,
  };
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
  /**
   * What kind of work this is, so the list can be filtered by the team that owns it.
   * 'general' is the standard mobilisation checklist — the items that are not derivable from
   * the schedule and belong to nobody in particular.
   */
  category: 'general' | 'design' | 'procurement' | 'operations' | 'commercial';
  /**
   * 'standard'  — the mobilisation checklist every project runs
   * 'derived'   — generated from the schedule, and therefore also visible in its own tracker
   * 'custom'    — added by the user in-app
   * The list defaults to standard + custom; derived rows duplicate the PERT, Design and
   * Procurement tabs, which is what made it unreadable.
   */
  source: 'standard' | 'derived' | 'custom';
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
