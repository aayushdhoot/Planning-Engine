// Site material register: what physically has to arrive at site, when, and from whom.
//
// The procurement tracker plans at BOQ-package level — "Electrical, order by 12-Jun, on site by
// 30-Jun". That is the right altitude for the procurement desk and the wrong one for the site
// engineer, who does not receive a package: they receive gypsum boards, ply, wire drums, GI
// ducting and workstations, each with its own lead time, its own vendor and its own delivery
// note. A package marked "Partially Delivered" tells nobody which of those is missing.
//
// So this expands each package the project actually carries into the materials it consists of,
// dates each one against the site activity that consumes it, and links it back to the
// procurement row that raises the PO — or, when the work contractor or the client supplies it,
// carries their name and PO instead.
//
// Quantities and delivery dates are entered by site. The engine computes dates and links only;
// a value-only BOQ says nothing about how many boards are coming.
import type { BoqPackage, MaterialListItem, ProjectInputs, ScheduledActivity } from '../domain/types';
import type { DesignRow, MaterialRow, MaterialSupply, ProcurementRow } from '../domain/trackers';
import { addCalendarDays } from './calendar';
import norms from '../norms/norms-v1.json';

interface MaterialSpec {
  item: string;
  unit: string;
  /** trade whose activity consumes it — this is what dates the row */
  trade: string;
  /** matching entry in norms materialLeadTimesDays; supplies the make, the lead time and its source */
  norm?: string;
  /** lead time when no norms entry matches; falls back to the package lead time when absent */
  leadDays?: number;
  make?: string;
  /** how it normally reaches site; 'procured' unless stated */
  supply?: MaterialSupply;
  /** set when this spec came from a project make list rather than the inferred catalogue —
   * carries the source string through to the row's basis text */
  fromMakeList?: string;
}

/**
 * A cost head and the materials it puts on site.
 *
 * Heads are matched to the project's BOQ packages by code first, then by name, then by trade —
 * because BOQ coding is per-project, not universal. SKF codes HVAC as "HVAC" and networking as
 * "PN"; KOHLER calls the same heads "D1" and "E1"; the Emirates BOQ runs A to J. Keying this
 * catalogue on codes alone silently dropped the ducts, pipes and cabling from any project that
 * did not happen to use the scheme the norms were written against.
 */
interface MaterialHead {
  /** the code in the norms' own scheme; matched first when the project shares it */
  code: string;
  /** shown when the project has no separate cost head for this material */
  label: string;
  /** how this head is usually named, for a BOQ coded differently */
  match: RegExp;
  /** last resort: the trade whose package owns it, used only when exactly one package has it */
  trade: string;
  materials: MaterialSpec[];
}

/**
 * What a fit-out actually consumes, by cost head. Long enough to be useful: a register that
 * lists "Electrical materials" as one line is the package tracker again under another name.
 *
 * Lead times cite `norms.materialLeadTimesDays` wherever that list carries the item (it came off
 * a real project's material lead-time sheet); the rest are stated here and are overridable per
 * package by the norms lead time in Settings.
 */
