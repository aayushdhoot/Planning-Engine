// Emirates Mumbai — inputs from the Drive folder "Emirates OS".
// Money/area: '[INT] EMIRATES BOM CC - BOQ_BCS R1.xlsx' SUMMARY sheet.
// Programme: 'Emirates PERT Schedule.pdf' (see emirates-pert.ts).
// Contract: 'Emirates_Bom CC_con_22392_1_SIGNED.pdf'.
import type { Activity, Dependency, ProjectInputs, Traced } from '../domain/types';
import { buildEmiratesPert } from './emirates-pert';
import norms from '../norms/norms-v1.json';

const BOQ = '[INT] EMIRATES BOM CC - BOQ_BCS R1.xlsx · SUMMARY';
const PERT = 'Emirates PERT Schedule.pdf';
const inp = (v: number, src: string): Traced<number> => ({ value: v, provenance: 'input', source: src });

const TRADE_BY_KEYWORD: [RegExp, string][] = [
  [/dismantl|masonry|plaster|blockwork|waterproof|self level|pcc|screed/i, 'civil'],
  [/partition|dry wall|skinning|gypsum board|panell?ing/i, 'partition'],
  [/ceiling/i, 'ceiling'],
  [/floor|tiling|carpet|marble|stone|epoxy|raised/i, 'flooring'],
  [/paint|putty|primer|stucco|mettalic/i, 'painting'],
  [/glass|glaz|film|lacquer/i, 'glass'],
  [/door|carpentry|table|furniture install|pelmet|skirting|counter|seating|built-in/i, 'carpentry'],
  [/modular|workstation|cubicle|loose furniture|chairs|locker/i, 'modular'],
  [/electric|wiring|conduit|raceway|cable tray|db |lt panel|ups|battery|switch|light fixture|earthing/i, 'electrical'],
  [/hvac|duct|ahu|vrf|vav|air condition|grill|diffuser|damper/i, 'hvac'],
  [/plumb|phe|sanitary|water supply|drainage|pump/i, 'plumbing'],
  [/sprinkler|fire alarm|fa |pa |fire pipe|suppression|extinguisher/i, 'sprinkler'],
  [/network|cctv|acs|wld|rodent|av |data|server|rack/i, 'lv'],
  [/clean|snag|handover|signage|branding|pest/i, 'cleaning'],
];
const tradeFor = (name: string): string => {
  for (const [re, t] of TRADE_BY_KEYWORD) if (re.test(name)) return t;
  return 'general';
};

const PKG_BY_TRADE: Record<string, string> = {
  civil: 'A', partition: 'A', ceiling: 'A', flooring: 'A', painting: 'A', glass: 'A', carpentry: 'A',
  modular: 'B', electrical: 'C', hvac: 'D', plumbing: 'E', lv: 'F', sprinkler: 'G', cleaning: 'J', general: 'J',
};

const PROJECT_START = '2025-06-23';
const DAY = 86400000;
const idx = (iso: string) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(PROJECT_START + 'T00:00:00Z')) / DAY);

/**
 * Execution activities for the CPM engine, taken from the PERT leaf tasks.
 *
 * Durations and planned starts are inputs from the programme; dependency lags are derived
 * from those planned starts so the CPM baseline reproduces the issued PERT exactly.
 *
 * Structure matters: tasks are chained WITHIN their PERT section (the parent summary row),
 * and each section then hangs off the project anchor. Chaining every task into one long
 * sequence would reproduce the dates but make the whole programme critical, which is
 * useless for float and mitigation.
 */
function activitiesFromPert(): Activity[] {
  const tree = buildEmiratesPert(PROJECT_START);
  if (!tree.root) return [];

  // collect execution leaves grouped by their parent section, preserving programme order
  const groups = new Map<number, { id: number; name: string; start: string; dur: number }[]>();
  const walk = (node: (typeof tree.root)[] | undefined, parentId: number) => {
    for (const n of node ?? []) {
      if (n.children.length) walk(n.children, n.id);
      else if (n.start && n.finish && n.category === 'execution') {
        const list = groups.get(parentId) ?? [];
        list.push({ id: n.id, name: n.name, start: n.start, dur: n.durationDays });
        groups.set(parentId, list);
      }
    }
  };
  walk(tree.root.children, tree.root.id);

  // A zero-duration anchor at the project start. Every section hangs off it with an SS lag
  // equal to its own start offset, so sections run in parallel and each keeps its PERT date.
  const ANCHOR = 'e0';
  const acts: Activity[] = [
    {
      id: ANCHOR,
      name: 'Project start',
      phase: 'Construction',
      trade: 'general',
      duration: inp(0, `${PERT} · row 1 (project start ${PROJECT_START})`),
      deps: [],
      crew: { value: 0, provenance: 'norm', source: `${norms.version}:milestone` },
      isMilestone: true,
      packageCode: undefined,
      plannedStartFromInput: PROJECT_START,
    },
  ];

  const ordered = [...groups.entries()].sort(([, a], [, b]) => (a[0].start < b[0].start ? -1 : 1));
  for (const [, tasks] of ordered) {
    tasks.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id - b.id));
    let prev: { id: string; startIdx: number } | null = null;
    for (const t of tasks) {
      const id = `e${t.id}`;
      const trade = tradeFor(t.name);
      const startIdx = idx(t.start);
      const deps: Dependency[] = prev
        ? [{ pred: prev.id, type: 'SS', lag: Math.max(0, startIdx - prev.startIdx) }]
        : [{ pred: ANCHOR, type: 'SS', lag: Math.max(0, startIdx) }];
      acts.push({
        id,
        name: t.name,
        phase: t.name.includes('Handing') ? 'Handover' : 'Construction',
        trade,
        duration: inp(t.dur, `${PERT} · row ${t.id} (Duration)`),
        deps,
        crew: { value: (norms.crewByTrade as Record<string, number>)[trade] ?? norms.crewByTrade.general, provenance: 'norm', source: `${norms.version}:crewByTrade.${trade}` },
        isMilestone: false,
        packageCode: PKG_BY_TRADE[trade],
        plannedStartFromInput: t.start,
      });
      prev = { id, startIdx };
    }
  }
  return acts;
}

