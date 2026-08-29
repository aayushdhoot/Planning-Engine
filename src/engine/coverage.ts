// Drive coverage: what is in the folder, versus what the engine actually got out of it.
//
// This exists to answer one question honestly — "is the engine reading all of my input data?"
// A screen that answered it with READ / NOT READ would be worse than no screen at all, because
// the engine can open a contract PDF and extract nothing from it. Reporting that as "read"
// gives false assurance about the one thing the user is checking.
//
// So there are three different successes now:
//   extracted — parsed structurally (BOQ/schedule spreadsheet); numbers from this file are in the plan
//   vision    — read by the vision extraction adapter (site photos); structure, not numbers, feeds the plan
//   logged    — bytes were read, but there is no structural extractor for this type, so
//               nothing reached the plan. The file counts as evidence, not as input.
import type { DriveFile, DriveScan } from '../services/drive';
import { INPUT_SLOTS, type InputSlot } from './intake';

export type ReadState = 'pending' | 'extracted' | 'logged' | 'dropped';

/** Which structural parser, if any, can turn this file into engine inputs. */
export type Extractor = 'boq' | 'boq-pdf' | 'schedule' | 'vision' | 'pdf' | null;

export type FileKind = 'spreadsheet' | 'document' | 'drawing' | 'image' | 'archive' | 'other';

const EXT = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

const SPREADSHEET_EXT = new Set(['xlsx', 'xls', 'csv', 'tsv']);
const DOCUMENT_EXT = new Set(['pdf', 'doc', 'docx', 'txt', 'ppt', 'pptx']);
const DRAWING_EXT = new Set(['dwg', 'dxf', 'rvt', 'skp']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'heic', 'webp', 'mp4', 'mov']);
const ARCHIVE_EXT = new Set(['zip', 'rar', '7z']);
const ALL_KNOWN_EXT = new Set([...SPREADSHEET_EXT, ...DOCUMENT_EXT, ...DRAWING_EXT, ...IMAGE_EXT, ...ARCHIVE_EXT]);

export function kindOf(file: DriveFile): FileKind {
  // A native Google Sheet/Doc/Slide has no file extension in Drive's display name. When we
  // have a real mimeType (OAuth-authenticated scans set this correctly), trust it directly.
  // Defaulted rather than dereferenced: callers legitimately build a DriveFile-shaped object
  // from a filename alone (a hand-supplied upload standing in for a Drive document), and a
  // TypeError here surfaced to the user as "Could not read: Cannot read properties of
  // undefined (reading 'startsWith')" against a perfectly readable PDF.
  const mimeType = file.mimeType ?? '';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'spreadsheet';
  if (mimeType.startsWith('application/vnd.google-apps.')) return 'document';

  const e = EXT(file.name);
  if (SPREADSHEET_EXT.has(e)) return 'spreadsheet';
  if (DOCUMENT_EXT.has(e)) return 'document';
  if (DRAWING_EXT.has(e)) return 'drawing';
  if (IMAGE_EXT.has(e)) return 'image';
  if (ARCHIVE_EXT.has(e)) return 'archive';

  // Public-link scans never carry a mimeType at all (see PublicLinkDriveService.scanFolder in
  // drive.ts) — a native Google Sheet reached that way has no extension AND no mimeType to go
  // on. "No extension" is checked against the set of KNOWN extensions above, not just "does the
  // name contain a dot" — a name like "Final BOQ - 30 Dec 2025_8.75Cr" has a dot in the value,
  // not an extension, and naively splitting on the last dot would read that as extension
  // "75cr" and never reach this branch at all. A no-recognised-extension file whose name or
  // folder already matches a BOQ/schedule keyword is treated as a likely native Sheet: the
  // realistic case in a project folder, and readFile()'s own fallback (docs.google.com export)
  // will actually confirm or fail this guess when the bytes are read, so nothing here is taken
  // on faith alone.
  if (!ALL_KNOWN_EXT.has(e) && (SCHEDULE_NAME.test(file.name) || BOQ_NAME.test(file.name) || SCHEDULE_NAME.test(file.path) || BOQ_NAME.test(file.path)))
    return 'spreadsheet';

  return 'other';
}

const SCHEDULE_NAME = /schedule|programme|program\b|pert|gantt|timeline|baseline/i;
const BOQ_NAME = /boq|bcs|bill of quant|\bbom\b|submission|costing|estimate/i;

// Only formats browser-client.ts can actually send through to the vision model — HEIC (the
// default iPhone photo format) and WEBP are NOT included: extractWithVision only accepts
// image/png and image/jpeg, and browser-client.ts's EXT_MIME map reflects that. Marking a HEIC
// file as vision-extractable here would show it as "ready to read" in the UI and then throw the
// moment someone actually tried — worse than just being honest that it isn't supported yet.
const STILL_IMAGE_EXT = new Set(['png', 'jpg', 'jpeg']);

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
  if (kindOf(file) === 'spreadsheet') {
    if (SCHEDULE_NAME.test(file.name)) return 'schedule';
    if (BOQ_NAME.test(file.name)) return 'boq';
    if (SCHEDULE_NAME.test(file.path)) return 'schedule';
    if (BOQ_NAME.test(file.path)) return 'boq';
    return null;
  }
  // Still images are read by the vision extraction adapter (src/services/extraction) — site
  // photos, hand-marked layouts, make-list photos. Video is excluded: there is no per-frame
  // analysis here, and sending video frames to a vision model is a different, unbuilt feature.
  if (kindOf(file) === 'image' && STILL_IMAGE_EXT.has(EXT(file.name))) return 'vision';
  // PDFs go through that same adapter, one page image per page (see rasterize.ts). There is
  // still no *structural* PDF parser — a rendered page is read exactly as a photograph is —
  // but "held as evidence" was the wrong answer for the brand guideline and the drawing set,
  // which are the two documents a fit-out plan most often has only as a PDF.
  if (kindOf(file) === 'document' && EXT(file.name) === 'pdf') {
    // A priced BOQ issued as a PDF is not evidence, it is THE input the whole plan is costed
    // from. Sent through the generic PDF path it comes back as scope notes and material items
    // and never touches boqPackages, so the folder screen said read while the required-input
    // checklist still said no priced BOQ was present. It gets the transcribing reader instead
    // (services/extraction/boq-vision.ts), whose rows go through the same parseBoq the
    // spreadsheet does. Schedule wins the tie for the same reason it does above: a programme
    // filed in a BOQ folder is still a programme.
    if (!SCHEDULE_NAME.test(file.name) && !SCHEDULE_NAME.test(file.path) && (BOQ_NAME.test(file.name) || BOQ_NAME.test(file.path)))
      return 'boq-pdf';
    return 'pdf';
  }
  return null;
}

