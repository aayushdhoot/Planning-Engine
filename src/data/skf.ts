// SKF, Pune — inputs extracted from the Drive folder "SKF, Pune OS".
// Durations: 'SKF, Pune Schedule.xlsx' (planned WORK DAYS column, row nos referenced).
// Money: 'FS Submission_FINAL_SKF_Phoenix_22.05.2026_R4 BOQ_BCS.xlsx' FINAL SUMMARY.
// Contract: 'Flipspaces Fit out Agreement (Signed).pdf' — GC Agreement dated 05-Jun-2026.
import type { Activity, Dependency, ProjectInputs, Traced } from '../domain/types';
import norms from '../norms/norms-v1.json';

const SCHED = 'SKF, Pune Schedule.xlsx';
const BOQ = 'FS Submission_FINAL_SKF_Phoenix_22.05.2026_R4 BOQ_BCS.xlsx · FINAL SUMMARY';
const CONTRACT = 'Flipspaces Fit out Agreement (Signed).pdf';

const inp = (v: number, src: string): Traced<number> => ({ value: v, provenance: 'input', source: src });

const crewOf = (trade: string): Traced<number> => ({
  value: (norms.crewByTrade as Record<string, number>)[trade] ?? norms.crewByTrade.general,
  provenance: 'norm',
  source: `${norms.version}:crewByTrade.${trade}`,
});

// [id, name, phase, trade, durationDays, sheetRow, plannedStart, deps, packageCode, valueShare]
// Dependency LOGIC (which activity waits on which, and of what type) is the mapped structure.
// Dependency LAGS are *derived* (not guessed) from the source schedule's planned start dates,
// so the CPM baseline reproduces the input schedule exactly while still yielding real float.
type Row = [string, string, string, string, number, number, string, Dependency[], string?, number?];
const FS = (pred: string): Dependency => ({ pred, type: 'FS', lag: 0 });
const SS = (pred: string): Dependency => ({ pred, type: 'SS', lag: 0 });
const FF = (pred: string): Dependency => ({ pred, type: 'FF', lag: 0 });