const MATERIAL_HEADS: MaterialHead[] = [
  // ---- civil consumables
  {
    code: 'A1', label: 'Civil works', match: /civil|masonry|block ?work/i, trade: 'civil',
    materials: [
      { item: 'AAC blocks / bricks', unit: 'nos', trade: 'civil', leadDays: 7 },
      { item: 'Cement, sand & aggregate', unit: 'bags', trade: 'civil', leadDays: 5 },
      { item: 'Waterproofing compound', unit: 'kg', trade: 'civil', leadDays: 10 },
      { item: 'Self-levelling screed compound', unit: 'bags', trade: 'civil', leadDays: 10 },
      { item: 'Anti-termite & pest control chemical', unit: 'ltr', trade: 'civil', leadDays: 7 },
      { item: 'Tile adhesive & grout', unit: 'bags', trade: 'flooring', leadDays: 7 },
    ],
  },
  // ---- boards, ply, ceiling and finishes
  {
    code: 'A2', label: 'Interior works — boards, ply & ceiling', match: /interior|carpentry|joinery|panell?ing|ceiling/i, trade: 'partition',
    materials: [
      { item: 'GI partition frame — studs & tracks', unit: 'rmt', trade: 'partition', norm: 'Partition frame material' },
      { item: 'Gypsum board 12.5mm', unit: 'sqm', trade: 'partition', norm: 'Gypsum board' },
      { item: 'Glasswool / rockwool insulation', unit: 'sqm', trade: 'partition', norm: 'Glasswool/Rockwool' },
      { item: 'Ply 12/18/35mm 710 grade', unit: 'sqm', trade: 'carpentry', norm: 'Ply 12/18/35mm 710 grade' },
      { item: 'Hardwood / Matti wood', unit: 'cft', trade: 'carpentry', norm: 'Hard wood/Matti wood' },
      { item: 'Laminates & veneer', unit: 'sheets', trade: 'carpentry', leadDays: 15 },
      { item: 'Hardware — hinges, channels, handles', unit: 'nos', trade: 'carpentry', leadDays: 21 },
      { item: 'False ceiling grid & boards', unit: 'sqm', trade: 'ceiling', norm: 'False ceiling material (Rigitone)' },
      { item: 'Metal / fire-rated ceiling panels', unit: 'sqm', trade: 'ceiling', leadDays: 25 },
      { item: 'Acoustic / fluted panels', unit: 'sqm', trade: 'ceiling', norm: 'Acoustic panel' },
      { item: 'Wall putty, primer & paint', unit: 'ltr', trade: 'painting', norm: 'Wall paint' },
      { item: 'Aluminium skirting / T-profile', unit: 'rmt', trade: 'finishing', norm: 'Aluminium skirting / T-patti' },
    ],
  },
  // ---- glass
  {
    code: 'A3', label: 'Glass partitions & doors', match: /glass/i, trade: 'glass',
    materials: [
      { item: 'Partition glass — toughened / laminated', unit: 'sqm', trade: 'glass', norm: 'Partition glass (toughened/laminated)' },
      { item: 'Glass partition frame & profiles', unit: 'rmt', trade: 'glass', norm: 'Glass partition frame material' },
      { item: 'Patch fittings, floor springs & locks', unit: 'nos', trade: 'glass', leadDays: 21 },
      { item: 'Back-painted glass', unit: 'sqm', trade: 'glass', norm: 'Back painted glass' },
    ],
  },
  // ---- signage
  {
    code: 'A4', label: 'Signages', match: /signage/i, trade: 'finishing',
    materials: [
      { item: 'Signage & wayfinding boards', unit: 'nos', trade: 'finishing', leadDays: 21 },
    ],
  },
  // ---- graphics & films
  {
    code: 'A5', label: 'Graphics & films', match: /graphic|film|wallpaper|frosting/i, trade: 'finishing',
    materials: [
      { item: 'Frosting film', unit: 'sqm', trade: 'finishing', norm: 'Frosting' },
      { item: 'Wallpaper & graphics', unit: 'sqm', trade: 'finishing', leadDays: 30 },
    ],
  },
  // ---- blinds
  {
    code: 'A6', label: 'Blinds', match: /blind/i, trade: 'finishing',
    materials: [
      { item: 'Roller / venetian blinds', unit: 'sqm', trade: 'finishing', leadDays: 30 },
    ],
  },
  // ---- planters
  {
    code: 'A7', label: 'Planters', match: /planter|green ?wall/i, trade: 'finishing',
    materials: [
      { item: 'Planters & green wall', unit: 'nos', trade: 'finishing', leadDays: 21 },
    ],
  },
  // ---- flooring
  {
    code: 'B1', label: 'Flooring', match: /carpet|flooring/i, trade: 'flooring',
    materials: [
      { item: 'Carpet tiles / broadloom', unit: 'sqm', trade: 'flooring', leadDays: 40 },
      { item: 'SPC / vinyl flooring', unit: 'sqm', trade: 'flooring', leadDays: 35 },
      { item: 'Vitrified & ceramic tiles', unit: 'sqm', trade: 'flooring', leadDays: 21 },
      { item: 'Raised floor panels & pedestals', unit: 'sqm', trade: 'flooring', leadDays: 40 },
      { item: 'Flooring adhesive', unit: 'kg', trade: 'flooring', leadDays: 10 },
      { item: 'Dust mat', unit: 'sqm', trade: 'flooring', norm: 'Dust matt' },
    ],
  },
  // ---- modular furniture
  {
    code: 'B2', label: 'Modular furniture', match: /modular furniture|workstation/i, trade: 'modular',
    materials: [
      { item: 'Workstations & linear desks', unit: 'nos', trade: 'modular', leadDays: 45 },
      { item: 'Storage units & pedestals', unit: 'nos', trade: 'modular', leadDays: 45 },
      { item: 'Meeting & conference tables', unit: 'nos', trade: 'modular', leadDays: 45 },
    ],
  },
  // ---- loose furniture
  {
    code: 'B3', label: 'Loose furniture & chairs', match: /loose furniture|chair|soft cost|furnishing/i, trade: 'modular',
    materials: [
      { item: 'Task & visitor chairs', unit: 'nos', trade: 'modular', leadDays: 45 },
      { item: 'Soft seating & lounge furniture', unit: 'nos', trade: 'modular', leadDays: 45 },
      { item: 'Cafeteria furniture', unit: 'nos', trade: 'modular', leadDays: 40 },
    ],
  },
  // ---- electrical
  {
    code: 'C1', label: 'Electrical works', match: /electrical|switchgear|cabling/i, trade: 'electrical',
    materials: [
      { item: 'LT panel & distribution boards', unit: 'nos', trade: 'electrical', leadDays: 45 },
      { item: 'MCB / RCCB / switchgear', unit: 'nos', trade: 'electrical', leadDays: 30 },
      { item: 'FRLS copper wires & cables', unit: 'rmt', trade: 'electrical', leadDays: 30 },
      { item: 'GI conduits, back boxes & accessories', unit: 'rmt', trade: 'electrical', leadDays: 14 },
      { item: 'Cable trays, raceways & trunking', unit: 'rmt', trade: 'electrical', leadDays: 21 },
      { item: 'Modular switches & sockets', unit: 'nos', trade: 'electrical', leadDays: 25 },
      { item: 'Earthing material & strips', unit: 'nos', trade: 'electrical', leadDays: 21 },
    ],
  },
  // ---- light fixtures
  {
    code: 'C2', label: 'Light fixtures', match: /light|luminaire/i, trade: 'electrical',
    materials: [
      { item: 'Light fittings & drivers', unit: 'nos', trade: 'electrical', leadDays: 35 },
      { item: 'Profile & cove lighting', unit: 'rmt', trade: 'electrical', leadDays: 35 },
      { item: 'Decorative & pendant lights', unit: 'nos', trade: 'electrical', leadDays: 40 },
    ],
  },
  // ---- UPS
  {
    code: 'C3', label: 'UPS', match: /\bups\b/i, trade: 'electrical',
    materials: [
      { item: 'UPS & battery bank', unit: 'nos', trade: 'electrical', leadDays: 42 },
    ],
  },
  // ---- plumbing
  {
    code: 'PHE', label: 'Plumbing & sanitary', match: /plumb|\bphe\b|wet work|sanitary|toilet/i, trade: 'plumbing',
    materials: [
      { item: 'CPVC / UPVC pipes & fittings', unit: 'rmt', trade: 'plumbing', leadDays: 14 },
      { item: 'Sanitaryware — WC, basins, urinals', unit: 'nos', trade: 'plumbing', leadDays: 30 },
      { item: 'CP fittings & accessories', unit: 'nos', trade: 'plumbing', leadDays: 25 },
      { item: 'Toilet cubicle system', unit: 'nos', trade: 'plumbing', leadDays: 35 },
    ],
  },
  // ---- HVAC
  {
    code: 'HVAC', label: 'HVAC', match: /hvac|air ?condition|\bvrf\b|\bvrv\b|ducting/i, trade: 'hvac',
    materials: [
      { item: 'GI sheet for ducting', unit: 'kg', trade: 'hvac', leadDays: 21 },
      { item: 'Duct insulation — thermal & acoustic', unit: 'sqm', trade: 'hvac', leadDays: 21 },
      { item: 'Grilles, diffusers & volume dampers', unit: 'nos', trade: 'hvac', leadDays: 30 },
      { item: 'Fire dampers & actuators', unit: 'nos', trade: 'hvac', leadDays: 35 },
      { item: 'VRF / VRV indoor units', unit: 'nos', trade: 'hvac', leadDays: 45 },
      { item: 'Outdoor units (ODU)', unit: 'nos', trade: 'hvac', leadDays: 45 },
      { item: 'Refrigerant piping & insulation', unit: 'rmt', trade: 'hvac', leadDays: 30 },
      { item: 'Exhaust fans & ventilation units', unit: 'nos', trade: 'hvac', leadDays: 25 },
    ],
  },
  // ---- passive networking
  {
    code: 'PN', label: 'Passive networking', match: /network|passive|structured cabl/i, trade: 'lv',
    materials: [
      { item: 'CAT6 / CAT6A cable', unit: 'rmt', trade: 'lv', leadDays: 28 },
      { item: 'Network racks & patch panels', unit: 'nos', trade: 'lv', leadDays: 28 },
      { item: 'Face plates, I/O boxes & patch cords', unit: 'nos', trade: 'lv', leadDays: 21 },
      { item: 'Fibre & OFC accessories', unit: 'rmt', trade: 'lv', leadDays: 30 },
    ],
  },
  // ---- fire & security
  {
    code: 'FSY', label: 'Fire & security', match: /fire|security|surveillance|safety|\bflss\b|\bfas\b/i, trade: 'sprinkler',
    materials: [
      { item: 'Sprinkler pipes — C-class grooved', unit: 'rmt', trade: 'sprinkler', leadDays: 21 },
      { item: 'Sprinkler heads & flexible drops', unit: 'nos', trade: 'sprinkler', leadDays: 30 },
      { item: 'Alarm valve assembly & flow switch', unit: 'nos', trade: 'sprinkler', leadDays: 35 },
      { item: 'Fire detectors, hooters & FAS panel', unit: 'nos', trade: 'lv', leadDays: 30 },
      { item: 'PA / PAVA system & speakers', unit: 'nos', trade: 'lv', leadDays: 35 },
      { item: 'CCTV, NVR & access control hardware', unit: 'nos', trade: 'lv', leadDays: 35 },
      { item: 'Armoured cabling — FAS / PA / CCTV', unit: 'rmt', trade: 'lv', leadDays: 25 },
      { item: 'Rodent repellent system', unit: 'nos', trade: 'lv', leadDays: 30 },
      { item: 'Fire extinguishers & exit signage', unit: 'nos', trade: 'lv', leadDays: 21 },
    ],
  },
  // ---- site services: the contractor brings these, against their own work order
  {
    code: 'GSS', label: 'General site services', match: /\bgss\b|general site|miscellane|site service/i, trade: 'general',
    materials: [
      { item: 'Site consumables — fasteners, adhesives, hardware', unit: 'lot', trade: 'general', leadDays: 7, supply: 'vendor' },
      { item: 'Safety PPE, barricading & site signage', unit: 'lot', trade: 'general', leadDays: 7, supply: 'vendor' },
      { item: 'Scaffolding & access equipment', unit: 'lot', trade: 'general', leadDays: 7, supply: 'vendor' },
      { item: 'Housekeeping & debris removal material', unit: 'lot', trade: 'general', leadDays: 5, supply: 'vendor' },
    ],
  },
];

