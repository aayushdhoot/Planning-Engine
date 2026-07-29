// Generate the four trackers from the schedule. Dates are back-scheduled from the
// site activities they gate, so design -> procurement -> execution stay linked.
import type { ProjectInputs, ScheduledActivity } from '../domain/types';
import type { Criticality, DependencyRow, DesignRow, ProcurementRow, TodoRow } from '../domain/trackers';
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
  /** working days the internal team needs before issue */
  prepDays: number;
  /** days the client/consultant needs to approve after issue */
  approvalDays: number;
}

const DESIGN_CATALOGUE: DesignSpec[] = [
  // GFC — architectural
  { category: 'GFC', subCategory: 'GFC', name: 'Base Build Layout', criticality: 'Very Critical', gates: ['civil'], prepDays: 10, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Furniture Layout', criticality: 'Very Critical', gates: ['modular'], prepDays: 14, approvalDays: 7 },
  { category: 'GFC', subCategory: 'GFC', name: 'Furniture Dimensions Layout', criticality: 'High', gates: ['modular'], prepDays: 12, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Partition Layout', criticality: 'Very Critical', gates: ['partition'], prepDays: 12, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Flooring Layout', criticality: 'High', gates: ['flooring'], prepDays: 12, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Floor Marking Layout', criticality: 'Medium', gates: ['flooring'], prepDays: 10, approvalDays: 4 },
  { category: 'GFC', subCategory: 'GFC', name: 'Raised Flooring Layout', criticality: 'High', gates: ['flooring'], prepDays: 12, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Door Schedule Layout', criticality: 'High', gates: ['carpentry'], prepDays: 12, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Wall Finishes Layout', criticality: 'High', gates: ['painting'], prepDays: 12, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GFC', name: 'Modular Layout', criticality: 'Very Critical', gates: ['modular'], prepDays: 14, approvalDays: 7 },
  { category: 'GFC', subCategory: 'GFC', name: 'RCP Layout', criticality: 'Very Critical', gates: ['ceiling'], prepDays: 14, approvalDays: 7 },
  { category: 'GFC', subCategory: 'GFC', name: 'Lighting Layout (with dimensions)', criticality: 'Very Critical', gates: ['electrical'], prepDays: 14, approvalDays: 7 },
  { category: 'GFC', subCategory: 'GENERAL', name: 'Wallpaper & Graphics', criticality: 'Low', gates: ['finishing'], prepDays: 10, approvalDays: 5 },
  { category: 'GFC', subCategory: 'GENERAL', name: 'Fire Evacuation Plan', criticality: 'Medium', gates: ['finishing'], prepDays: 8, approvalDays: 5 },
  { category: 'GFC', subCategory: '3D', name: '3D Views — Detailed & Client Approval', criticality: 'Very Critical', gates: ['partition'], prepDays: 20, approvalDays: 10 },
  // MEP
  { category: 'MEP', subCategory: 'MEP', name: 'Electrical DBR', criticality: 'Very Critical', gates: ['electrical'], prepDays: 14, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'Electrical SLD Layout', criticality: 'Very Critical', gates: ['electrical'], prepDays: 14, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'Electrical Load Calculation', criticality: 'Very Critical', gates: ['electrical'], prepDays: 14, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'Power, Data & Switch Board Layout', criticality: 'Very Critical', gates: ['electrical'], prepDays: 14, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'Raceway Layout', criticality: 'Very Critical', gates: ['electrical'], prepDays: 12, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'Cable Tray Layout', criticality: 'High', gates: ['electrical'], prepDays: 12, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'Lighting Looping Layout', criticality: 'High', gates: ['electrical'], prepDays: 12, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'Panel & DB Position Layout', criticality: 'High', gates: ['electrical'], prepDays: 12, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'UPS Calculation & Specification', criticality: 'High', gates: ['electrical'], prepDays: 14, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'HVAC DBR', criticality: 'Very Critical', gates: ['hvac'], prepDays: 14, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'HVAC Heat Load', criticality: 'Very Critical', gates: ['hvac'], prepDays: 14, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'HVAC Layout', criticality: 'Very Critical', gates: ['hvac'], prepDays: 14, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'PHE DBR & Plumbing Layout', criticality: 'High', gates: ['plumbing'], prepDays: 12, approvalDays: 5 },
  { category: 'MEP', subCategory: 'MEP', name: 'Fire Sprinkler Layout', criticality: 'Very Critical', gates: ['sprinkler'], prepDays: 14, approvalDays: 10 },
  { category: 'MEP', subCategory: 'MEP', name: 'FA / PA System Layout', criticality: 'High', gates: ['lv'], prepDays: 12, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'ACS / CCTV / WiFi Layout', criticality: 'High', gates: ['lv'], prepDays: 12, approvalDays: 7 },
  { category: 'MEP', subCategory: 'MEP', name: 'LV DBR', criticality: 'High', gates: ['lv'], prepDays: 12, approvalDays: 5 },
  // SAMPLING
  { category: 'SAMPLING', subCategory: 'Finishes', name: 'Floor and Dado Tiles', criticality: 'High', gates: ['flooring'], prepDays: 10, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'Finishes', name: 'Carpentry Laminates & Veneer Shades', criticality: 'High', gates: ['carpentry'], prepDays: 10, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'Finishes', name: 'Paint Shades', criticality: 'Medium', gates: ['painting'], prepDays: 8, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'Finishes', name: 'Carpet / SPC Flooring', criticality: 'High', gates: ['flooring'], prepDays: 10, approvalDays: 7 },
  { category: 'SAMPLING', subCategory: 'Partitions', name: 'Demountable Glass Partition', criticality: 'Very Critical', gates: ['glass'], prepDays: 12, approvalDays: 7 },
  { category: 'SAMPLING', subCategory: 'Partitions', name: 'Backpainted Glass', criticality: 'Medium', gates: ['glass'], prepDays: 10, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'Ceiling', name: 'Grid & Stretch Ceiling', criticality: 'High', gates: ['ceiling'], prepDays: 10, approvalDays: 7 },
  { category: 'SAMPLING', subCategory: 'Ceiling', name: 'Acoustics / Fluted Panel', criticality: 'Medium', gates: ['ceiling'], prepDays: 10, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'MEP', name: 'Switch Sockets', criticality: 'Medium', gates: ['electrical'], prepDays: 8, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'MEP', name: 'Decorative Lights', criticality: 'High', gates: ['electrical'], prepDays: 10, approvalDays: 7 },
  { category: 'SAMPLING', subCategory: 'MEP', name: 'Sanitary Fixtures', criticality: 'Medium', gates: ['plumbing'], prepDays: 10, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'Furniture', name: 'Chairs & Loose Furniture', criticality: 'High', gates: ['modular'], prepDays: 12, approvalDays: 7 },
  { category: 'SAMPLING', subCategory: 'Finishes', name: 'Blinds', criticality: 'Medium', gates: ['finishing'], prepDays: 10, approvalDays: 5 },
  { category: 'SAMPLING', subCategory: 'Finishes', name: 'Skirting & T Profile', criticality: 'Low', gates: ['finishing'], prepDays: 8, approvalDays: 4 },
];

const firstOfTrade = (acts: ScheduledActivity[], trade: string): ScheduledActivity | null =>
  acts.filter((a) => a.trade === trade).sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0] ?? null;

const statusFor = (target: string | null, today: string): 'Not Started' | 'WIP' | 'Delayed' => {
  if (!target) return 'Not Started';
  if (target < today) return 'Delayed';
  const soon = addCalendarDays(today, 21);
  return target <= soon ? 'WIP' : 'Not Started';
};

export function buildDesignTracker(acts: ScheduledActivity[], today: string): DesignRow[] {
  const rows: DesignRow[] = [];
  DESIGN_CATALOGUE.forEach((spec, i) => {
    const gated = spec.gates.map((t) => firstOfTrade(acts, t)).filter((x): x is ScheduledActivity => x !== null);
    const driver = gated.sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0] ?? null;
    // client approval must land before the gated activity starts; internal issue
    // must land approvalDays before that; prep starts prepDays before issue.
    const approvalBy = driver ? addCalendarDays(driver.startDate, -1) : null;
    const issueBy = approvalBy ? addCalendarDays(approvalBy, -spec.approvalDays) : null;
    const startDate = issueBy ? addCalendarDays(issueBy, -spec.prepDays) : null;
    rows.push({
      id: `d${i + 1}`,
      category: spec.category,
      subCategory: spec.subCategory,
      drawingName: spec.name,
      criticality: spec.criticality,
      revision: 'R0',
      startDate,
      endDateInt: issueBy,
      revisedEndDateInt: null,
      statusInt: statusFor(issueBy, today),
      endDateClient: approvalBy,
      revisedEndDateClient: null,
      statusClient: statusFor(approvalBy, today),
      releases: gated.map((g) => g.name),
      basis: driver
        ? `back-scheduled from "${driver.name}" starting ${driver.startDate}, less ${spec.approvalDays}d approval and ${spec.prepDays}d preparation`
        : 'no dependent site activity found in the programme',
    });
  });
  return rows;
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
      .sort((a, b) => ((a.endDateClient ?? '') < (b.endDateClient ?? '') ? -1 : 1))[0];

    return {
      id: `p${i + 1}`,
      category: pkg.name,
      subCategory: base.label,
      criticality: criticalityFor(leadDays, base.longLead),
      orderBy,
      deliveryRequired,
      revisedDate: null,
      vendor: '',
      orderStatus: orderBy && orderBy < today ? 'Open' : 'Open',
      deliveryStatus: 'Not Started',
      responsibility: 'Procurement',
      remarks: orderBy && orderBy < today ? 'Order-by date has passed — release the PO or re-plan the dependent activity.' : '',
      gatedBy: gate ? `${gate.drawingName} (client approval ${gate.endDateClient})` : null,
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
): TodoRow[] {
  const rows: TodoRow[] = [];
  const horizon = addCalendarDays(today, 21);
  let n = 0;
  const push = (r: Omit<TodoRow, 'id'>) => rows.push({ ...r, id: `t${++n}` });

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
        category: 'site',
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
      });

  for (const d of design)
    if (d.endDateInt && d.endDateInt <= horizon)
      push({
        description: `Issue for approval: ${d.drawingName}`,
        responsibility: d.category === 'MEP' ? 'MEP design lead' : 'Design lead',
        priority: d.criticality === 'Very Critical' ? 'HIGH' : d.criticality === 'High' ? 'HIGH' : 'MEDIUM',
        status: d.statusInt,
        startDate: d.startDate,
        endDate: d.endDateInt,
        revisedDate: null,
        notes: d.releases.length ? `Releases: ${d.releases.slice(0, 2).join(', ')}` : '',
        category: 'design',
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