const rows: Row[] = [
  // SITE PREP
  ['t1', 'Site Marking & Dilapidation Report', 'Site Prep', 'general', 6, 1, '2026-06-08', [], 'GSS', 0.3],
  ['t2', 'Temporary Power', 'Site Prep', 'electrical', 2, 2, '2026-06-10', [SS('t1')], 'GSS', 0.2],
  ['t3', 'Furniture Marking', 'Site Prep', 'general', 4, 3, '2026-06-12', [SS('t1')], 'GSS', 0.1],
  // CIVIL
  ['t4', 'Blockwork, AAC Blocks & Plastering', 'Civil Work', 'civil', 22, 4, '2026-06-21', [FS('t1'), FS('t3')], 'A1', 0.55],
  ['t5', 'Plumbing Internal Piping', 'Civil Work', 'plumbing', 12, 5, '2026-06-30', [SS('t4')], 'PHE', 0.6],
  ['t6', 'Waterproofing (Floor + Walls 600mm)', 'Civil Work', 'civil', 6, 6, '2026-07-11', [SS('t5')], 'A1', 0.15],
  ['t7', 'Anti-termite & Pest Control', 'Civil Work', 'civil', 6, 7, '2026-06-22', [SS('t4')], 'A1', 0.05],
  ['t8', 'Self Leveling & Associated Works', 'Civil Work', 'civil', 4, 8, '2026-07-03', [SS('t6')], 'A1', 0.1],
  ['t9', 'Vitrified Tile Works', 'Civil Work', 'flooring', 4, 9, '2026-07-20', [FS('t8')], 'A2', 0.08],
  ['t10', 'POP on Flooring (Protection)', 'Civil Work', 'civil', 6, 10, '2026-07-20', [SS('t9')], 'A1', 0.15],
  // PARTITION & PANELING
  ['t11', '100mm Partition Framing', 'Partition & Paneling', 'partition', 18, 11, '2026-06-23', [SS('t4')], 'A2', 0.2],
  ['t12', 'Gypsum Panelling', 'Partition & Paneling', 'partition', 10, 12, '2026-07-02', [SS('t11')], 'A2', 0.15],
  ['t13', 'Gypsum Wall Punning', 'Partition & Paneling', 'partition', 8, 13, '2026-07-03', [SS('t12')], 'A2', 0.08],
  ['t14', 'Column Cladding (Ply/Gypsum)', 'Partition & Paneling', 'carpentry', 12, 14, '2026-07-03', [SS('t11')], 'A2', 0.09],
  ['t15', 'Glass Partition', 'Partition & Paneling', 'glass', 14, 15, '2026-07-08', [SS('t11')], 'A3', 0.85],
  // FALSE CEILING
  ['t16', 'Gypsum False Ceiling', 'False Ceiling', 'ceiling', 8, 16, '2026-07-06', [SS('t11'), SS('t21')], 'A2', 0.15],
  ['t17', 'Metal / Fire-rated Ceiling', 'False Ceiling', 'ceiling', 6, 17, '2026-07-12', [SS('t16')], 'A2', 0.05],
  ['t18', 'Designer Ceiling — Laminate Finish', 'False Ceiling', 'ceiling', 6, 18, '2026-07-07', [SS('t16')], 'A2', 0.05],
  ['t19', 'Acoustic Baffle Ceiling', 'False Ceiling', 'ceiling', 5, 19, '2026-07-15', [SS('t16')], 'A2', 0.05],
  // ELECTRICAL & NETWORKING
  ['t20', 'GI Cable Trays, Trunking & MS Supports', 'Electrical & Networking', 'electrical', 21, 20, '2026-07-02', [SS('t11')], 'C1', 0.2],
  ['t21', 'Raceway Trunking & Installation', 'Electrical & Networking', 'electrical', 20, 21, '2026-06-25', [SS('t4')], 'C1', 0.2],
  ['t22', 'GI Conduiting & Switch/Point Back-boxes', 'Electrical & Networking', 'electrical', 21, 22, '2026-07-09', [SS('t21')], 'C1', 0.2],
  ['t23', "Point Wiring, Circuits, Mains & DB's", 'Electrical & Networking', 'electrical', 21, 23, '2026-07-16', [SS('t22')], 'C1', 0.25],
  ['t24', 'LT Panel Labeling', 'Electrical & Networking', 'electrical', 11, 24, '2026-07-21', [SS('t23')], 'C1', 0.05],
  ['t25', 'Panel Installation — Testing & Commissioning', 'Electrical & Networking', 'electrical', 3, 25, '2026-07-30', [SS('t23'), FF('t24')], 'C1', 0.1],
  // HVAC
  ['t26', 'GI Sheet Ducting Fabrication & Installation', 'HVAC', 'hvac', 18, 26, '2026-07-04', [SS('t11')], 'HVAC', 0.3],
  ['t27', 'Duct Light Testing (Pre-insulation)', 'HVAC', 'hvac', 2, 27, '2026-07-16', [SS('t26')], 'HVAC', 0.02],
  ['t28', 'Thermal & Acoustic Insulation', 'HVAC', 'hvac', 9, 28, '2026-07-18', [FS('t27')], 'HVAC', 0.1],
  ['t29', 'Grilles, Diffusers, Fire Dampers & Actuators', 'HVAC', 'hvac', 9, 29, '2026-07-21', [SS('t28')], 'HVAC', 0.13],
  ['t30', 'Battery Room Ventilation', 'HVAC', 'hvac', 4, 30, '2026-07-18', [SS('t26')], 'HVAC', 0.05],
  ['t31', 'Refrigerant Piping & Cable Trays', 'HVAC', 'hvac', 11, 31, '2026-07-05', [SS('t26')], 'HVAC', 0.1],
  ['t32', 'Indoor Units Installation', 'HVAC', 'hvac', 7, 32, '2026-07-21', [SS('t31')], 'HVAC', 0.15],
  ['t33', 'VRV Requirements and ODUs', 'HVAC', 'hvac', 5, 33, '2026-07-16', [SS('t31')], 'HVAC', 0.1],
  ['t34', 'HVAC Testing & Commissioning', 'HVAC', 'hvac', 3, 34, '2026-07-28', [FS('t32'), FS('t33'), FS('t29')], 'HVAC', 0.05],
  // SPRINKLER
  ['t35', 'C-Class Sprinkler Piping (Grooved)', 'Sprinkler Work', 'sprinkler', 10, 35, '2026-06-27', [SS('t21')], 'FSY', 0.4],
  ['t36', 'Alarm Valve Assembly & Flow Switch', 'Sprinkler Work', 'sprinkler', 10, 36, '2026-07-29', [FS('t35')], 'FSY', 0.15],
  ['t37', 'Pendent/Upright Sprinklers & Flexible Drops', 'Sprinkler Work', 'sprinkler', 7, 37, '2026-07-02', [SS('t35')], 'FSY', 0.15],
  ['t38', 'Sprinkler Testing & Commissioning', 'Sprinkler Work', 'sprinkler', 3, 38, '2026-07-18', [SS('t36'), FS('t37')], 'FSY', 0.05],
  // LV SYSTEMS
  ['t39', 'Red/Black Armored Cabling (FAS/PA/CCTV)', 'LV Systems', 'lv', 15, 39, '2026-07-11', [SS('t21')], 'FSY', 0.1],
  ['t40', 'Detectors, Hooters & PAVA Rack Commissioning', 'LV Systems', 'lv', 9, 40, '2026-07-20', [SS('t39')], 'FSY', 0.05],
  ['t41', 'EM Locks, Biometric Readers & CCTV', 'LV Systems', 'lv', 9, 41, '2026-07-18', [SS('t39')], 'FSY', 0.05],
  ['t42', 'Emergency Exit Signage', 'LV Systems', 'lv', 9, 42, '2026-07-22', [SS('t39')], 'FSY', 0.02],
  ['t43', 'Rodent Repellent System', 'LV Systems', 'lv', 7, 43, '2026-07-22', [SS('t39')], 'FSY', 0.01],
  ['t44', 'Water Leak Detection System', 'LV Systems', 'lv', 7, 44, '2026-07-22', [SS('t39')], 'FSY', 0.02],
  // DOORS & CARPENTRY
  ['t45', 'Reception Table', 'Doors & Carpentry', 'carpentry', 20, 45, '2026-07-06', [SS('t12')], 'A2', 0.05],
  ['t46', 'Flush Doors', 'Doors & Carpentry', 'carpentry', 10, 46, '2026-07-11', [SS('t12')], 'A2', 0.03],
  ['t47', 'Glass Doors', 'Doors & Carpentry', 'glass', 6, 47, '2026-07-08', [SS('t15')], 'A3', 0.1],
  ['t48', 'Back Painted Glass', 'Doors & Carpentry', 'glass', 5, 48, '2026-07-27', [FS('t47')], 'A3', 0.05],
  ['t49', 'Acoustical Panels', 'Doors & Carpentry', 'carpentry', 3, 49, '2026-07-25', [SS('t56')], 'A2', 0.02],
  // MODULAR / BOUGHT-OUT
  ['t50', 'Modular Workstations', 'Modular Placement', 'modular', 12, 50, '2026-07-28', [SS('t57'), FS('t53')], 'B2', 0.7],
  ['t51', 'Manager/Meeting Room Tables', 'Modular Placement', 'modular', 11, 51, '2026-07-25', [SS('t57')], 'B2', 0.3],
  ['t52', 'Planter Box / OHU / File Storage', 'Modular Placement', 'carpentry', 11, 52, '2026-07-25', [SS('t57')], 'A7', 1.0],
  ['t53', 'Raised Flooring', 'Modular Placement', 'flooring', 11, 53, '2026-07-25', [FS('t10')], 'A2', 0.03],
  ['t54', 'WS / Meeting Room Chair Placement', 'Modular Placement', 'modular', 10, 54, '2026-08-02', [SS('t50')], 'B3', 0.6],
  ['t55', 'Loose Furniture', 'Modular Placement', 'modular', 7, 55, '2026-08-02', [SS('t50')], 'B3', 0.4],
  // FINISHING
  ['t56', 'Internal Walls (Putty + Paint)', 'Finishing', 'painting', 20, 56, '2026-07-23', [SS('t13'), FS('t12')], 'A2', 0.06],
  ['t57', 'Ceiling Painting', 'Finishing', 'painting', 12, 57, '2026-07-25', [SS('t16'), SS('t56')], 'A2', 0.04],
  ['t58', 'Carpet Installation', 'Finishing', 'flooring', 5, 58, '2026-07-25', [SS('t57'), FS('t10')], 'B1', 1.0],
  ['t59', 'Aluminium Skirting', 'Finishing', 'finishing', 2, 59, '2026-07-22', [SS('t58')], 'A2', 0.01],
  ['t60', 'Frosting', 'Finishing', 'finishing', 3, 60, '2026-07-30', [FS('t48')], 'A5', 0.4],
  ['t61', 'Vinyl Pasting', 'Finishing', 'finishing', 3, 61, '2026-07-30', [SS('t56')], 'A5', 0.3],
  ['t62', 'Wallpaper Pasting', 'Finishing', 'finishing', 3, 62, '2026-07-30', [SS('t56')], 'A5', 0.3],
  ['t63', 'Logo Installation', 'Finishing', 'finishing', 2, 63, '2026-08-03', [FS('t62')], 'A4', 0.5],
  ['t64', 'Rolling Blinds', 'Finishing', 'finishing', 2, 64, '2026-08-04', [FS('t61')], 'A6', 1.0],
  ['t65', 'Planters & Frames', 'Finishing', 'finishing', 2, 65, '2026-08-04', [FS('t61')], 'A4', 0.2],
  ['t66', 'Sun Control Film', 'Finishing', 'finishing', 4, 66, '2026-07-30', [SS('t60')], 'A5', 0.3],
  ['t67', 'Signage Installation', 'Finishing', 'finishing', 4, 67, '2026-08-06', [FS('t63')], 'A4', 0.3],
  ['t68', 'Deep Cleaning', 'Finishing', 'cleaning', 12, 68, '2026-08-01', [SS('t58'), SS('t54')], 'GSS', 0.2],
  // HANDOVER
  ['t69', 'Snag List & Handover', 'Handover', 'general', 10, 69, '2026-08-05', [SS('t68'), FS('t34'), FS('t38'), FS('t25')], 'GSS', 0.2],
];

