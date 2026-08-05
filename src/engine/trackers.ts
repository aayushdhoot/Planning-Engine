// Generate the four trackers from the schedule. Dates are back-scheduled from the
// site activities they gate, so design -> procurement -> execution stay linked.
import type { BoqPackage, ProjectInputs, ScheduledActivity } from '../domain/types';
import type { Criticality, DependencyRow, DesignRow, ProcurementRow, RaCheckpoint, RaMilestoneRow, TodoRow } from '../domain/trackers';
import { addCalendarDays } from './calendar';
import norms from '../norms/norms-v1.json';

/** GFC / MEP / SAMPLING catalogue: what each deliverable gates, and its lead time. */
interface DesignSpec {
  category: 'GFC' | 'MEP' | 'SAMPLING';
  subCategory: string;
  name: string;
  criticality: Criticality;
  /** trades whose first activity this drawing must precede */
  gates: string[];
  /**
   * The deliverables this one is drawn FROM, by name.
   *
   * Site dates alone do not order a design programme. A partition layout is set out from the
   * approved furniture layout, and a lighting layout is drawn on the RCP — so each of those has
   * to be approved before this one can be issued, whatever the site sequence happens to be.
   * Without this the tracker produced impossible orders: a partition layout ready a month
   * before the furniture layout it is dimensioned from.
   */
  dependsOn?: string[];
  /** working days the internal team needs before issue */
  prepDays: number;
  /** days the client/consultant needs to approve after issue */
  approvalDays: number;
  /** finishes vary by location, so these are raised once per zone rather than once per project */
  perZone?: boolean;
}