/**
 * Free issue: material the client hands over rather than buys through us. It is not in the BOQ,
 * so nothing upstream raises it — and it is exactly what holds up handover when nobody tracked
 * it, which is why it belongs in the site register with a date against it.
 */
const CLIENT_FREE_ISSUE: MaterialHead = {
  code: '',
  label: 'Client free issue',
  match: /(?!)/, // never matches a BOQ package: free issue is by definition outside the contract
  trade: '',
  materials: [
    { item: 'IT hardware — desktops, laptops, printers', unit: 'nos', trade: 'lv', leadDays: 30, supply: 'client' },
    { item: 'Active network components — switches, routers, firewall', unit: 'nos', trade: 'lv', leadDays: 30, supply: 'client' },
    { item: 'AV equipment — VC systems, displays, sound bars', unit: 'nos', trade: 'lv', leadDays: 35, supply: 'client' },
    { item: 'Pantry appliances', unit: 'nos', trade: 'finishing', leadDays: 21, supply: 'client' },
    { item: 'Client-supplied loose furniture & artefacts', unit: 'nos', trade: 'modular', leadDays: 30, supply: 'client' },
  ],
};

/** Days a material must be on site ahead of the activity that consumes it — as procurement uses. */
const ON_SITE_AHEAD_DAYS = 2;

