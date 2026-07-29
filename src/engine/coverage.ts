// Drive coverage: what is in the folder, versus what the engine actually got out of it.
//
// This exists to answer one question honestly — "is the engine reading all of my input data?"
// A screen that answered it with READ / NOT READ would be worse than no screen at all, because
// the engine can open a contract PDF and extract nothing from it. Reporting that as "read"
// gives false assurance about the one thing the user is checking.
//
// So there are two different successes:
//   extracted — parsed structurally; numbers from this file are in the plan
//   logged    — bytes were read, but there is no structural extractor for this type, so
//               nothing reached the plan. The file counts as evidence, not as input.
import type { DriveFile, DriveScan } from '../services/drive';
import { INPUT_SLOTS, type InputSlot } from './intake';

export type ReadState = 'pending' | 'extracted' | 'logged' | 'dropped';

/** Which structural parser, if any, can turn this file into engine inputs. */
export type Extractor = 'boq' | 'schedule' | null;

export type FileKind = 'spreadsheet' | 'document' | 'drawing' | 'image' | 'archive' | 'other';

const EXT = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

export function kindOf(file: DriveFile): FileKind {
  const e = EXT(file.name);
  if (['xlsx', 'xls', 'csv', 'tsv'].includes(e)) return 'spreadsheet';
  if (['pdf', 'doc', 'docx', 'txt', 'ppt', 'pptx'].includes(e)) return 'document';
  if (['dwg', 'dxf', 'rvt', 'skp'].includes(e)) return 'drawing';
  if (['png', 'jpg', 'jpeg', 'gif', 'heic', 'webp', 'mp4', 'mov'].includes(e)) return 'image';
  if (['zip', 'rar', '7z'].includes(e)) return 'archive';
  return 'other';
}

const SCHEDULE_NAME = /schedule|programme|program\b|pert|gantt|timeline|baseline/i;
const BOQ_NAME = /boq|bcs|bill of quant|\bbom\b|submission|costing|estimate/i;

/**
 * What the engine can structurally read today. Deliberately conservative: claiming an
 * extractor that then yields nothing is exactly the false assurance this module prevents.
 *
 * The path counts, not just the filename. KOHLER's real BOQ is "KOHLER_PUNE_FS_26TH
 * JUNE_V5.xlsx" — nothing in that name says BOQ; it is the folder "BOQ & Project Plan" that
 * identifies it. Filename-only matching would have shown the project's most important
 * document as unreadable. The filename is checked first so a programme sitting in a BOQ
 * folder is still recognised as a programme.
 */
export function extractorFor(file: DriveFile): Extractor {
  if (kindOf(file) !== 'spreadsheet') return null;
  if (SCHEDULE_NAME.test(file.name)) return 'schedule';
  if (BOQ_NAME.test(file.name)) return 'boq';
  if (SCHEDULE_NAME.test(file.path)) return 'schedule';
  if (BOQ_NAME.test(file.path)) return 'boq';
  return null;
}

/** Plain-English reason a file cannot be structurally extracted. */
export function noExtractorReason(file: DriveFile): string {
  switch (kindOf(file)) {
    case 'spreadsheet':
      return 'Spreadsheet, but the name does not identify it as a BOQ or a programme — use "Prepare by hand" to say which it is.';
    case 'document':
      return `No structural extractor for .${EXT(file.name)} yet — contracts and PDFs are held as evidence, and their dates must be answered in the questions step.`;
    case 'drawing':
      return 'CAD files are held as evidence; drawing registers are tracked in the Design module, not parsed.';
    case 'image':
      return 'Images and video are evidence of site condition; nothing is extracted from them.';
    case 'archive':
      return 'Archives are not opened. Extract it in Drive and rescan if it holds a BOQ or programme.';
    default:
      return 'No structural extractor for this file type.';
  }
}

export interface CoverageRow {
  file: DriveFile;
  /** the required-input slot this document satisfies, if any */
  slot: InputSlot | null;
  extractor: Extractor;
  kind: FileKind;
  state: ReadState;
  /** what came out of it, or why nothing did */
  detail: string;
}

export interface SlotCoverage {
  slot: InputSlot;
  files: number;
  extracted: number;
  /** documents present but nothing structurally extracted from any of them */
  evidenceOnly: boolean;
  present: boolean;
}

export interface Coverage {
  rows: CoverageRow[];
  slots: SlotCoverage[];
  documents: number;
  /** documents that match a required input */
  required: number;
  extracted: number;
  loggedOnly: number;
  dropped: number;
  /** matches a required input, is extractable, and has not been read — the actionable gap */
  extractableNotRead: number;
  /** mandatory inputs with no document at all */
  missingMandatory: string[];
  /** mandatory inputs with documents the engine cannot turn into numbers */
  evidenceOnlyMandatory: string[];
}

/** Per-file decisions the user has made, keyed by DriveFile id. */
export type DocStates = Record<string, { state: ReadState; detail?: string }>;

/**
 * The filename is stronger evidence than the folder it sits in. Matching both at once would
 * label KOHLER's programme as the BOQ, because it lives in a folder called "BOQ & Project
 * Plan". Name first, path only as a fallback.
 */
export function slotFor(file: DriveFile): InputSlot | null {
  return INPUT_SLOTS.find((s) => s.match.test(file.name)) ?? INPUT_SLOTS.find((s) => s.match.test(file.path)) ?? null;
}

export function buildCoverage(scan: DriveScan, states: DocStates = {}): Coverage {
  const rows: CoverageRow[] = scan.files.map((file) => {
    const slot = slotFor(file);
    const extractor = extractorFor(file);
    const saved = states[file.id];
    const state: ReadState = saved?.state ?? 'pending';
    const detail =
      saved?.detail ??
      (state === 'pending'
        ? extractor
          ? `Ready to read as a ${extractor === 'boq' ? 'priced BOQ' : 'programme'}.`
          : noExtractorReason(file)
        : '');
    return { file, slot, extractor, kind: kindOf(file), state, detail };
  });

  const slots: SlotCoverage[] = INPUT_SLOTS.map((slot) => {
    const mine = rows.filter((r) => r.slot?.key === slot.key && r.state !== 'dropped');
    const extracted = mine.filter((r) => r.state === 'extracted').length;
    return { slot, files: mine.length, extracted, evidenceOnly: mine.length > 0 && extracted === 0, present: mine.length > 0 };
  });

  const live = rows.filter((r) => r.state !== 'dropped');
  return {
    rows,
    slots,
    documents: rows.length,
    required: live.filter((r) => r.slot).length,
    extracted: live.filter((r) => r.state === 'extracted').length,
    loggedOnly: live.filter((r) => r.state === 'logged').length,
    dropped: rows.filter((r) => r.state === 'dropped').length,
    extractableNotRead: live.filter((r) => r.extractor && r.state === 'pending').length,
    missingMandatory: slots.filter((s) => s.slot.mandatory && !s.present).map((s) => s.slot.label),
    evidenceOnlyMandatory: slots.filter((s) => s.slot.mandatory && s.evidenceOnly).map((s) => s.slot.label),
  };
}

/**
 * Sort order for the table: the things needing a decision first. Extractable-but-unread is the
 * whole point of the screen, so it sits at the top; dropped files sink to the bottom.
 */
export function coverageRank(r: CoverageRow): number {
  if (r.state === 'dropped') return 9;
  if (r.extractor && r.state === 'pending') return 0;
  if (r.state === 'extracted') return 1;
  if (r.slot?.mandatory && r.state === 'pending') return 2;
  if (r.slot) return 3;
  return 5;
}