/** Exported so `tests/trackers.test.ts` can assert the precedence graph is well-formed. */
export const DESIGN_CATALOGUE: DesignSpec[] = [
  // GFC — architectural
  { category: 'GFC', subCategory: 'GFC', name: 'Base Build Layout', criticality: 'Very Critical', gates: ['civil'], prepDays: 10, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Furniture Layout', criticality: 'Very Critical', dependsOn: ['Base Build Layout'], gates: ['modular'], prepDays: 14, approvalDays: 7 },
  { category: 'GFC', subCategory: 'GFC', name: 'Furniture Dimensions Layout', criticality: 'High', dependsOn: ['Furniture Layout'], gates: ['modular'], prepDays: 12, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Partition Layout', criticality: 'Very Critical', dependsOn: ['Furniture Layout'], gates: ['partition'], prepDays: 12, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Flooring Layout', criticality: 'High', dependsOn: ['Partition Layout'], gates: ['flooring'], prepDays: 12, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Floor Marking Layout', criticality: 'Medium', dependsOn: ['Flooring Layout'], gates: ['flooring'], prepDays: 10, approvalDays: 4 },
  { category: 'GFC', subCategory: 'GFC', name: 'Raised Flooring Layout', criticality: 'High', dependsOn: ['Partition Layout'], gates: ['flooring'], prepDays: 12, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Door Schedule Layout', criticality: 'High', dependsOn: ['Partition Layout'], gates: ['carpentry'], prepDays: 12, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Wall Finishes Layout', criticality: 'High', dependsOn: ['Partition Layout', '3D Views — Detailed & Client Approval'], gates: ['painting'], prepDays: 12, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Modular Layout', criticality: 'Very Critical', dependsOn: ['Furniture Dimensions Layout'], gates: ['modular'], prepDays: 14, approvalDays: 7 },
  { category: 'GFC', subCategory: 'GFC', name: 'RCP Layout', criticality: 'Very Critical', dependsOn: ['Partition Layout'], gates: ['ceiling'], prepDays: 14, approvalDays: 7 },
  { category: 'GFC', subCategory: 'GFC', name: 'Lighting Layout (with dimensions)', criticality: 'Very Critical', dependsOn: ['RCP Layout'], gates: ['electrical'], prepDays: 14, approvalDays: 7 },
  { category: 'GFC', subCategory: 'GENERAL', name: 'Wallpaper & Graphics', criticality: 'Low', dependsOn: ['Wall Finishes Layout'], gates: ['finishing'], prepDays: 10, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GENERAL', name: 'Fire Evacuation Plan', criticality: 'Medium', dependsOn: ['Partition Layout'], gates: ['finishing'], prepDays: 8, approvalDays: 5 },
  { category: 'GFC', subCategory: '3D', name: '3D Views — Detailed & Client Approval', criticality: 'Very Critical', dependsOn: ['Partition Layout'], gates: ['partition'], prepDays: 20, approvalDays: 10 },
  // MEP
  { category: 'MEP', subCategory: 'MEP', name: 'Electrical DBR', criticality: 'Very Critical', dependsOn: ['Base Build Layout'], gates: ['electrical'], prepDays: 14, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'Electrical SLD Layout', criticality: 'Very Critical', dependsOn: ['Electrical Load Calculation'], gates: ['electrical'], prepDays: 14, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'Electrical Load Calculation', criticality: 'Very Critical', dependsOn: ['Electrical DBR', 'Power, Data & Switch Board Layout'], gates: ['electrical'], prepDays: 14, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'Power, Data & Switch Board Layout', criticality: 'Very Critical', dependsOn: ['Furniture Dimensions Layout', 'Partition Layout'], gates: ['electrical'], prepDays: 14, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'Raceway Layout', criticality: 'Very Critical', dependsOn: ['Power, Data & Switch Board Layout'], gates: ['electrical'], prepDays: 12, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'Cable Tray Layout', criticality: 'High', dependsOn: ['Electrical SLD Layout', 'RCP Layout'], gates: ['electrical'], prepDays: 12, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'Lighting Looping Layout', criticality: 'High', dependsOn: ['Lighting Layout (with dimensions)'], gates: ['electrical'], prepDays: 12, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'Panel & DB Position Layout', criticality: 'High', dependsOn: ['Electrical SLD Layout'], gates: ['electrical'], prepDays: 12, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'UPS Calculation & Specification', criticality: 'High', dependsOn: ['Electrical Load Calculation'], gates: ['electrical'], prepDays: 14, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'HVAC DBR', criticality: 'Very Critical', dependsOn: ['Base Build Layout'], gates: ['hvac'], prepDays: 14, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'HVAC Heat Load', criticality: 'Very Critical', dependsOn: ['HVAC DBR', 'Partition Layout'], gates: ['hvac'], prepDays: 14, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'HVAC Layout', criticality: 'Very Critical', dependsOn: ['HVAC Heat Load', 'RCP Layout'], gates: ['hvac'], prepDays: 14, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'PHE DBR & Plumbing Layout', criticality: 'High', dependsOn: ['Partition Layout'], gates: ['plumbing'], prepDays: 12, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'Fire Sprinkler Layout', criticality: 'Very Critical', dependsOn: ['RCP Layout'], gates: ['sprinkler'], prepDays: 14, approvalDays: 10 },
  { category: 'MEP', subCategory: 'MEP', name: 'FA / PA System Layout', criticality: 'High', dependsOn: ['RCP Layout'], gates: ['lv'], prepDays: 12, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'ACS / CCTV / WiFi Layout', criticality: 'High', dependsOn: ['Partition Layout', 'RCP Layout'], gates: ['lv'], prepDays: 12, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'LV DBR', criticality: 'High', dependsOn: ['Base Build Layout'], gates: ['lv'], prepDays: 12, approvalDays: 5 },
  // SAMPLING
  { category: 'SAMPLING', subCategory: 'Finishes', name: 'Floor and Dado Tiles', perZone: true, criticality: 'High', dependsOn: ['Flooring Layout'], gates: ['flooring'], prepDays: 10, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'Finishes', name: 'Carpentry Laminates & Veneer Shades', perZone: true, criticality: 'High', dependsOn: ['3D Views — Detailed & Client Approval'], gates: ['carpentry'], prepDays: 10, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'Finishes', name: 'Paint Shades', perZone: true, criticality: 'Medium', dependsOn: ['Wall Finishes Layout'], gates: ['painting'], prepDays: 8, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'Finishes', name: 'Carpet / SPC Flooring', perZone: true, criticality: 'High', dependsOn: ['Flooring Layout'], gates: ['flooring'], prepDays: 10, approvalDays: 7 },
  { category: 'SAMPLING', subCategory: 'Partitions', name: 'Demountable Glass Partition', criticality: 'Very Critical', dependsOn: ['Partition Layout'], gates: ['glass'], prepDays: 12, approvalDays: 7 },
  { category: 'SAMPLING', subCategory: 'Partitions', name: 'Backpainted Glass', criticality: 'Medium', dependsOn: ['Wall Finishes Layout'], gates: ['glass'], prepDays: 10, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'Ceiling', name: 'Grid & Stretch Ceiling', perZone: true, criticality: 'High', dependsOn: ['RCP Layout'], gates: ['ceiling'], prepDays: 10, approvalDays: 7 },
  { category: 'SAMPLING', subCategory: 'Ceiling', name: 'Acoustics / Fluted Panel', perZone: true, criticality: 'Medium', dependsOn: ['RCP Layout'], gates: ['ceiling'], prepDays: 10, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'MEP', name: 'Switch Sockets', criticality: 'Medium', dependsOn: ['Power, Data & Switch Board Layout'], gates: ['electrical'], prepDays: 8, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'MEP', name: 'Decorative Lights', criticality: 'High', dependsOn: ['Lighting Layout (with dimensions)'], gates: ['electrical'], prepDays: 10, approvalDays: 7 },
  { category: 'SAMPLING', subCategory: 'MEP', name: 'Sanitary Fixtures', criticality: 'Medium', dependsOn: ['PHE DBR & Plumbing Layout'], gates: ['plumbing'], prepDays: 10, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'Furniture', name: 'Chairs & Loose Furniture', criticality: 'High', dependsOn: ['Furniture Layout'], gates: ['modular'], prepDays: 12, approvalDays: 7 },
  { category: 'SAMPLING', subCategory: 'Finishes', name: 'Blinds', criticality: 'Medium', dependsOn: ['Base Build Layout'], gates: ['finishing'], prepDays: 10, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'Finishes', name: 'Skirting & T Profile', criticality: 'Low', dependsOn: ['Flooring Layout'], gates: ['finishing'], prepDays: 8, approvalDays: 4 },
];

/**
 * Enabling works: surveys, temporary services, marking, demolition, debris clearance.
 *
 * They are the first activity of their trade but they do not wait on a design deliverable —
 * temporary power is pulled before anybody has drawn a lighting layout. Letting them drive the
 * back-scheduling produced drawings due before the project even started, and dragged every
 * upstream drawing back with them.
 */
const ENABLING = /temporary|dilapidation|survey|demolition|debris|barricad|hoarding|mobilis|marking/i;
const isEnabling = (a: ScheduledActivity) => a.phase === 'Site Prep' || ENABLING.test(a.name);

const firstOfTrade = (acts: ScheduledActivity[], trade: string): ScheduledActivity | null => {
  const own = acts.filter((a) => a.trade === trade);
  const real = own.filter((a) => !isEnabling(a));
  // fall back to the enabling activity rather than leaving the row dateless
  return (real.length ? real : own).sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0] ?? null;
};

const statusFor = (target: string | null, today: string): 'Not Started' | 'WIP' | 'Delayed' => {
  if (!target) return 'Not Started';
  if (target < today) return 'Delayed';
  const soon = addCalendarDays(today, 21);
  return target <= soon ? 'WIP' : 'Not Started';
};

/**
 * Carpentry and joinery cannot be built from a layout — every element needs a technical
 * drawing. These are derived from the BOQ rather than listed by hand, so a project with more
 * joinery packages gets more TDs.
 */
const CARPENTRY_TRADES = new Set(['carpentry', 'modular', 'partition']);

/** Elevations are raised per zone: each area's wall treatment is drawn separately. */
const ELEVATION_APPROVAL_DAYS = 5;
const ELEVATION_PREP_DAYS = 10;

function windowFor(
  driver: ScheduledActivity | null,
  spec: { approvalDays: number; prepDays: number },
  fallback: { start: string; end: string } | null,
): { readyBy: string | null; approvalBy: string | null; basis: string } {
  if (driver) {
    const approvalBy = addCalendarDays(driver.startDate, -1);
    return {
      readyBy: addCalendarDays(approvalBy, -spec.approvalDays),
      approvalBy,
      basis: `back-scheduled from "${driver.name}" starting ${driver.startDate}, less ${spec.approvalDays}d client approval`,
    };
  }
  // No gated activity in the programme. Rather than leaving the row dateless — the complaint
  // that started this — anchor it to the project window and say so, so the date is visibly
  // weaker than a back-scheduled one instead of silently absent.
  if (fallback) {
    const approvalBy = addCalendarDays(fallback.start, spec.prepDays + spec.approvalDays);
    return {
      readyBy: addCalendarDays(approvalBy, -spec.approvalDays),
      approvalBy,
      basis: `no gated site activity in the programme — anchored to the project start ${fallback.start} plus ${spec.prepDays}d preparation`,
    };
  }
  return { readyBy: null, approvalBy: null, basis: 'no dependent site activity and no project window' };
}

/**
 * Validate the two targets. A tracker whose deadlines nobody checked is worse than no tracker,
 * so each row states what is wrong with it rather than presenting an impossible date plainly.
 */
function validateDesignRow(
  readyBy: string | null,
  approvalBy: string | null,
  driver: ScheduledActivity | null,
  projectStart: string | null,
): string[] {
  const issues: string[] = [];
  if (!readyBy || !approvalBy) {
    issues.push('No target date could be computed.');
    return issues;
  }
  if (readyBy >= approvalBy) issues.push(`Drawing readiness (${readyBy}) is not before client approval (${approvalBy}).`);
  if (driver && approvalBy >= driver.startDate)
    issues.push(`Client approval (${approvalBy}) lands on or after "${driver.name}" starts (${driver.startDate}) — the site would be waiting on the drawing.`);
  if (projectStart && readyBy < projectStart)
    issues.push(`Drawing readiness (${readyBy}) is before the project starts (${projectStart}) — this drawing is already late on day one.`);
  // A target that has simply passed is NOT a deadline defect: it is the row's status, and the
  // Status column already says "Delayed". Flagging it here put a red badge on every row once
  // the project was underway, which buried the handful of genuinely unworkable deadlines.
  return issues;
}

export function buildDesignTracker(
  acts: ScheduledActivity[],
  today: string,
  packages: BoqPackage[] = [],
  zones: string[] = (norms.projectZones as { zones: string[] }).zones,
): DesignRow[] {
  const rows: DesignRow[] = [];
  const window = acts.length
    ? {
        start: acts.reduce((m, a) => (a.startDate < m ? a.startDate : m), acts[0].startDate),
        end: acts.reduce((m, a) => (a.endDate > m ? a.endDate : m), acts[0].endDate),
      }
    : null;
  let n = 0;
  // the row(s) each catalogue entry produced, plus what is needed to re-time them once the
  // design precedence is applied — a per-zone spec makes several rows that move together
  const placed: { spec: DesignSpec; key: string; driver: ScheduledActivity | null; row: DesignRow }[] = [];

  const push = (
    spec: DesignSpec,
    drawingName: string,
    zone: string | null,
    driver: ScheduledActivity | null,
    gated: ScheduledActivity[],
    key = spec.name,
  ) => {
    const { readyBy, approvalBy, basis } = windowFor(driver, spec, window);
    const row: DesignRow = {
      id: `d${++n}`,
      category: spec.category,
      subCategory: spec.subCategory,
      drawingName,
      criticality: spec.criticality,
      revision: 'R0',
      zone,
      readyBy,
      statusInt: statusFor(readyBy, today),
      approvalBy,
      statusClient: statusFor(approvalBy, today),
      releases: gated.map((g) => g.name),
      basis,
      issues: [],
    };
    rows.push(row);
    placed.push({ spec, key, driver, row });
  };

  for (const spec of DESIGN_CATALOGUE) {
    const gated = spec.gates.map((t) => firstOfTrade(acts, t)).filter((x): x is ScheduledActivity => x !== null);
    const driver = gated.sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0] ?? null;
    if (spec.perZone && zones.length) for (const z of zones) push(spec, `${spec.name} — ${z}`, z, driver, gated);
    else push(spec, spec.name, null, driver, gated);
  }

  // ---- Technical drawings, one per carpentry/joinery cost head (from the BOQ, not a list)
  const carpentry = packages.filter((pk) => CARPENTRY_TRADES.has(pk.trade));
  for (const pk of carpentry) {
    const driver = firstOfTrade(acts, pk.trade);
    push(
      {
        category: 'GFC', subCategory: 'TD', name: '', criticality: 'Very Critical', gates: [pk.trade],
        // a technical drawing details what the layout already fixed, so the layout has to be
        // approved before the TD can be issued
        dependsOn: [TD_PARENT[pk.trade] ?? 'Partition Layout'],
        prepDays: 12, approvalDays: 5,
      },
      `TD — ${pk.name}`,
      null,
      driver,
      driver ? [driver] : [],
      `TD:${pk.code}`,
    );
  }

  // ---- Elevations, one per zone
  for (const z of zones) {
    const driver = firstOfTrade(acts, 'partition') ?? firstOfTrade(acts, 'carpentry');
    push(
      {
        category: 'GFC', subCategory: 'Elevations', name: '', criticality: 'High', gates: ['partition'],
        dependsOn: ['Partition Layout'],
        prepDays: ELEVATION_PREP_DAYS, approvalDays: ELEVATION_APPROVAL_DAYS,
      },
      `Elevation — ${z}`,
      z,
      driver,
      driver ? [driver] : [],
      'Elevations',
    );
  }

  applyDesignPrecedence(placed);

  for (const { row, driver } of placed)
    row.issues = validateDesignRow(row.readyBy, row.approvalBy, driver, window?.start ?? null);

  return rows;
}

/** The GFC layout a technical drawing details, by the trade of its cost head. */
const TD_PARENT: Record<string, string> = {
  partition: 'Partition Layout',
  modular: 'Modular Layout',
  carpentry: 'Furniture Layout',
};

/**
 * Re-time the design programme so no drawing is approved after something drawn from it is issued.
 *
 * Back-scheduling each deliverable from the site activity it releases gets every drawing in
 * front of the work that needs it, but says nothing about the order the drawings themselves
 * have to come in — which produced a partition layout ready a month before the furniture layout
 * it is set out from, and a lighting layout issued before the RCP it is drawn on.
 *
 * The site dates are the hard constraint: they come from the programme. So the repair pulls the
 * UPSTREAM drawing earlier rather than pushing the dependent later — the answer to "the
 * furniture layout is needed by 10-Aug, not 16-Sept" is to draw it sooner, not to let site wait.
 * Walking the graph dependents-first means one pass settles the whole chain. Where the result
 * lands before the project starts, `validateDesignRow` flags it: that is a real finding about
 * a front-end that does not fit, not something to hide by relaxing the sequence.
 */
function applyDesignPrecedence(placed: { spec: DesignSpec; key: string; row: DesignRow }[]): void {
  const byKey = new Map<string, typeof placed>();
  for (const p of placed) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]);

  // upstream key -> the rows drawn from it
  const dependents = new Map<string, DesignRow[]>();
  for (const p of placed)
    for (const up of p.spec.dependsOn ?? [])
      if (byKey.has(up)) dependents.set(up, [...(dependents.get(up) ?? []), p.row]);

  for (const key of reverseTopological(byKey, placed)) {
    const drawnFromIt = dependents.get(key);
    if (!drawnFromIt?.length) continue;
    const needed = drawnFromIt.reduce<string | null>((m, r) => (r.readyBy && (m === null || r.readyBy < m) ? r.readyBy : m), null);
    if (!needed) continue;
    for (const { spec, row } of byKey.get(key)!) {
      if (!row.approvalBy || row.approvalBy <= needed) continue;
      const was = row.approvalBy;
      row.approvalBy = needed;
      row.readyBy = addCalendarDays(needed, -spec.approvalDays);
      row.basis += `; pulled forward from ${was} because ${drawnFromIt.length === 1 ? `"${drawnFromIt[0].drawingName}" is` : `${drawnFromIt.length} drawings are`} drawn from it and issued by ${needed}`;
    }
  }
}