const ENABLING = /temporary|dilapidation|survey|demolition|debris|barricad|hoarding|mobilis|marking/i;
const isEnabling = (a: ScheduledActivity) => a.phase === 'Site Prep' || ENABLING.test(a.name);

const RESPONSIBILITY: Record<MaterialSupply, string> = {
  procured: 'Procurement',
  vendor: 'Site / contractor',
  client: 'Client',
};

type LeadSource = { days: number; make: string; source: string };

/** Lead time and make for a spec: the norms material list first, then the spec, then the package. */
function leadFor(spec: MaterialSpec, head: MaterialHead, packageLeadDays: number | null): LeadSource {
  if (spec.norm) {
    const hit = norms.materialLeadTimesDays.find((m) => m.item === spec.norm);
    if (hit) return { days: hit.days, make: spec.make ?? hit.make, source: `${norms.version}:materialLeadTimesDays "${hit.item}" (${hit.source})` };
  }
  if (spec.leadDays != null) return { days: spec.leadDays, make: spec.make ?? '', source: 'site material catalogue lead time' };
  return { days: packageLeadDays ?? 21, make: spec.make ?? '', source: `package lead time (${norms.version}:packageLeadTimes.${head.code})` };
}

export function buildMaterialTracker(
  p: ProjectInputs,
  acts: ScheduledActivity[],
  procurement: ProcurementRow[],
  design: DesignRow[],
  today: string,
  projectStart: string | null = null,
): MaterialRow[] {
  if (!acts.length) return [];
  const byCode = new Map(p.boqPackages.map((pkg) => [pkg.code, pkg]));
  const procByCode = new Map(procurement.map((pr) => [pr.packageCode, pr]));

  /**
   * Which BOQ package buys this head, in a project that may not use the norms' coding scheme.
   * Code, then name, then — only when it is unambiguous — the sole package of the head's trade.
   * A head nobody can be sure buys is left unowned rather than guessed onto the nearest package:
   * the row still appears with its dates, and the team picks the supply route.
   */
  const ownerOf = (head: MaterialHead): BoqPackage | null => {
    const byNameOrCode = byCode.get(head.code) ?? p.boqPackages.find((pkg) => head.match.test(pkg.name));
    if (byNameOrCode) return byNameOrCode;
    const sameTrade = p.boqPackages.filter((pkg) => pkg.trade === head.trade);
    return sameTrade.length === 1 ? sameTrade[0] : null;
  };

  /**
   * The activity that consumes this material. Preferring the owning package's own activity over
   * any activity of the trade matters: gypsum board is needed when *the partition package*
   * starts, not when some other trade happens to touch a partition first.
   *
   * Enabling activities (temporary power, site marking, etc.) are filtered out so that
   * materials are dated against the real work rather than site mobilisation.
   *
   * When a package has no activities of its own (e.g. C2 Light Fixtures or C3 UPS under
   * Electrical), it is a sub-package whose material is installed late in the trade's sequence
   * — so we pick the LAST non-enabling activity rather than the first.
   */
  const consumerOf = (spec: MaterialSpec, owner: BoqPackage | null): ScheduledActivity | null => {
    const byPackage = owner ? acts.filter((a) => a.packageCode === owner.code && a.trade === spec.trade) : [];
    const byTrade = acts.filter((a) => a.trade === spec.trade);
    const inPackage = owner ? acts.filter((a) => a.packageCode === owner.code) : [];

    const earliest = (pool: ScheduledActivity[]) => [...pool].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0] ?? null;
    const latest = (pool: ScheduledActivity[]) => [...pool].sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0] ?? null;
    const nonEnabling = (pool: ScheduledActivity[]) => { const r = pool.filter((a) => !isEnabling(a)); return r.length ? r : pool; };

    if (byPackage.length) return earliest(byPackage);
    if (byTrade.length) return latest(nonEnabling(byTrade));
    if (inPackage.length) return earliest(inPackage);
    return null;
  };

  /** The design deliverable whose client approval must land before this can be ordered. */
  const gateFor = (consumer: ScheduledActivity | null): DesignRow | null =>
    consumer
      ? design
          .filter((d) => d.releases.includes(consumer.name))
          .sort((a, b) => ((a.approvalBy ?? '') < (b.approvalBy ?? '') ? -1 : 1))[0] ?? null
      : null;

  // A head is in scope when the BOQ carries it, or when the programme is going to install its
  // trade anyway — a project whose BOQ lumps glass into one interior head still has glass
  // arriving on site, and the activity is the evidence for it.
  const heads = MATERIAL_HEADS.map((head) => ({ head, owner: ownerOf(head) })).filter(
    ({ head, owner }) => owner !== null || head.materials.some((m) => acts.some((a) => a.trade === m.trade)),
  );

  // Named items from a project make list REPLACE the inferred catalogue for their trade — a
  // trade the client has already specified down to make/finish is better represented by those
  // named rows than by the generic catalogue guess, and carrying both would just duplicate the
  // same physical delivery under two different line items. Any trade the make list doesn't
  // mention still falls back to the catalogue, so an empty or partial make list never leaves a
  // gap in the register.
  const namedTrades = new Set(p.materialItems.map((m) => m.trade));
  const ownerOfTrade = (trade: string): BoqPackage | null => {
    const sameTrade = p.boqPackages.filter((pkg) => pkg.trade === trade);
    return sameTrade.length === 1 ? sameTrade[0] : null;
  };
  const namedSpecs = p.materialItems.map((m: MaterialListItem) => {
    const owner = ownerOfTrade(m.trade);
    const syntheticHead: MaterialHead = { code: owner?.code ?? '', label: owner?.name ?? `Make list — ${m.trade}`, match: /(?!)/, trade: m.trade, materials: [] };
    const spec: MaterialSpec = { item: m.item, unit: m.unit ?? 'nos', trade: m.trade, make: m.spec, fromMakeList: m.source };
    return { spec, head: syntheticHead, owner };
  });

  // free issue is raised on every project — it is not in the BOQ by definition
  const specs = [
    ...heads.flatMap(({ head, owner }) =>
      head.materials.filter((spec) => !namedTrades.has(spec.trade)).map((spec) => ({ spec, head, owner })),
    ),
    ...namedSpecs,
    ...CLIENT_FREE_ISSUE.materials.map((spec) => ({ spec, head: CLIENT_FREE_ISSUE, owner: null as BoqPackage | null })),
  ];
  return specs.map(({ spec, head, owner }, i) => {
    const proc = owner ? procByCode.get(owner.code) ?? null : null;
    const supply = spec.supply ?? 'procured';
    const lead = leadFor(spec, head, proc?.leadDays ?? null);
    const consumer = consumerOf(spec, owner);
    const requiredOnSite = consumer ? addCalendarDays(consumer.startDate, -ON_SITE_AHEAD_DAYS) : null;
    const orderBy = requiredOnSite ? addCalendarDays(requiredOnSite, -lead.days) : null;
    const gate = gateFor(consumer);

    // Structural defects only. Ordering against a specification the client has not yet approved
    // is true of most rows on a compressed fit-out — it is seeded into the remark below rather
    // than badged here, because a flag on four rows in five flags nothing.
    const issues: string[] = [];
    if (!consumer) issues.push('No site activity in the programme consumes this material — no delivery date could be computed.');
    if (orderBy && projectStart && orderBy < projectStart)
      issues.push(`Order-by ${orderBy} is before the project starts (${projectStart}) — the ${lead.days}d lead time does not fit inside the programme, so this had to be ordered at award.`);

    const remarks =
      orderBy && orderBy < today
        ? 'Order-by date has passed — confirm the order is placed or the site date will move.'
        : orderBy && gate?.approvalBy && gate.approvalBy > orderBy
          ? `"${gate.drawingName}" is only approved on ${gate.approvalBy}, after the order-by date — order against the approved sample or accept the rework risk.`
          : '';

    return {
      id: `m${i + 1}`,
      packageCode: owner?.code ?? '',
      // only a material we buy ourselves hangs off a procurement row; a vendor- or
      // client-supplied one is chased against their own PO, which is the point of the split
      procurementId: supply === 'procured' ? proc?.id ?? null : null,
      // the project's own name for the cost head, falling back to what this material is when the
      // BOQ has no separate head for it
      category: owner?.name ?? head.label,
      item: spec.item,
      make: lead.make,
      unit: spec.unit,
      supply,
      vendor: '',
      poNumber: '',
      orderedQty: null,
      deliveredQty: null,
      leadDays: lead.days,
      orderBy,
      requiredOnSite,
      expectedDelivery: null,
      actualDelivery: null,
      status: 'Not Ordered',
      inspection: 'Pending',
      storage: '',
      consumedBy: consumer ? `${consumer.name} (${consumer.startDate})` : null,
      gatedBy: gate ? `${gate.drawingName} (client approval ${gate.approvalBy})` : null,
      responsibility: RESPONSIBILITY[supply],
      remarks,
      basis: consumer
        ? `${spec.fromMakeList ? `from project make list (${spec.fromMakeList}); ` : ''}on site ${ON_SITE_AHEAD_DAYS}d before "${consumer.name}" starts ${consumer.startDate}; order-by = that date − ${lead.days}d lead from ${lead.source}`
        : `no site activity of trade "${spec.trade}" in the programme`,
      issues,
    };
  });
}