const PROJECT_START = '2026-06-08';
const DAY = 86400000;
const dayIndex = (iso: string): number =>
  Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(2026, 5, 8)) / DAY);

/**
 * Derive dependency lags from the source schedule's planned start dates.
 * The driving (largest-constraint) predecessor is lagged so the activity starts exactly on its
 * planned date; non-driving predecessors keep lag 0 and therefore carry genuine float.
 * Provenance: computed from '<SCHED>' planned START DATE column — never guessed.
 */
function deriveLags(src: Row[]): Row[] {
  const idx = new Map(src.map((r) => [r[0], dayIndex(r[6])]));
  const dur = new Map(src.map((r) => [r[0], r[4]]));
  return src.map((r) => {
    const selfStart = idx.get(r[0])!;
    const deps = r[7];
    if (deps.length === 0) return r;
    const natural = deps.map((d) => {
      const ps = idx.get(d.pred)!;
      const pe = ps + dur.get(d.pred)!;
      return d.type === 'FS' ? pe : d.type === 'SS' ? ps : pe - r[4];
    });
    const maxNat = Math.max(...natural);
    const driver = natural.indexOf(maxNat);
    const withLags = deps.map((d, i) => ({
      ...d,
      lag: i === driver ? selfStart - maxNat : Math.min(0, selfStart - natural[i]),
    }));
    return [r[0], r[1], r[2], r[3], r[4], r[5], r[6], withLags, r[8], r[9]] as Row;
  });
}