/**
 * Deliverable keys, dependents before the things they are drawn from. Kahn's algorithm over the
 * reversed graph; the catalogue is authored data, so a cycle would be an authoring error —
 * anything left over when no node has zero in-degree is appended rather than dropped, and
 * `tests/trackers.test.ts` asserts the graph is acyclic.
 */
function reverseTopological(
  byKey: Map<string, { spec: DesignSpec; key: string }[]>,
  placed: { spec: DesignSpec; key: string }[],
): string[] {
  const upstreamsOf = new Map<string, Set<string>>();
  for (const p of placed) {
    const ups = upstreamsOf.get(p.key) ?? new Set<string>();
    for (const u of p.spec.dependsOn ?? []) if (byKey.has(u) && u !== p.key) ups.add(u);
    upstreamsOf.set(p.key, ups);
  }
  // process a key once nothing that depends on it is still waiting
  const pending = new Map([...upstreamsOf.keys()].map((k) => [k, [...upstreamsOf].filter(([, u]) => u.has(k)).length]));
  const order: string[] = [];
  const ready = [...pending].filter(([, c]) => c === 0).map(([k]) => k);
  while (ready.length) {
    const k = ready.shift()!;
    order.push(k);
    for (const up of upstreamsOf.get(k) ?? []) {
      const left = (pending.get(up) ?? 0) - 1;
      pending.set(up, left);
      if (left === 0) ready.push(up);
    }
  }
  for (const k of upstreamsOf.keys()) if (!order.includes(k)) order.push(k);
  return order;
}