const VIDEO_EXT = new Set(['mp4', 'mov']);
const UNSUPPORTED_IMAGE_EXT = new Set(['heic', 'webp']); // valid still images, just not accepted by the vision client yet

/** Plain-English reason a file cannot be structurally extracted. */
export function noExtractorReason(file: DriveFile): string {
  switch (kindOf(file)) {
    case 'spreadsheet':
      return 'Spreadsheet, but the name does not identify it as a BOQ or a programme — use "Prepare by hand" to say which it is.';
    case 'document':
      return `No extractor for .${EXT(file.name)} yet — PDFs are rendered and read, but this format is held as evidence, so anything it contains must be answered in the questions step.`;
    case 'drawing':
      return 'CAD files are held as evidence; drawing registers are tracked in the Design module, not parsed.';
    case 'image':
      if (STILL_IMAGE_EXT.has(EXT(file.name)))
        return 'Should have been read by the vision extraction adapter — if this still shows no extractor, the file may have failed to read; check the read log.';
      if (UNSUPPORTED_IMAGE_EXT.has(EXT(file.name)))
        return `.${EXT(file.name)} isn't accepted by the vision extraction adapter yet (it takes JPEG/PNG) — convert it and re-upload via "Prepare by hand", or rescan once support is added.`;
      if (VIDEO_EXT.has(EXT(file.name)))
        return 'Video is evidence of site condition; nothing is extracted from it (no per-frame analysis).';
      return 'Image, but of an unrecognised format — held as evidence only.';
    case 'archive':
      return 'Archives are not opened. Extract it in Drive and rescan if it holds a BOQ or programme.';
    default:
      return 'No structural extractor for this file type.';
  }
}

/** What each extractor claims it will do, in the user's words rather than the code's. */
const READ_AS: Record<NonNullable<Extractor>, string> = {
  boq: 'priced BOQ',
  'boq-pdf': 'priced BOQ — every page transcribed, then read by the BOQ parser',
  schedule: 'programme',
  vision: 'site image (vision extraction)',
  pdf: 'PDF — every page rendered, then read by vision extraction',
};

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
  /** optional inputs with no document at all — reported for completeness, never a blocker.
   * A brand guideline or a fit-out manual is missing from most folders, and the plan is
   * expected to be built anyway, with the gap recorded rather than silently ignored. */
  missingOptional: string[];
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
      (state === 'pending' ? (extractor ? `Ready to read as a ${READ_AS[extractor]}.` : noExtractorReason(file)) : '');
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
    missingOptional: slots.filter((s) => !s.slot.mandatory && !s.present).map((s) => s.slot.label),
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

// ---------------------------------------------------------------- grouping

/**
 * A folder of ninety site photographs is one decision, not ninety. Listing every file flat made
 * the screen unreadable and buried the two or three documents that actually carry data, so rows
 * are grouped and the group is what you act on.
 */
export interface CoverageGroup {
  key: string;
  label: string;
  /** the folder path, when grouping by folder */
  hint: string;
  rows: CoverageRow[];
  extracted: number;
  logged: number;
  pending: number;
  dropped: number;
  /** files the engine could parse but has not — the reason a group needs attention */
  readable: number;
}

export type GroupBy = 'slot' | 'folder';

/** Parent folder of a file, i.e. its path without the filename. */
export function folderOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : path;
}

export function groupCoverage(rows: CoverageRow[], by: GroupBy): CoverageGroup[] {
  const map = new Map<string, CoverageRow[]>();
  for (const r of rows) {
    const key = by === 'folder' ? folderOf(r.file.path) : (r.slot?.label ?? 'Unclassified');
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }

  const groups: CoverageGroup[] = [...map.entries()].map(([key, list]) => ({
    key,
    label: by === 'folder' ? key.split('/').slice(-1)[0] || key : key,
    hint: by === 'folder' ? key : '',
    rows: list,
    extracted: list.filter((r) => r.state === 'extracted').length,
    logged: list.filter((r) => r.state === 'logged').length,
    pending: list.filter((r) => r.state === 'pending').length,
    dropped: list.filter((r) => r.state === 'dropped').length,
    readable: list.filter((r) => r.extractor && r.state === 'pending').length,
  }));

  // groups holding unread parseable documents come first — those are the ones that change the
  // plan. Everything else falls back to size, so the big evidence folders sink.
  return groups.sort((a, b) => b.readable - a.readable || b.rows.length - a.rows.length || a.label.localeCompare(b.label));
}

/** Groups big enough to be noise start collapsed; a group carrying data does not. */
export function startsCollapsed(g: CoverageGroup): boolean {
  return g.readable === 0 && g.rows.length > 4;
}