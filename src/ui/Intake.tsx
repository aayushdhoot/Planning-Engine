import { useMemo, useRef, useState } from 'react';
import type { Activity, ContractMilestone, DesignReference, MaterialListItem, ProjectInputs, ScopeNote, SiteConditionNote, Traced } from '../domain/types';
import type { DriveFile, DriveScan, DriveService, PickedFile } from '../services/drive';
import { DriveFolderNotPublic, GoogleDriveService, LocalFolderDriveService, ManifestDriveService, PublicLinkDriveService } from '../services/drive';
import { BoqIngestionService } from '../services/ingestion';
import { ScheduleIngestionService } from '../services/schedule-ingestion';
import { applyPrefill, awaitingConfirmation, buildInventory, buildQueries, unansweredBlocking, type FoundAnswer, type IntakeQuery } from '../engine/intake';
import { extractorFor, noExtractorReason, type DocStates } from '../engine/coverage';
import { applyExtractionPatch, type ExtractionPatch } from '../services/extraction/extraction-service';
import { dailyLimitHit, extractBoqRowsViaApi, extractFileViaApi, extractFilesViaApi, firstFailure, ExtractionClientError, type BatchFile } from '../services/extraction/browser-client';
import { mapPool, type PoolProgress } from '../services/extraction/pool';
import { RateGate, DEFAULT_RPM, rateLimitWait } from '../services/extraction/rate-gate';
import { DriveCoverage } from './DriveCoverage';

type Step = 'link' | 'drive' | 'queries' | 'done';

/**
 * Vision reads that may be in flight at once.
 *
 * The ceiling is the provider's per-minute rate limit, not this machine — and the pace is now
 * held by a shared RateGate rather than by this number, which only decides how many can be
 * WAITING on that gate at once. Four still fills the pipe without queueing so deeply that a
 * Stop takes ages to take effect.
 *
 * It was four before too, but each of those four fanned out to up to four page-reads inside its
 * own server call: sixteen concurrent requests against a fifteen-a-minute allowance. The server
 * side now runs pages two at a time and this side paces the whole thing.
 */
const READ_CONCURRENCY = 4;

/** Attempts per file before a rate-limited read is given up on. */
const MAX_READ_ATTEMPTS = 6;

/**
 * Photographs sent in one request.
 *
 * Matches DEFAULT_BATCH on the server, which is where the figure was measured: six real 1024px
 * site photos returned in 3.8s against 5.0s for a single one. The number that matters here is
 * not the model latency though — it is the rate gate. Twelve requests a minute across 144
 * photographs is twelve minutes of queueing; in sixes it is two.
 */
const PHOTOS_PER_CALL = 6;

const DAILY_LIMIT_MESSAGE =
  "Not read — the vision model's daily token allowance is spent. It resets on the provider's schedule; " +
  'the plan can be built without these, and they can be re-read afterwards.';
const ingestion = new BoqIngestionService();
const scheduleIngestion = new ScheduleIngestionService();

