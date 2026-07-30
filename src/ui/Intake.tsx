import { useMemo, useRef, useState } from 'react';
import type { Activity, ProjectInputs } from '../domain/types';
import type { DriveFile, DriveScan, DriveService, PickedFile } from '../services/drive';
import { DriveFolderNotPublic, GoogleDriveService, LocalFolderDriveService, ManifestDriveService, PublicLinkDriveService } from '../services/drive';
import { BoqIngestionService } from '../services/ingestion';
import { ScheduleIngestionService } from '../services/schedule-ingestion';
import { buildInventory, buildQueries, unansweredBlocking, type IntakeQuery } from '../engine/intake';
import { extractorFor, noExtractorReason, type DocStates } from '../engine/coverage';
import { DriveCoverage } from './DriveCoverage';

type Step = 'link' | 'drive' | 'queries' | 'done';
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

  const mark = (id: string, state: DocStates[string]['state'], detail?: string) =>
    setDocStates((prev) => ({ ...prev, [id]: { state, detail } }));

  /**
   * Apply the right structural parser to one document's bytes. Anything without an extractor
   * is marked `logged`, never `extracted` — the distinction is the point of the whole screen.
   */
  const applyBytes = (name: string, data: ArrayBuffer | string, id: string, extractor: ReturnType<typeof extractorFor>, viaHand: boolean) => {
    const suffix = viaHand ? ' (supplied by hand)' : '';
    if (extractor === 'boq') {
      const parsed = ingestion.parseBoq({ name, data });
      if (!parsed.packages.length) {
        mark(id, 'logged', `Opened, but no priced package rows were recognised${suffix}. Check it is the summary sheet.`);
        return `✗ ${name} — no packages recognised`;
      }
      setDraftInputs({
        boqPackages: parsed.packages,
        areaSft: parsed.areaSft,
        contractValue: parsed.contractValue,
        bcsValue: parsed.bcsValue,
      });
      const bits = [
        `${parsed.packages.length} packages`,
        parsed.areaSft ? `${parsed.areaSft.value.toLocaleString('en-IN')} sft` : null,
        parsed.contractValue ? inr(parsed.contractValue.value) : null,
        parsed.bcsValue ? 'BCS present' : 'no BCS column',
      ].filter(Boolean);
      mark(id, 'extracted', bits.join(' · ') + suffix);
      return `✓ ${name} — ${bits.join(' · ')}`;
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
    const size = typeof data === 'string' ? data.length : data.byteLength;
    mark(id, 'logged', `Opened (${kb(size)}). ${noExtractorReason({ name } as DriveFile)}`);
    return `• ${name} — evidence only (${kb(size)})`;
  };

  /** Read one or many Drive documents. */
  const readFiles = async (files: DriveFile[]) => {
    if (!scan) return;
    setError(null);
    const log: string[] = [];
    for (const f of files) {
      setReading(files.length === 1 ? f.id : 'all');
      try {
        const data = await service().readFile(f);
        log.push(applyBytes(f.name, data, f.id, extractorFor(f), false));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        mark(f.id, 'pending', `Could not read: ${msg}`);
        log.push(`✗ ${f.name} — ${msg}`);
      }
    }
    setReading(null);
    setReadLog((prev) => [...prev, ...log]);
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
      setReadLog((prev) => [...prev, applyBytes(file.name, data, target.id, extractor, true)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(null);
      byHandFor.current = null;
    }
  };

  const goToQueries = () => {
    if (!scan) return;
    setQueries((qs) => {
      if (qs.length) return qs;
      // Prefill what the documents actually established, so the project head confirms a figure
      // rather than retyping it. Anything not extracted stays blank and still blocks.
      const prefill: Record<string, string> = {};
      if (scheduleStart) prefill.q_start = scheduleStart;
      if (draftInputs.areaSft) prefill.q_area = String(draftInputs.areaSft.value);
      return buildQueries(buildInventory(scan)).map((q) =>
        prefill[q.id] ? { ...q, answer: prefill[q.id], foundHint: q.foundHint ?? 'read from the documents' } : q,
      );
    });
    setStep('queries');
  };

  const answer = (id: string, v: string) => setQueries((qs) => qs.map((q) => (q.id === id ? { ...q, answer: v } : q)));
  const blocking = unansweredBlocking(queries);

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
      contractStart: get('q_start') || scheduleStart,
      contractDurationCalDays: dur ? { value: dur, provenance: 'input', source: src } : null,
      contractValue: draftInputs.contractValue ?? null,
      bcsValue: draftInputs.bcsValue ?? null,
      milestones: [],
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
            These are the things the engine refuses to assume. Blocking questions must be answered before a plan
            is generated — that is deliberate: a confident plan built on guessed dates is worse than no plan.
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
          </div>

          {queries.map((q) => (
            <div key={q.id} className={`qcard ${q.answer.trim() ? 'answered' : ''}`}>
              <div className="q">
                {q.question} {q.blocking ? <span className="tag crit" style={{ marginLeft: 6 }}>blocking</span> : <span className="tag" style={{ marginLeft: 6 }}>optional</span>}
              </div>
              <div className="why">{q.why}{q.foundHint && <> · <em>found in folder: {q.foundHint}</em></>}</div>
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