/** Procurement rows: order-by and delivery-required only, gated by the design release. */
export function buildProcurementTracker(
  p: ProjectInputs,
  acts: ScheduledActivity[],
  design: DesignRow[],
  today: string,
  overrides: Record<string, number> = {},
): ProcurementRow[] {
  const pkgLead = norms.packageLeadTimes as Record<string, { days: number; longLead: boolean; label: string }>;
  const criticalityFor = (leadDays: number, longLead: boolean): Criticality =>
    longLead && leadDays >= 45 ? 'Very Critical' : longLead ? 'High' : leadDays >= 21 ? 'Medium' : 'Low';

  return p.boqPackages.map((pkg, i) => {
    const base = pkgLead[pkg.code] ?? { days: 21, longLead: false, label: 'default' };
    const leadDays = pkg.code in overrides ? overrides[pkg.code] : base.days;
    const pkgActs = acts.filter((a) => a.packageCode === pkg.code);
    const feeds = pkgActs.sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0] ?? null;
    const deliveryRequired = feeds ? addCalendarDays(feeds.startDate, -2) : null;
    const orderBy = deliveryRequired ? addCalendarDays(deliveryRequired, -leadDays) : null;
    // the design deliverable that must be approved before this package can be ordered
    const gate = design
      .filter((d) => d.releases.some((r) => feeds && r === feeds.name))
      .sort((a, b) => ((a.approvalBy ?? '') < (b.approvalBy ?? '') ? -1 : 1))[0];

    return {
      id: `p${i + 1}`,
      packageCode: pkg.code,
      category: pkg.name,
      subCategory: base.label,
      criticality: criticalityFor(leadDays, base.longLead),
      longLead: base.longLead,
      leadDays,
      orderBy,
      deliveryRequired,
      revisedDate: null,
      vendor: '',
      orderStatus: orderBy && orderBy < today ? 'Open' : 'Open',
      deliveryStatus: 'Not Started',
      responsibility: 'Procurement',
      remarks: orderBy && orderBy < today ? 'Order-by date has passed — release the PO or re-plan the dependent activity.' : '',
      gatedBy: gate ? `${gate.drawingName} (client approval ${gate.approvalBy})` : null,
      feeds: feeds ? `${feeds.name} (${feeds.startDate})` : null,
      basis: feeds
        ? `delivery 2d before "${feeds.name}" starts ${feeds.startDate}; order-by = delivery − ${leadDays}d lead (${pkg.code in overrides ? 'in-app override' : `${norms.version}:packageLeadTimes.${pkg.code}`})`
        : 'no mapped site activity',
    };
  });
}