export const emirates: ProjectInputs = {
  id: 'emirates',
  name: 'Emirates Mumbai',
  client: 'Emirates Airlines',
  location: 'Commerz III, Oberoi Realty, Goregaon East, Mumbai',
  areaSft: inp(33000, `${BOQ} · PROJECT AREA`),
  contractStart: PROJECT_START,
  contractDurationCalDays: inp(245, `${PERT} · row 1 (project duration 23-Jun-25 → 22-Feb-26)`),
  contractValue: inp(239500000, `${BOQ} · TOTAL (EXCLUSIVE OF TAXES)* after special discount`),
  bcsValue: inp(126205846, `${BOQ} · Revised BCS total`),
  milestones: [
    { code: 'RA1', dayOffset: 0, percent: 0, description: 'Mobilisation, kick-off and PO release' },
    { code: 'RA2', dayOffset: 60, percent: 15, description: 'Design freeze, liaisoning approvals (BMC, Fire NOC), site mobilisation' },
    { code: 'RA3', dayOffset: 110, percent: 20, description: 'Civil, dry-wall partitions, MEP first fix, raceways and conduiting' },
    { code: 'RA4', dayOffset: 160, percent: 25, description: 'Ceilings, flooring, second fix MEP, glass partitions' },
    { code: 'RA5', dayOffset: 205, percent: 25, description: 'Painting, wall finishes, modular furniture, commissioning' },
    { code: 'RA6', dayOffset: 245, percent: 15, description: 'Snagging, deep cleaning, handover and close-out documents' },
  ],
  boqPackages: [
    { code: 'A', name: 'Civil & Interior', clientAmount: inp(127688278, `${BOQ} · A`), bcsAmount: inp(72751087, `${BOQ} · A BCS`), trade: 'partition' },
    { code: 'B', name: 'Soft Cost (furniture & furnishing)', clientAmount: inp(7643900, `${BOQ} · B`), bcsAmount: inp(3323100, `${BOQ} · B BCS`), trade: 'modular' },
    { code: 'C', name: 'Electrical Works', clientAmount: inp(24643761, `${BOQ} · C`), bcsAmount: inp(13897735, `${BOQ} · C BCS`), trade: 'electrical' },
    { code: 'D', name: 'HVAC', clientAmount: inp(24551038, `${BOQ} · D`), bcsAmount: inp(14463801, `${BOQ} · D BCS`), trade: 'hvac' },
    { code: 'E', name: 'Wet Works (PHE)', clientAmount: inp(4182898, `${BOQ} · E`), bcsAmount: inp(1712027, `${BOQ} · E BCS`), trade: 'plumbing' },
    { code: 'F', name: 'Passive Networking', clientAmount: inp(16447835, `${BOQ} · F`), bcsAmount: inp(9429983, `${BOQ} · F BCS`), trade: 'lv' },
    { code: 'G', name: 'Fire Fighting and Safety', clientAmount: inp(14084883, `${BOQ} · G`), bcsAmount: inp(7569572, `${BOQ} · G BCS`), trade: 'sprinkler' },
    { code: 'H', name: 'UPS', clientAmount: inp(7875092, `${BOQ} · H`), bcsAmount: inp(4988400, `${BOQ} · H BCS`), trade: 'electrical' },
    { code: 'I', name: 'Surveillance', clientAmount: inp(19970880, `${BOQ} · I`), bcsAmount: inp(15145838, `${BOQ} · I BCS`), trade: 'lv' },
    { code: 'J', name: 'Miscellaneous', clientAmount: inp(5500000, `${BOQ} · J`), bcsAmount: inp(2900000, `${BOQ} · J BCS`), trade: 'general' },
  ],
  scheduleActivities: activitiesFromPert(),
  provided: { boq: true, contract: true, layout: true, drawings: true, day0Images: true, design3d: true, salesKt: true, makeList: false, paymentTerms: true },
  ldPercentPerWeek: null,
  ldCapPercent: null,
  dlpMonths: 12,
};