const activities: Activity[] = deriveLags(rows).map(([id, name, phase, trade, dur, row, plannedStart, deps, packageCode, valueShare]) => ({
  id,
  name,
  phase,
  trade,
  duration: inp(dur, `${SCHED} · task row ${row} (planned WORK DAYS)`),
  deps, // lags derived from ${SCHED} planned START DATE column
  crew: crewOf(trade),
  isMilestone: false,
  packageCode,
  valueShare,
  plannedStartFromInput: plannedStart,
}));

export const skfProjectStart = PROJECT_START;

export const skf: ProjectInputs = {
  id: 'skf-pune',
  name: 'SKF, Pune',
  client: 'SKF India (Industrial) Ltd',
  location: 'Units 801–802, 8th Floor, Millennium Tower 3, Wakad, Pune',
  areaSft: inp(26484, `${BOQ} · PROJECT AREA (SFT)`),
  contractStart: '2026-06-08', // SKF, Pune Schedule.xlsx · Start Date
  contractDurationCalDays: inp(75, `${CONTRACT} · cl.28.2 Time for Completion (75 calendar days)`),
  contractValue: inp(82100400, `${BOQ} · GRAND TOTAL (EXCL TAXES)`),
  bcsValue: inp(59538240, `${BOQ} · BCS AMOUNT total`),
  milestones: [
    { code: 'RA1', dayOffset: 0, percent: 0, description: 'Project mobilisation (no advance payable)' },
    { code: 'RA2', dayOffset: 20, percent: 20, description: 'Partition marking, frameworks, skinning, civil walls, conduiting, raceways + gypsum/electrical material delivery' },
    { code: 'RA3', dayOffset: 40, percent: 25, description: 'Partition closing, wiring, sprinkler piping, FAS wiring + duct/cable/ply/tile delivery; furniture/carpet/glass orders closed' },
    { code: 'RA4', dayOffset: 55, percent: 25, description: 'Paint base coats, glass channels, duct installation, ceiling framing + carpet/sanitary/doors/DB delivery' },
    { code: 'RA5', dayOffset: 70, percent: 25, description: 'Switches, sanitary fixtures, carpentry, doors, first paint coat, false ceiling; pre-commissioning' },
    { code: 'RA6', dayOffset: 75, percent: 5, description: 'Against 12-month DLP bank guarantee at virtual completion/handover' },
  ], // source: contract cl.6 milestone schedule (RA1–RA6)
  boqPackages: [
    { code: 'A1', name: 'Civil Works', clientAmount: inp(1781747, `${BOQ} · A1`), bcsAmount: inp(1282858, `${BOQ} · A1 BCS`), trade: 'civil' },
    { code: 'A2', name: 'Interior Works', clientAmount: inp(15573856, `${BOQ} · A2`), bcsAmount: inp(11621460, `${BOQ} · A2 BCS`), trade: 'partition' },
    { code: 'A3', name: 'Modular Glass Partitions & Doors', clientAmount: inp(2458250, `${BOQ} · A3`), bcsAmount: inp(1769940, `${BOQ} · A3 BCS`), trade: 'glass' },
    { code: 'A4', name: 'Signages', clientAmount: inp(158100, `${BOQ} · A4`), bcsAmount: inp(113832, `${BOQ} · A4 BCS`), trade: 'finishing' },
    { code: 'A5', name: 'Graphics & Films', clientAmount: inp(704550, `${BOQ} · A5`), bcsAmount: inp(513424, `${BOQ} · A5 BCS`), trade: 'finishing' },
    { code: 'A6', name: 'Blinds', clientAmount: inp(906000, `${BOQ} · A6`), bcsAmount: inp(652320, `${BOQ} · A6 BCS`), trade: 'finishing' },
    { code: 'A7', name: 'Planters', clientAmount: inp(242000, `${BOQ} · A7`), bcsAmount: inp(174240, `${BOQ} · A7 BCS`), trade: 'carpentry' },
    { code: 'B1', name: 'Carpet Flooring', clientAmount: inp(3419125, `${BOQ} · B1`), bcsAmount: inp(2461770, `${BOQ} · B1 BCS`), trade: 'flooring' },
    { code: 'B2', name: 'Modular Furniture', clientAmount: inp(5326045, `${BOQ} · B2`), bcsAmount: inp(3834752, `${BOQ} · B2 BCS`), trade: 'modular' },
    { code: 'B3', name: 'Loose Furniture & Chairs', clientAmount: inp(6046240, `${BOQ} · B3`), bcsAmount: inp(4353293, `${BOQ} · B3 BCS`), trade: 'modular' },
    { code: 'C1', name: 'Electrical Works', clientAmount: inp(13398707, `${BOQ} · C1`), bcsAmount: inp(9647069, `${BOQ} · C1 BCS`), trade: 'electrical' },
    { code: 'C2', name: 'Light Fixtures', clientAmount: inp(2007400, `${BOQ} · C2`), bcsAmount: inp(1445328, `${BOQ} · C2 BCS`), trade: 'electrical' },
    { code: 'C3', name: 'UPS', clientAmount: inp(3308610, `${BOQ} · C3`), bcsAmount: inp(2382199, `${BOQ} · C3 BCS`), trade: 'electrical' },
    { code: 'PHE', name: 'Plumbing (PHE)', clientAmount: inp(464360, `BOQ_BCS · GRAND TOTAL - PHE`), bcsAmount: inp(334339, `BOQ_BCS · PHE BCS`), trade: 'plumbing' },
    { code: 'HVAC', name: 'HVAC (Low Side + VAV + VRF)', clientAmount: inp(12240339, `BOQ_BCS · HVAC LS 8,332,095 + VAV 2,224,872 + VRF 2,682,932 (supply+install)`), bcsAmount: null, trade: 'hvac' },
    { code: 'PN', name: 'Passive Networking', clientAmount: inp(5885280, `BOQ_BCS · GRAND TOTAL - PASSIVE NETWORKING`), bcsAmount: inp(4237402, `BOQ_BCS · PN BCS`), trade: 'lv' },
    { code: 'FSY', name: 'Fire & Security', clientAmount: inp(6570779, `BOQ_BCS · GRAND TOTAL - FIRE & SECURITY`), bcsAmount: inp(4742481, `BOQ_BCS · F&S BCS`), trade: 'sprinkler' },
    { code: 'GSS', name: 'GSS / General Site Services', clientAmount: inp(609452, `BOQ_BCS · GSS`), bcsAmount: inp(438805, `BOQ_BCS · GSS BCS`), trade: 'general' },
  ],
  scheduleActivities: activities,
  provided: { boq: true, contract: true, layout: true, drawings: true, day0Images: true, design3d: false, salesKt: false, makeList: true, paymentTerms: true },
  ldPercentPerWeek: 1,
  ldCapPercent: 5,
  dlpMonths: 12,
  siteConditions: [],
  materialItems: [],
  scopeNotes: [],
  designRefs: [],
};