export function buildTodoTracker(
  acts: ScheduledActivity[],
  proc: ProcurementRow[],
  design: DesignRow[],
  today: string,
  projectStart: string | null = null,
): TodoRow[] {
  const rows: TodoRow[] = [];
  const horizon = addCalendarDays(today, 21);
  let n = 0;
  const push = (r: Omit<TodoRow, 'id'>) => rows.push({ ...r, id: `t${++n}` });

  // ---- Standard mobilisation checklist.
  // These are the same on every project and are not derivable from the schedule — site
  // marking, resource allocation, tool creation, Wispr onboarding, client group, welcome
  // email. They belong in the targets like anything else, so they are seeded from norms
  // rather than left to memory. Unlike the derived rows they are NOT horizon-filtered: a
  // mobilisation task nobody did stays on the list until it is closed.
  const std = norms.standardMobilisationTodos as {
    items: { description: string; responsibility: string; priority: string; dayOffset: number }[];
  };
  if (projectStart)
    for (const item of std.items) {
      const due = addCalendarDays(projectStart, item.dayOffset);
      push({
        description: item.description,
        responsibility: item.responsibility,
        priority: item.priority as TodoRow['priority'],
        status: due < today ? 'Delayed' : 'Not Started',
        startDate: null,
        endDate: due,
        revisedDate: null,
        notes: `Standard project mobilisation task (${norms.version}) — day ${item.dayOffset >= 0 ? '+' : ''}${item.dayOffset} from site start.`,
        category: 'general',
        source: 'standard',
      });
    }

  for (const a of acts)
    if (a.startDate <= horizon && a.endDate >= today)
      push({
        description: `${a.startDate < today ? 'In progress' : 'Start'}: ${a.name}`,
        responsibility: `${a.trade} lead`,
        priority: a.critical ? 'HIGH' : 'MEDIUM',
        status: a.startDate < today ? 'WIP' : 'Not Started',
        startDate: a.startDate,
        endDate: a.endDate,
        revisedDate: null,
        notes: a.critical ? 'On the critical path — any slip moves the finish date.' : `Float ${a.totalFloat}d.`,
        category: 'operations',
        source: 'derived',
      });

  for (const pr of proc)
    if (pr.orderBy && pr.orderBy <= horizon)
      push({
        description: `Release PO: ${pr.category}`,
        responsibility: pr.responsibility,
        priority: pr.criticality === 'Very Critical' ? 'HIGH' : pr.criticality === 'High' ? 'HIGH' : 'MEDIUM',
        status: pr.orderBy < today ? 'Delayed' : 'Not Started',
        startDate: null,
        endDate: pr.orderBy,
        revisedDate: null,
        notes: pr.gatedBy ? `Gated by ${pr.gatedBy}` : 'No design gate recorded.',
        category: 'procurement',
        source: 'derived',
      });

  for (const d of design)
    if (d.readyBy && d.readyBy <= horizon)
      push({
        description: `Issue for approval: ${d.drawingName}`,
        responsibility: d.category === 'MEP' ? 'MEP design lead' : 'Design lead',
        priority: d.criticality === 'Very Critical' ? 'HIGH' : d.criticality === 'High' ? 'HIGH' : 'MEDIUM',
        status: d.statusInt,
        startDate: null,
        endDate: d.readyBy,
        revisedDate: null,
        notes: [d.releases.length ? `Releases: ${d.releases.slice(0, 2).join(', ')}` : '', d.issues[0] ?? ''].filter(Boolean).join(' · '),
        category: 'design',
        source: 'derived',
      });

  return rows.sort((a, b) => ((a.endDate ?? '') < (b.endDate ?? '') ? -1 : 1));
}