const kb = (n: number | null) => (n == null ? '—' : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

export function Intake({
  clientId,
  existingIds,
  onCreate,
  initialUrl = '',
  onUrlChange,
}: {
  clientId: string;
  existingIds: string[];
  onCreate: (p: ProjectInputs) => void;
  /** the project's saved Drive folder, so it can be rescanned without pasting it again */
  initialUrl?: string;
  onUrlChange?: (url: string) => void;
}) {
  const [step, setStep] = useState<Step>('link');
  const [folderUrl, setFolderUrlState] = useState(initialUrl);
  const setFolderUrl = (v: string) => {
    setFolderUrlState(v);
    onUrlChange?.(v);
  };
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** the richer picture: what is in flight, what is waiting to retry, and how long is left */
  const [poolProgress, setPoolProgress] = useState<
    (PoolProgress & { gate: { rpm: number; pausedFor: number; refusals: number; waiting: number } }) | null
  >(null);
  // Refs, not state: both are read from inside an in-flight pool, where a re-rendered closure
  // would still be looking at the value the run started with.
  const cancelRead = useRef(false);
  const dailyLimit = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<DriveScan | null>(null);
  const [mode, setMode] = useState<'google' | 'manifest' | 'local' | 'public'>('local');
  const [docStates, setDocStates] = useState<DocStates>({});
  const [readLog, setReadLog] = useState<string[]>([]);
  const [queries, setQueries] = useState<IntakeQuery[]>([]);
  const [projectName, setProjectName] = useState('');
  const [draftActivities, setDraftActivities] = useState<Activity[]>([]);
  const [scheduleStart, setScheduleStart] = useState<string | null>(null);
  const manifestSvc = useMemo(() => new ManifestDriveService(), []);
  const localSvc = useMemo(() => new LocalFolderDriveService(), []);
  const publicSvc = useMemo(() => new PublicLinkDriveService(), []);
  // "Prepare by hand": the Drive file the user is substituting a local upload for
  const byHandFor = useRef<DriveFile | null>(null);
  const byHandInput = useRef<HTMLInputElement | null>(null);

  const inventory = useMemo(() => (scan ? buildInventory(scan) : null), [scan]);

  const service = (m: typeof mode = mode): DriveService =>
    m === 'google' ? new GoogleDriveService(clientId) : m === 'public' ? publicSvc : m === 'local' ? localSvc : manifestSvc;

  /**
   * Scan a pasted folder link. A folder shared as "anyone with the link" needs no credential
   * at all, so that is tried first and OAuth is only reached for genuinely private folders —
   * the previous behaviour demanded a client ID before it had established that it needed one.
   */
  const doScan = async () => {
    setBusy(true);
    setError(null);
    const accept = (s: DriveScan, m: typeof mode) => {
      setMode(m);
      setScan(s);
      setProjectName((n) => n || s.folderName);
      setStep('drive');
    };
    try {
      try {
        accept(await publicSvc.scanFolder(folderUrl), 'public');
        return;
      } catch (e) {
        // Only a private folder genuinely needs a signed-in account. Anything else — no proxy,
        // a bad link — is reported as itself rather than as "you need an OAuth client ID".
        if (!(e instanceof DriveFolderNotPublic) || !clientId) {
          setError(
            `${e instanceof Error ? e.message : String(e)}${
              e instanceof DriveFolderNotPublic ? ' You can also pick the folder off this computer below.' : ''
            }`,
          );
          return;
        }
      }
      accept(await service('google').scanFolder(folderUrl), 'google');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadLocalFolder = (picked: PickedFile[]) => {
    setError(null);
    try {
      const s = localSvc.loadFolder(picked);
      setMode('local');
      setScan(s);
      setProjectName((n) => n || s.folderName);
      setStep('drive');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const loadManifest = async (f: File) => {
    setError(null);
    try {
      const s = manifestSvc.loadManifest(await f.text());
      setMode('manifest');
      setScan(s);
      setProjectName((n) => n || s.folderName);
      setStep('drive');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const [draftInputs, setDraftInputs] = useState<Partial<ProjectInputs>>({});

  // What the vision extraction adapter has found across every image read so far this session —
  // merged additively via applyExtractionPatch, same as a second document would add to the
  // first. Never overwrites a higher-trust source (Excel/hand-typed answer); see create() below.
  interface ExtractionAccumulator {
    contractStart: string | null;
    contractDurationCalDays: Traced<number> | null;
    contractValue: Traced<number> | null;
    bcsValue: Traced<number> | null;
    milestones: ContractMilestone[];
    siteConditions: SiteConditionNote[];
    materialItems: MaterialListItem[];
    scopeNotes: ScopeNote[];
    designRefs: DesignReference[];
    /** proposed intake answers the documents offered, each carrying its file and clause */
    planningAnswers: FoundAnswer[];
  }
  const [extraction, setExtraction] = useState<ExtractionAccumulator>({
    contractStart: null, contractDurationCalDays: null, contractValue: null, bcsValue: null,
    milestones: [], siteConditions: [], materialItems: [], scopeNotes: [], designRefs: [], planningAnswers: [],
  });

  const mark = (id: string, state: DocStates[string]['state'], detail?: string) =>
    setDocStates((prev) => ({ ...prev, [id]: { state, detail } }));

  /**
   * Turn one document's vision patch into its row and its log line.
   *
   * Lifted out of the single-file read when photographs began travelling six to a request: both
   * paths must reach the identical verdict about a document, and "read but nothing usable" and
   * "never actually read" are the distinction this whole screen exists to keep. Two copies of
   * that judgement would eventually disagree, and the disagreement would be invisible.
   */
  const recordVisionOutcome = (
    name: string,
    id: string,
    patch: ExtractionPatch,
    notes: string[],
    pagesRead: number,
    suffix: string,
  ): string => {
    if (dailyLimitHit(patch)) dailyLimit.current = true;
    const trailer = (notes.length ? ' ' + notes.join(' ') : '') + suffix;
    const wroteSomething =
      patch.siteConditions.length > 0 || patch.materialItems.length > 0 || patch.scopeNotes.length > 0 ||
      patch.designRefs.length > 0 || !!patch.contractStart || !!patch.contractDurationCalDays ||
      !!patch.contractValue || !!patch.bcsValue || patch.milestones.length > 0;
    if (!wroteSomething) {
      // A refusal is not an empty document. Saying "nothing usable was found" about a file
      // the model never actually saw is the false assurance this screen exists to prevent,
      // so a failed read stays pending — i.e. still on the to-do list — and says why.
      const failure = firstFailure(patch);
      if (failure) {
        mark(id, 'pending', `${dailyLimit.current ? DAILY_LIMIT_MESSAGE : `Not read — ${failure}`}${trailer}`);
        return `✗ ${name} — ${dailyLimit.current ? 'daily token allowance spent' : failure}`;
      }
      mark(id, 'logged', `Read by the vision model, but nothing usable was found${trailer}`);
      return `• ${name} — vision extraction found nothing usable`;
    }
    setExtraction((prev) => ({
      ...applyExtractionPatch(prev, patch),
      // applyExtractionPatch only knows the ProjectInputs fields; the proposals ride alongside
      // them, additively, because two documents answering the same question is information.
      planningAnswers: [...prev.planningAnswers, ...(patch.planningAnswers ?? [])],
    }));
    const bits = [
      pagesRead > 1 ? `${pagesRead} pages read` : null,
      patch.siteConditions.length ? `${patch.siteConditions.length} site condition(s)` : null,
      patch.materialItems.length ? `${patch.materialItems.length} material item(s)` : null,
      patch.scopeNotes.length ? `${patch.scopeNotes.length} scope note(s)` : null,
      patch.designRefs.length ? `${patch.designRefs.length} design ref(s)` : null,
      patch.contractStart ? `contract start ${patch.contractStart}` : null,
      patch.milestones.length ? `${patch.milestones.length} milestone(s)` : null,
    ].filter(Boolean);
    mark(id, 'extracted', bits.join(' · ') + trailer);
    return `✓ ${name} — ${bits.join(' · ')} (vision)`;
  };

  /**
   * Apply the right structural parser to one document's bytes. Anything without an extractor
   * is marked `logged`, never `extracted` — the distinction is the point of the whole screen.
   */
  const applyBytes = async (
    name: string,
    data: ArrayBuffer | string,
    id: string,
    extractor: ReturnType<typeof extractorFor>,
    viaHand: boolean,
    filePath: string,
  ): Promise<string> => {
    const suffix = viaHand ? ' (supplied by hand)' : '';

    /**
     * The generic vision read — page images to an ExtractionPatch. Named rather than inlined in
     * its branch because a document that looked like a priced BOQ and turned out not to hold one
     * falls back to it: the make list beside the Keppel BOQ carries the same "BOQ" in its name,
     * and reading it as neither would lose the document entirely.
     */
    const readViaVision = async (kind: 'image' | 'pdf', bytes: ArrayBuffer, extraNotes: string[] = []): Promise<string> => {
      const what = kind === 'pdf' ? 'PDF' : 'image';
      try {
        const { patch, notes, pagesRead } = await extractFileViaApi(name, filePath, bytes, kind);
        return recordVisionOutcome(name, id, patch, [...extraNotes, ...notes], pagesRead, suffix);
      } catch (e) {
        const msg = e instanceof ExtractionClientError ? e.message : e instanceof Error ? e.message : String(e);
        mark(id, 'pending', `Not read${suffix}: ${msg}`);
        return `✗ ${name} — ${what} extraction failed`;
      }
    };

    /** Record one parsed BOQ, whether its rows came from a workbook or off a PDF's pages.
     * Returns null when the document held no priced rows, for the caller to decide about. */
    const acceptBoq = (parsed: ReturnType<typeof ingestion.parseBoq>, trailer: string): string | null => {
      if (!parsed.packages.length) return null;
      // A folder can hold more than one document the BOQ rules match — the priced BOQ itself and
      // a make list derived from it, as in Keppel (Pune). Replacing wholesale meant whichever
      // was read last decided the project's cost, so the fuller reading is the one that stands.
      setDraftInputs((prev) =>
        (prev.boqPackages?.length ?? 0) > parsed.packages.length
          ? prev
          : {
              ...prev,
              boqPackages: parsed.packages,
              areaSft: parsed.areaSft,
              contractValue: parsed.contractValue,
              bcsValue: parsed.bcsValue,
            },
      );
      const bits = [
        `${parsed.packages.length} packages`,
        parsed.areaSft ? `${parsed.areaSft.value.toLocaleString('en-IN')} sft` : null,
        parsed.contractValue ? inr(parsed.contractValue.value) : null,
        parsed.bcsValue ? 'BCS present' : 'no BCS column',
      ].filter(Boolean);
      mark(id, 'extracted', bits.join(' · ') + trailer);
      return `✓ ${name} — ${bits.join(' · ')}`;
    };

    if (extractor === 'boq') {
      const done = acceptBoq(ingestion.parseBoq({ name, data }), suffix);
      if (done) return done;
      mark(id, 'logged', `Opened, but no priced package rows were recognised${suffix}. Check it is the summary sheet.`);
      return `✗ ${name} — no packages recognised`;
    }

    // A priced BOQ that only exists as a PDF: every page transcribed to rows by the vision
    // reader, then handed to the same parser the workbook goes through.
    if (extractor === 'boq-pdf') {
      if (typeof data === 'string') {
        mark(id, 'logged', `Could not read as a PDF${suffix}.`);
        return `✗ ${name} — not readable as a PDF`;
      }
      try {
        const { rows, pageStarts, notes, pagesRead } = await extractBoqRowsViaApi(name, filePath, data);
        // parseBoq traces every package to a row number. Across a stitched-together PDF that
        // number is only checkable against the document if the page it fell on is named too.
        const where = pageStarts.map((p) => `${p.pageLabel} starts at row ${p.row}`).join('; ');
        const parsed = ingestion.parseBoq({ name: `${name} (transcribed from PDF)`, data: rows });
        const trailer = ` · ${pagesRead} page(s) transcribed, ${rows.length} rows${where ? ` (${where})` : ''}${notes.length ? ` ${notes.join(' ')}` : ''}${suffix}`;
        const done = acceptBoq(parsed, trailer);
        if (done) return done;
        // Named like a BOQ, but no priced rows on any page — a make list, a rate card, a scope
        // annexure. Reading it as the photographs are read still gets its material items and
        // scope notes into the plan, which is strictly better than filing it as evidence.
        return readViaVision('pdf', data, [
          `Transcribed ${pagesRead} page(s) looking for a priced BOQ table and found no package rows, so it was read as a document instead.`,
        ]);
      } catch (e) {
        const msg = e instanceof ExtractionClientError ? e.message : e instanceof Error ? e.message : String(e);
        mark(id, 'pending', `Not read${suffix}: ${msg}`);
        return `✗ ${name} — BOQ transcription failed`;
      }
    }
    if (extractor === 'schedule') {
      const parsed = scheduleIngestion.parse({ name, data });
      if (!parsed.activities.length) {
        mark(id, 'logged', `Opened, but no activity rows were recognised${suffix}. ${parsed.warnings[0] ?? ''}`);
        return `✗ ${name} — no activities recognised`;
      }
      setDraftActivities(parsed.activities);
      setScheduleStart(parsed.projectStart);
      const bits = [
        `${parsed.activities.length} activities`,
        `start ${parsed.projectStart}`,
        parsed.durationDays ? `${parsed.durationDays} days` : null,
        parsed.logicConflicts.length ? `${parsed.logicConflicts.length} logic conflicts` : null,
      ].filter(Boolean);
      mark(id, 'extracted', bits.join(' · ') + suffix);
      return `✓ ${name} — ${bits.join(' · ')}`;
    }
    // Photos and PDFs take the same route: both become page images, both are read by the
    // vision model. The only difference is how many pages come out of the file.
    if (extractor === 'vision' || extractor === 'pdf') {
      const what = extractor === 'pdf' ? 'PDF' : 'image';
      if (typeof data === 'string') {
        mark(id, 'logged', `Could not read as an ${what}${suffix}.`);
        return `✗ ${name} — not readable as an ${what}`;
      }
      return readViaVision(extractor === 'pdf' ? 'pdf' : 'image', data);
    }
    const size = typeof data === 'string' ? data.length : data.byteLength;
    mark(id, 'logged', `Opened (${kb(size)}). ${noExtractorReason({ name, mimeType: '' } as DriveFile)}`);
    return `• ${name} — evidence only (${kb(size)})`;
  };

  /**
   * Read one or many Drive documents.
   *
   * Spreadsheets are read first, one at a time: they write the draft inputs the questions step
   * prefills from, and there are never many of them. Everything that goes to the vision model —
   * photos and PDFs — runs through a bounded pool instead, because those are independent
   * network round trips and reading 130 of them serially is what made this step take minutes.
   *
   * Two things stop a run early: the user pressing Stop, and the provider reporting that the
   * day's token allowance is spent. In both cases the untouched files stay "not read" with the
   * reason on the row, rather than being reported as empty.
   */
  const readFiles = async (files: DriveFile[]) => {
    if (!scan) return;
    setError(null);
    cancelRead.current = false;
    dailyLimit.current = false;

    // Photographs go several to a request; everything else keeps its own. A folder is mostly
    // photographs — 144 of the 178 in Keppel (Pune) — and they are the files whose whole cost
    // was the round trip, so this is where batching is worth the coupling. A PDF is already
    // several pages in one request, and a spreadsheet is not read by the model at all.
    const isPhoto = (f: DriveFile) => extractorFor(f) === 'vision';
    const isVisual = (f: DriveFile) => { const e = extractorFor(f); return e === 'vision' || e === 'pdf'; };
    const photos = files.filter(isPhoto);
    const visual = files.filter((f) => isVisual(f) && !isPhoto(f));
    const sequential = files.filter((f) => !isVisual(f));

    const photoGroups: DriveFile[][] = [];
    for (let i = 0; i < photos.length; i += PHOTOS_PER_CALL) photoGroups.push(photos.slice(i, i + PHOTOS_PER_CALL));

    const total = files.length;
    let done = 0;
    const bump = () => setProgress({ done: ++done, total });
    setProgress({ done: 0, total });
    setReading(total === 1 ? files[0].id : 'all');

    // One pace for the whole run. Created per run so a scan does not inherit the slowed-down
    // rate a previous one ended on — the limit may well have cleared since.
    const gate = new RateGate(DEFAULT_RPM);

    /**
     * A rate-limited read THROWS here rather than being swallowed, so the pool can put it back
     * on the queue. Anything else — an unreadable file, a render failure — is recorded and
     * accepted, because retrying it would fail identically six more times.
     */
    class Refused extends Error {}

    const readOne = async (f: DriveFile): Promise<string> => {
      await gate.acquire();
      try {
        const data = await service().readFile(f);
        const line = await applyBytes(f.name, data, f.id, extractorFor(f), false, f.path);
        gate.onSuccess();
        return line;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const rl = rateLimitWait(msg);
        if (rl.daily) { dailyLimit.current = true; mark(f.id, 'pending', DAILY_LIMIT_MESSAGE); throw new Error(msg); }
        if (rl.retry) {
          gate.penalise(rl.waitMs);
          mark(f.id, 'pending', `Rate limited — waiting ${Math.round(rl.waitMs / 1000)}s and trying again.`);
          throw new Refused(msg);
        }
        mark(f.id, 'pending', `Could not read: ${msg}`);
        return `✗ ${f.name} — ${msg}`;
      }
    };

    /**
     * One gate slot, several photographs.
     *
     * The gate paces the whole run at twelve requests a minute, so this is where the time
     * actually went: 144 photographs was twelve minutes of queueing before the model had been
     * asked anything. Six per call is six times fewer slots. The downloads inside a group still
     * run in parallel — those are Drive, not the model, and are not what the gate is for.
     */
    const readGroup = async (group: DriveFile[]): Promise<string[]> => {
      await gate.acquire();
      const loaded: BatchFile[] = [];
      const lines: string[] = [];
      const settled = await Promise.all(
        group.map(async (f) => {
          try {
            return { f, bytes: await service().readFile(f) };
          } catch (e) {
            return { f, err: e instanceof Error ? e.message : String(e) };
          }
        }),
      );
      for (const s of settled) {
        if ('err' in s && s.err) {
          mark(s.f.id, 'pending', `Could not read: ${s.err}`);
          lines.push(`✗ ${s.f.name} — ${s.err}`);
          continue;
        }
        loaded.push({ fileName: s.f.name, filePath: s.f.path, bytes: s.bytes!, kind: 'image' });
      }
      if (!loaded.length) return lines;

      try {
        const byName = await extractFilesViaApi(loaded);
        gate.onSuccess();
        for (const f of group) {
          const got = byName.get(f.name);
          if (!got) continue; // its download failed; already recorded above
          lines.push(recordVisionOutcome(f.name, f.id, got.patch, got.notes, got.pagesRead, ''));
        }
        return lines;
      } catch (e) {
        // The whole group shares one request, so it shares its refusal — each row says so on
        // its own, and a rate limit is re-thrown so the pool can put the group back on the queue.
        const msg = e instanceof ExtractionClientError ? e.message : e instanceof Error ? e.message : String(e);
        const rl = rateLimitWait(msg);
        if (rl.daily) {
          dailyLimit.current = true;
          for (const f of group) mark(f.id, 'pending', DAILY_LIMIT_MESSAGE);
          throw new Error(msg);
        }
        if (rl.retry) {
          gate.penalise(rl.waitMs);
          for (const f of group) mark(f.id, 'pending', `Rate limited — waiting ${Math.round(rl.waitMs / 1000)}s and trying again.`);
          throw new Refused(msg);
        }
        for (const f of group) mark(f.id, 'pending', `Not read: ${msg}`);
        return group.map((f) => `✗ ${f.name} — ${msg}`);
      }
    };

    const log: string[] = [];
    for (const f of sequential) {
      if (cancelRead.current) break;
      log.push(await readOne(f).catch((e) => `✗ ${f.name} — ${e instanceof Error ? e.message : String(e)}`));
      bump();
    }

    const photoResults = await mapPool(photoGroups, readGroup, {
      concurrency: READ_CONCURRENCY,
      onSettled: () => { done += 0; },
      onProgress: (p) => setPoolProgress({ ...p, gate: gate.state() }),
      shouldStop: () => cancelRead.current || dailyLimit.current,
      maxAttempts: MAX_READ_ATTEMPTS,
      retryAfter: (err) => (err instanceof Refused ? Math.max(500, gate.state().pausedFor) : null),
    });

    photoResults.forEach((r, i) => {
      const group = photoGroups[i];
      if (r.status === 'done') {
        log.push(...r.value);
        done += group.length;
        setProgress({ done, total });
        return;
      }
      const why = dailyLimit.current ? DAILY_LIMIT_MESSAGE : 'Not read — reading was stopped before this file was reached.';
      for (const f of group) {
        mark(f.id, 'pending', why);
        log.push(`• ${f.name} — ${dailyLimit.current ? 'daily token allowance spent' : 'stopped before this file'}`);
      }
      done += group.length;
      setProgress({ done, total });
    });

    const results = await mapPool(visual, readOne, {
      concurrency: READ_CONCURRENCY,
      onSettled: bump,
      onProgress: (p) => setPoolProgress({ ...p, gate: gate.state() }),
      shouldStop: () => cancelRead.current || dailyLimit.current,
      maxAttempts: MAX_READ_ATTEMPTS,
      // Only a refusal comes back. Everything else has already been recorded on its row.
      retryAfter: (err) => (err instanceof Refused ? Math.max(500, gate.state().pausedFor) : null),
    });

    results.forEach((r, i) => {
      const f = visual[i];
      if (r.status === 'done') {
        log.push(r.value);
        return;
      }
      const why = dailyLimit.current ? DAILY_LIMIT_MESSAGE : 'Not read — reading was stopped before this file was reached.';
      mark(f.id, 'pending', why);
      log.push(`• ${f.name} — ${dailyLimit.current ? 'daily token allowance spent' : 'stopped before this file'}`);
    });

    setReading(null);
    setProgress(null);
    setPoolProgress(null);
    setReadLog((prev) => [...prev, ...log]);
    if (dailyLimit.current)
      setError(
        "The vision model's daily token allowance is spent, so the remaining documents were left unread. " +
          'Everything already read is kept, and the plan can be generated without the rest — re-read them once the allowance resets.',
      );
  };

  /** Abandon the rest of a long read. In-flight requests finish; nothing new is dispatched. */
  const stopReading = () => {
    cancelRead.current = true;
  };

  /** "Prepare by hand" — substitute a local upload for a Drive document the engine cannot fetch or parse. */
  const prepareByHand = (f: DriveFile) => {
    byHandFor.current = f;
    byHandInput.current?.click();
  };

  const onByHandFile = async (file: File) => {
    const target = byHandFor.current;
    if (!target) return;
    setError(null);
    setReading(target.id);
    try {
      const isText = /\.(csv|tsv|txt)$/i.test(file.name);
      const data = isText ? await file.text() : await file.arrayBuffer();
      // classify by what the user actually uploaded, not by the Drive file it replaces
      const extractor = extractorFor({ ...target, name: file.name });
      const logLine = await applyBytes(file.name, data, target.id, extractor, true, target.path);
      setReadLog((prev) => [...prev, logLine]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(null);
      byHandFor.current = null;
    }
  };

  /**
   * Everything the folder proposed for the twelve questions, best source first.
   *
   * Order is the whole of the precedence rule: applyPrefill takes the first usable proposal and
   * files the rest as conflicts, so a figure parsed structurally out of a spreadsheet must come
   * ahead of the same figure read off a page by the vision model. A BOQ's area cell is not a
   * better-worded version of a model's guess at the area — it is the number itself.
   */
  const proposedAnswers = (): FoundAnswer[] => {
    const found: FoundAnswer[] = [];

    if (scheduleStart) found.push({ key: 'start', value: scheduleStart, source: 'the ingested programme' });
    else if (extraction.contractStart) found.push({ key: 'start', value: extraction.contractStart, source: 'the contract, vision extraction' });

    if (draftInputs.areaSft) found.push({ key: 'area', value: String(draftInputs.areaSft.value), source: draftInputs.areaSft.source });
    if (extraction.contractDurationCalDays)
      found.push({ key: 'duration', value: String(extraction.contractDurationCalDays.value), source: extraction.contractDurationCalDays.source });

    // Milestones are structured by the time they get here; rendering them back to a sentence is
    // what the question actually asks for, and keeps the person confirming one thing, not twelve.
    if (extraction.milestones.length)
      found.push({
        key: 'milestones',
        value: extraction.milestones.map((m) => `${m.code}: ${m.percent}% at day ${m.dayOffset}${m.description ? ` (${m.description})` : ''}`).join('; '),
        source: 'the payment terms, vision extraction',
      });

    // The model's own reads come last, and keep the file and clause they were read from.
    found.push(...extraction.planningAnswers);
    return found;
  };

  const goToQueries = () => {
    if (!scan) return;
    setQueries((qs) => (qs.length ? qs : applyPrefill(buildQueries(buildInventory(scan)), proposedAnswers())));
    setStep('queries');
  };

  /** Re-read the folder's proposals into the existing question list, keeping anything already
   * confirmed or typed. Used after reading more documents without starting over. */
  const refreshPrefill = () =>
    setQueries((qs) => applyPrefill(qs.map((q) => (q.prefill && !q.confirmed ? { ...q, answer: '', prefill: undefined } : q)), proposedAnswers()));

  const confirm = (id: string, on: boolean) => setQueries((qs) => qs.map((q) => (q.id === id ? { ...q, confirmed: on } : q)));
  const confirmAll = () => setQueries((qs) => qs.map((q) => (q.prefill && q.answer.trim() ? { ...q, confirmed: true } : q)));

  // Editing a proposed value confirms it. Someone who retypes a figure has taken ownership of
  // it just as surely as someone who ticked the box, and making them do both would be a toll.
  const answer = (id: string, v: string) => setQueries((qs) => qs.map((q) => (q.id === id ? { ...q, answer: v, confirmed: q.prefill ? true : q.confirmed } : q)));
  const blocking = unansweredBlocking(queries);
  const toConfirm = awaitingConfirmation(queries).filter((q) => q.answer.trim());

  const create = () => {
    const get = (id: string) => queries.find((q) => q.id === id)?.answer.trim() ?? '';
    const num = (id: string) => {
      const n = Number(get(id).replace(/[, ]/g, ''));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const src = `intake: answered by project head on ${new Date().toISOString().slice(0, 10)}`;
    const area = num('q_area');
    const dur = num('q_duration');
    let id = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new-project';
    while (existingIds.includes(id)) id = `${id}-2`;

    onCreate({
      id,
      name: projectName || 'New project',
      client: projectName || '—',
      location: scan?.folderName ?? '—',
      areaSft: area ? { value: area, provenance: 'input', source: src } : null,
      // an ingested programme carries its own commencement date; the answer only fills the gap
      contractStart: get('q_start') || scheduleStart || extraction.contractStart,
      contractDurationCalDays: dur ? { value: dur, provenance: 'input', source: src } : extraction.contractDurationCalDays,
      contractValue: draftInputs.contractValue ?? extraction.contractValue,
      bcsValue: draftInputs.bcsValue ?? extraction.bcsValue,
      milestones: extraction.milestones,
      boqPackages: draftInputs.boqPackages ?? [],
      scheduleActivities: draftActivities,
      provided: {
        boq: (draftInputs.boqPackages?.length ?? 0) > 0,
        contract: !!get('q_start'),
        layout: inventory?.slots.find((s) => s.slot.key === 'layout')?.present ?? false,
        drawings: inventory?.slots.find((s) => s.slot.key === 'drawings')?.present ?? false,
        day0Images: inventory?.slots.find((s) => s.slot.key === 'day0Images')?.present ?? false,
        design3d: inventory?.slots.find((s) => s.slot.key === 'design3d')?.present ?? false,
        salesKt: inventory?.slots.find((s) => s.slot.key === 'salesKt')?.present ?? false,
        makeList: inventory?.slots.find((s) => s.slot.key === 'makeList')?.present ?? false,
        paymentTerms: !!get('q_milestones'),
      },
      ldPercentPerWeek: null,
      ldCapPercent: null,
      dlpMonths: null,
      siteConditions: extraction.siteConditions,
      materialItems: extraction.materialItems,
      scopeNotes: extraction.scopeNotes,
      designRefs: extraction.designRefs,
    });
    setStep('done');
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        {(['link', 'drive', 'queries'] as Step[]).map((s, i) => (
          <span key={s} className={`tag ${step === s ? 'info' : ''}`}>{i + 1}. {s === 'link' ? 'Link Drive' : s === 'drive' ? 'What is in Drive' : 'Project queries'}</span>
        ))}
      </div>

      {error && <div className="banner">{error}</div>}

      {/* hidden input backing every row's "Prepare by hand" */}
      <input
        ref={byHandInput}
        type="file"
        accept=".xlsx,.xls,.csv,.tsv,.txt"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void onByHandFile(f);
        }}
      />

      {step === 'link' && (
        <>
          <h2>Link a Google Drive folder</h2>
          <p className="muted" style={{ maxWidth: 780, marginTop: -4 }}>
            The engine scans the folder, lists every document against the required-input checklist, and shows you
            exactly what it could and could not read. No plan is produced until the project head has answered the
            intake questions.
          </p>

          <h3 style={{ marginTop: 18 }}>Paste the project folder link</h3>
          <div className="row">
            <div className="field" style={{ minWidth: 460 }}>
              <label>Drive folder link or ID</label>
              <input value={folderUrl} onChange={(e) => setFolderUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" />
            </div>
            <button className="primary" disabled={busy || !folderUrl.trim()} onClick={() => void doScan()}>
              {busy ? 'Scanning…' : 'Scan Drive folder'}
            </button>
          </div>
          <div className="banner ok" style={{ marginTop: 12, maxWidth: 900 }}>
            A folder shared as <strong>“Anyone with the link”</strong> needs no Google account, no OAuth client ID and
            no API key — paste it and scan. Only a genuinely private folder needs the sign-in below.
            {clientId ? ' An OAuth client ID is configured, so private folders work too.' : ''}
          </div>

          <h3 style={{ marginTop: 22 }}>Or read the folder from this computer</h3>
          <div className="row">
            <input
              type="file"
              multiple
              ref={(el) => {
                // not in the React DOM typings, but every Chromium/WebKit browser supports it
                if (el) { el.setAttribute('webkitdirectory', ''); el.setAttribute('directory', ''); }
              }}
              onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) loadLocalFolder(fs); }}
            />
            <span className="muted" style={{ fontSize: 12, maxWidth: 620 }}>
              If you run <strong>Google Drive for Desktop</strong>, your Drive folder is already on this Mac — picking
              it there reads the live folder. Contents stay on this machine; nothing is uploaded.
            </span>
          </div>

          <details style={{ marginTop: 22 }}>
            <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
              Private folders — one-time Google sign-in setup {clientId ? '(configured)' : '(not configured)'}
            </summary>
            <div className={`banner ${clientId ? 'ok' : 'info'}`} style={{ marginTop: 10 }}>
              {clientId ? (
                <>OAuth client ID configured. Private folders can be scanned once you approve access.</>
              ) : (
                <>
                  <p style={{ margin: '0 0 6px' }}>
                    Only needed for folders that are <em>not</em> shared by link. Google requires a client ID for any
                    app that reads private Drive files; it is free and one-time:
                  </p>
                  <ol style={{ margin: '0 0 6px 18px', padding: 0, lineHeight: 1.7 }}>
                    <li>Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">console.cloud.google.com</a> and create a project.</li>
                    <li><a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">Enable the Google Drive API</a>.</li>
                    <li><strong><a href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noreferrer">Google Auth Platform → Branding</a></strong> → app name + support email.</li>
                    <li><strong><a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer">Audience</a></strong> → <em>Internal</em> for a Workspace account, else <em>External</em> + yourself under <strong>Test users</strong>.</li>
                    <li><strong><a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Clients → Create client</a> → Web application</strong>.</li>
                    <li><strong>Authorised JavaScript origins</strong> → <code>{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}</code></li>
                    <li>Paste the client ID into <strong>Settings → Google Drive access</strong>.</li>
                  </ol>
                  <span className="muted">Scope is <code>drive.readonly</code> — list and read, never write or delete.</span>
                </>
              )}
            </div>
          </details>

          <details style={{ marginTop: 12 }}>
            <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>Import a folder manifest (JSON)</summary>
            <div className="row" style={{ marginTop: 10 }}>
              <input type="file" accept=".json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadManifest(f); }} />
              <span className="muted" style={{ fontSize: 12, maxWidth: 620 }}>
                Lists documents but carries no contents, so nothing can be parsed from it.
              </span>
            </div>
          </details>
        </>
      )}

      {step === 'drive' && scan && (
        <>
          {(scan.notes ?? []).map((n, i) => (
            <div key={i} className="banner" style={{ marginBottom: 12 }}>{n}</div>
          ))}
          <DriveCoverage
            scan={scan}
            states={docStates}
            busy={reading}
            progress={poolProgress ?? progress}
            onStop={stopReading}
            onRead={(files) => void readFiles(files)}
            onPrepareByHand={prepareByHand}
            onDrop={(f) => mark(f.id, 'dropped', 'Excluded by you. It will not be read, and the required input it matched now counts as uncovered.')}
            onUndrop={(f) => setDocStates((prev) => { const n = { ...prev }; delete n[f.id]; return n; })}
            onRescan={mode === 'google' ? () => void doScan() : null}
            onContinue={goToQueries}
            onBack={() => setStep('link')}
          />
        </>
      )}

      {step === 'queries' && (
        <>
          <h2>Questions for the project head</h2>
          <p className="muted" style={{ marginTop: -4, maxWidth: 780 }}>
            These are the things the engine refuses to assume. Anything the folder actually states is filled in
            already, with the document and clause it came from — check those and tick to confirm. Blocking questions
            must be answered before a plan is generated, and a proposal is not an answer until someone accepts it:
            a confident plan built on guessed dates is worse than no plan.
          </p>

          {readLog.length > 0 && (
            <div className="banner ok" style={{ marginTop: 14 }}>
              <strong>Read log</strong>
              <ul>{readLog.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}

          <div className="row" style={{ margin: '14px 0' }}>
            <div className="field" style={{ minWidth: 340 }}>
              <label>Project name</label>
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </div>
            <span className={`tag ${blocking.length ? 'crit' : 'ok'}`}>{blocking.length ? `${blocking.length} blocking question(s) unanswered` : 'all blocking questions answered'}</span>
            {toConfirm.length > 0 && (
              <>
                <span className="tag warn">{toConfirm.length} read from the documents, awaiting confirmation</span>
                <button onClick={confirmAll}>Confirm all {toConfirm.length} →</button>
              </>
            )}
            <button onClick={refreshPrefill} title="Re-read the answers the documents proposed, keeping anything already confirmed or typed">
              Re-read from documents
            </button>
          </div>

          {queries.map((q) => (
            <div key={q.id} className={`qcard ${q.prefill && !q.confirmed ? 'proposed' : q.answer.trim() ? 'answered' : ''}`}>
              <div className="q">
                {q.question} {q.blocking ? <span className="tag crit" style={{ marginLeft: 6 }}>blocking</span> : <span className="tag" style={{ marginLeft: 6 }}>optional</span>}
                {q.prefill && (
                  <span className={`tag ${q.confirmed ? 'ok' : 'warn'}`} style={{ marginLeft: 6 }}>
                    {q.confirmed ? 'confirmed' : 'read from documents — confirm'}
                  </span>
                )}
              </div>
              <div className="why">{q.why}{q.foundHint && <> · <em>found in folder: {q.foundHint}</em></>}</div>
              {q.prefill && (
                <div className="read-from">
                  Read from <em>{q.prefill.sources.join('; ')}</em>.
                  {q.prefill.rawOnly && (
                    <> The folder says {q.prefill.rawOnly}, which could not be turned into a {q.kind === 'choice' ? 'choice from the list' : q.kind}. Set it below.</>
                  )}
                  {q.prefill.conflicts?.length && (
                    <> <strong>Another document says {q.prefill.conflicts.join('; ')}</strong> — check which is current before confirming.</>
                  )}
                </div>
              )}
              {q.kind === 'choice' ? (
                <select value={q.answer} onChange={(e) => answer(q.id, e.target.value)} style={{ minWidth: 320 }}>
                  <option value="">— select —</option>
                  {q.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : q.kind === 'date' ? (
                <input type="date" value={q.answer} onChange={(e) => answer(q.id, e.target.value)} />
              ) : q.kind === 'number' ? (
                <input type="number" value={q.answer} onChange={(e) => answer(q.id, e.target.value)} style={{ width: 200 }} />
              ) : (
                <textarea value={q.answer} onChange={(e) => answer(q.id, e.target.value)} rows={2} style={{ width: '100%', maxWidth: 780 }} />
              )}
              {q.prefill && q.answer.trim() && (
                <label className="confirm">
                  <input type="checkbox" checked={!!q.confirmed} onChange={(e) => confirm(q.id, e.target.checked)} />
                  {q.confirmed ? 'Confirmed — this is the value the plan will use.' : 'Tick to confirm this is right, or edit it above.'}
                </label>
              )}
            </div>
          ))}

          <div className="row" style={{ marginTop: 16 }}>
            <button onClick={() => setStep('drive')}>Back</button>
            <button className="primary" disabled={blocking.length > 0} onClick={create}>Create project</button>
            {blocking.length > 0 && <span className="muted" style={{ fontSize: 12 }}>Answer the blocking questions to continue.</span>}
          </div>
        </>
      )}

      {step === 'done' && (
        <div className="banner ok">
          <strong>Project created.</strong> It is now in the project switcher. Upload its priced BOQ in Settings
          if it was not parsed during intake, and the engine will derive the WBS and full plan.
        </div>
      )}
    </>
  );
}