/** Standard client/builder dependency register, dated against the programme. */
export function buildDependencyTracker(acts: ScheduledActivity[], today: string, projectStart: string): DependencyRow[] {
  const first = (trade: string) => firstOfTrade(acts, trade);
  const firstOfPhase = (phase: string) =>
    acts.filter((a) => a.phase === phase).sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0] ?? null;

  const spec: [DependencyRow['area'], string, string, number, ScheduledActivity | null][] = [
    ['Kick Off', 'Site kick-off meeting and pooja', 'Client/FS', 0, null],
    ['Commercial', 'Project PO / signed agreement', 'Client', 0, null],
    ['Commercial', 'Project advance payment', 'Client', 7, null],
    ['Design', 'Layout approval', 'Client', 10, firstOfPhase('Site Prep') ?? first('civil')],
    ['Design', '3D approvals', 'Client', 10, first('partition')],
    ['Design', 'Material sampling approval', 'Client/FS', 10, first('flooring')],
    ['Design', 'MEP drawings approval', 'Client/PMC', 14, first('electrical')],
    ['Design', 'Electrical / IT requirement and load confirmation', 'Client', 14, first('electrical')],
    ['Operation', 'Builder permissions and mobilisation clearance', 'FS/Builder', 7, firstOfPhase('Site Prep') ?? first('civil')],
    ['Operation', 'Mathadi clearance', 'FS', 7, firstOfPhase('Site Prep') ?? first('civil')],
    ['Operation', 'Fire NOC / CFO approval', 'FS/Builder', 14, first('sprinkler')],
    ['Operation', 'BMC / statutory approval', 'FS/Builder', 14, first('civil')],
    ['Operation', 'Temporary power and water availability', 'Builder', 5, first('electrical')],
    ['Operation', 'Lift availability for material movement', 'Builder', 3, firstOfPhase('Civil Work') ?? first('civil')],
    ['Operation', 'Work hours clarity in building', 'Builder', 3, firstOfPhase('Site Prep') ?? first('civil')],
    ['Operation', 'Heat load approval / CFM availability', 'Builder', 14, first('hvac')],
    ['Operation', 'Wi-Fi and access point locations', 'Client', 10, first('lv')],
    ['Operation', 'Modular vendor closure for site marking', 'Client', 14, first('modular')],
    ['Design/Operation', 'Client-supplied items (IT / AV) delivery', 'Client', 10, first('lv')],
    ['Operation', 'Store space and debris removal area', 'Builder', 3, firstOfPhase('Site Prep') ?? first('civil')],
  ];

  return spec.map(([area, description, responsibility, lead, driver], i) => {
    const planDate = driver ? addCalendarDays(driver.startDate, -lead) : addCalendarDays(projectStart, lead);
    return {
      id: `x${i + 1}`,
      sr: i + 1,
      area,
      description,
      responsibility,
      planDate,
      actualDate: null,
      status: planDate < today ? 'Delayed' : 'Pending',
      remarks: driver ? `Blocks "${driver.name}" starting ${driver.startDate}.` : 'Project set-up item.',
      blocks: driver ? driver.name : null,
    };
  });
}

// ------------------------------------------------------------ RA milestones

/**
 * A milestone clause names physical work, not a date. The contract writes them as prose:
 *
 *   "Execution: Demolition, partition line marking, frameworks, single-side skinning…
 *    Material delivery: gypsum frames, gypsum sheets… Key order closures: HVAC, carpentry."
 *
 * Each clause becomes a checkpoint so the project team can tick off billing readiness, rather
 * than the engine asserting a milestone is met because its date arrived.
 */
const RA_SECTIONS: [RegExp, RaCheckpoint['kind']][] = [
  [/key order closures?|order closures?|orders? closed?/i, 'order'],
  [/material deliver(y|ies)|material/i, 'material'],
  [/execution|works?/i, 'execution'],
];

/** Split milestone prose into (kind, clause) pairs. */
export function parseMilestoneClauses(description: string): { kind: RaCheckpoint['kind']; text: string }[] {
  const out: { kind: RaCheckpoint['kind']; text: string }[] = [];
  // labelled form: "Execution: a, b. Material delivery: c."
  const labelled = [...description.matchAll(/([A-Za-z][A-Za-z ]{2,30}?)\s*:\s*([^:]*?)(?=(?:[.;]\s*[A-Za-z][A-Za-z ]{2,30}?\s*:)|$)/g)];
  const chunks: { kind: RaCheckpoint['kind']; body: string }[] = [];
  if (labelled.length) {
    for (const m of labelled) {
      const label = m[1].trim();
      const kind = RA_SECTIONS.find(([re]) => re.test(label))?.[1] ?? 'execution';
      chunks.push({ kind, body: m[2] });
    }
  } else {
    // unlabelled form: "Partition marking, frameworks … + gypsum/electrical material delivery"
    for (const part of description.split(/\s+\+\s+/)) {
      const kind: RaCheckpoint['kind'] = /material|delivery/i.test(part) ? 'material' : /order/i.test(part) ? 'order' : 'execution';
      chunks.push({ kind, body: part });
    }
  }
  for (const { kind, body } of chunks)
    for (const raw of body.split(/[,;]|\s+and\s+/)) {
      const text = raw.replace(/[.\s]+$/, '').replace(/^\s+/, '').trim();
      if (text.length > 2) out.push({ kind, text });
    }
  return out;
}

/**
 * The milestone headings the tracking sheet groups sub-milestones under. A clause is filed by
 * discipline so "Block wall" and "Anti-termite treatment" sit under Civil Work rather than in
 * one flat list of twenty clauses.
 */
const RA_GROUPS: [RegExp, string][] = [
  [/authority|bmc|fire noc|approval/i, 'Authority Approval'],
  [/block ?wall|anti.?termite|waterproof|plumb|gypsum|ply |civil|plaster|screed|marking|masonry|tiling|marble|cubicle|sanitaryware|false ceiling|paint|flooring|partition|skinning|demolition/i, 'Civil Work'],
  [/electric|conduit|raceway|wiring|ht\/lt|switch|light|db\b|mcb|panel/i, 'Electrical'],
  [/hvac|duct|grill|damper|exhaust|return air|machine deliver|piping/i, 'HVAC'],
  [/sprinkler|fire alarm|fas\b|safety|acs|pa\b|fa\b|security|detector/i, 'Sprinkler & Safety System'],
  [/network|data|passive|it\b/i, 'Networking'],
  [/furniture|chair|carpentry|joinery|mill ?work/i, 'Furniture & Joinery'],
  [/design closure|design/i, 'Design Closure'],
  [/clean|snag|touch ?up|handover|commission/i, 'Completion & Handover'],
];

function groupFor(kind: RaCheckpoint['kind'], text: string): string {
  if (kind === 'order') return 'Key Order Closures';
  for (const [re, label] of RA_GROUPS) if (re.test(text)) return label;
  return kind === 'material' ? 'Material Delivery' : 'Execution';
}

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'all', 'material', 'delivery', 'works', 'work', 'key', 'closures']);
const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

/** Best-matching site activity for a clause, by word overlap. Null when nothing matches. */
function activityForClause(text: string, acts: ScheduledActivity[]): ScheduledActivity | null {
  const want = tokens(text);
  if (!want.length) return null;
  let best: { a: ScheduledActivity; score: number } | null = null;
  for (const a of acts) {
    const have = new Set(tokens(a.name));
    const score = want.filter((w) => have.has(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { a, score };
  }
  return best ? best.a : null;
}

export function buildRaTracker(
  p: ProjectInputs,
  acts: ScheduledActivity[],
  projectStart: string,
  today: string,
  /** % withheld as retention; defaults to the norm (0), so nothing is invented for a contract without one */
  retention?: number,
): RaMilestoneRow[] {
  const terms = norms.commercialTerms as { gstPercent: number; defaultRetentionPercent: number };
  const gstPercent = terms.gstPercent;
  const retentionPercent = retention ?? terms.defaultRetentionPercent;

  return p.milestones.map((m, i) => {
    const dueDate = addCalendarDays(projectStart, m.dayOffset);
    const amount = p.contractValue ? Math.round((m.percent / 100) * p.contractValue.value) : null;
    const checkpoints: RaCheckpoint[] = parseMilestoneClauses(m.description).map((c, j) => {
      const a = c.kind === 'execution' ? activityForClause(c.text, acts) : null;
      return {
        id: `${m.code}-c${j + 1}`,
        group: groupFor(c.kind, c.text),
        description: c.text.charAt(0).toUpperCase() + c.text.slice(1),
        kind: c.kind,
        activityId: a?.id ?? null,
        activityName: a?.name ?? null,
        // an execution clause is due when its activity finishes; a material or order clause is
        // due by the milestone itself, since nothing on the programme evidences it
        plannedDate: a ? a.endDate : dueDate,
        actualDate: null,
        status: statusFor(a ? a.endDate : dueDate, today),
        responsibility: c.kind === 'execution' ? 'Site' : c.kind === 'material' ? 'Procurement' : 'Procurement',
        remarks: '',
      };
    });
    return {
      id: `ra-${i + 1}`,
      code: m.code,
      dayOffset: m.dayOffset,
      percent: m.percent,
      amount,
      amountIncTax: amount === null ? null : Math.round(amount * (1 + gstPercent / 100)),
      postRetention: amount === null ? null : Math.round(amount * (1 + gstPercent / 100) * (1 - retentionPercent / 100)),
      dueDate,
      revisedDate: null,
      checkpoints,
      readiness: 0, // computed from live edits in the UI; nothing is complete on a fresh plan
      status: statusFor(dueDate, today),
      invoiceNo: '',
      invoiceDate: null,
      // what was actually invoiced, received and when: tracked by the team, never computed —
      // the engine has no way to know what a client paid
      invoiceRaised: null,
      amountReceived: null,
      paymentDate: null,
      remarks: checkpoints.length ? '' : 'No checkable clauses in the contract wording for this milestone.',
    };
  });
}
