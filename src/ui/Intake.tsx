import { useMemo, useState } from 'react';
import type { ProjectInputs } from '../domain/types';
import type { DriveFile, DriveScan, DriveService, PickedFile } from '../services/drive';
import { GoogleDriveService, LocalFolderDriveService, ManifestDriveService } from '../services/drive';
import { BoqIngestionService } from '../services/ingestion';
import { buildInventory, buildQueries, unansweredBlocking, type IntakeQuery } from '../engine/intake';

type Step = 'link' | 'inventory' | 'permission' | 'queries' | 'done';
const ingestion = new BoqIngestionService();

const kb = (n: number | null) => (n == null ? '—' : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function Intake({ clientId, existingIds, onCreate }: { clientId: string; existingIds: string[]; onCreate: (p: ProjectInputs) => void }) {
  const [step, setStep] = useState<Step>('link');
  const [folderUrl, setFolderUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<DriveScan | null>(null);
  const [mode, setMode] = useState<'google' | 'manifest' | 'local'>('local');
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [readLog, setReadLog] = useState<string[]>([]);
  const [queries, setQueries] = useState<IntakeQuery[]>([]);
  const [projectName, setProjectName] = useState('');
  const manifestSvc = useMemo(() => new ManifestDriveService(), []);
  const localSvc = useMemo(() => new LocalFolderDriveService(), []);

  const inventory = useMemo(() => (scan ? buildInventory(scan) : null), [scan]);

  const service = (m: typeof mode = mode): DriveService =>
    m === 'google' ? new GoogleDriveService(clientId) : m === 'local' ? localSvc : manifestSvc;

  const doScan = async () => {
    if (!clientId) {
      setError(
        'Live scanning needs a Google OAuth client ID, which is not configured yet — see the setup steps ' +
          'below. Option A above reads the same folder off this computer with no Google setup at all.'
      );
      return;
    }
    setBusy(true);
    setError(null);
    // scanning by link is always the Google path, whatever was used before
    setMode('google');
    try {
      const s = await service('google').scanFolder(folderUrl);
      setScan(s);
      setProjectName((n) => n || s.folderName);
      setStep('inventory');
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
      setStep('inventory');
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
      setStep('inventory');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const readApproved = async () => {
    if (!scan) return;
    setBusy(true);
    setError(null);
    const log: string[] = [];
    let boqApplied = false;
    let draft: Partial<ProjectInputs> = {};
    try {
      for (const f of scan.files.filter((x) => approved.has(x.id))) {
        try {
          const data = await service().readFile(f);
          if (/\.(xlsx|xls|csv)$/i.test(f.name) && /boq|bcs|bom|submission/i.test(f.name) && !boqApplied) {
            const parsed = ingestion.parseBoq({ name: f.name, data });
            draft = {
              boqPackages: parsed.packages,
              areaSft: parsed.areaSft,
              contractValue: parsed.contractValue,
              bcsValue: parsed.bcsValue,
            };
            boqApplied = true;
            log.push(`✓ ${f.name} — parsed ${parsed.packages.length} packages${parsed.warnings.length ? `; ${parsed.warnings.length} parser note(s)` : ''}`);
          } else {
            log.push(`• ${f.name} — read (${kb(data.byteLength)}), no structured extractor for this type yet`);
          }
        } catch (e) {
          log.push(`✗ ${f.name} — ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      setReadLog(log);
      setDraftInputs(draft);
      setQueries(buildQueries(buildInventory(scan)));
      setStep('queries');
    } finally {
      setBusy(false);
    }
  };

  const [draftInputs, setDraftInputs] = useState<Partial<ProjectInputs>>({});

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
      contractStart: get('q_start') || null,
      contractDurationCalDays: dur ? { value: dur, provenance: 'input', source: src } : null,
      contractValue: draftInputs.contractValue ?? null,
      bcsValue: draftInputs.bcsValue ?? null,
      milestones: [],
      boqPackages: draftInputs.boqPackages ?? [],
      scheduleActivities: [],
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
        {(['link', 'inventory', 'permission', 'queries'] as Step[]).map((s, i) => (
          <span key={s} className={`tag ${step === s ? 'info' : ''}`}>{i + 1}. {s === 'link' ? 'Link Drive' : s === 'inventory' ? 'Document inventory' : s === 'permission' ? 'Read permission' : 'Project queries'}</span>
        ))}
      </div>

      {error && <div className="banner">{error}</div>}

      {step === 'link' && (
        <>
          <h2>Link a Google Drive folder</h2>
          <p className="muted" style={{ maxWidth: 760, marginTop: -4 }}>
            The engine scans the folder first and lists what it found against the required-input checklist.
            Nothing is read until you approve it, and no plan is produced until the project head has answered
            the intake questions.
          </p>
          <h3 style={{ marginTop: 18 }}>Option A — read the folder from this computer (works right now)</h3>
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
              Pick the project folder. If you run <strong>Google Drive for Desktop</strong>, your Drive folder is
              already on this Mac (under <code>~/Google Drive</code> or <code>~/Library/CloudStorage/…</code>) — pick
              it there and you are reading the live Drive folder. Otherwise open the folder in Drive and
              <strong> Download</strong> it first. Contents stay on this machine; nothing is uploaded.
            </span>
          </div>

          <h3 style={{ marginTop: 22 }}>Option B — paste a Drive link (needs a one-time Google setup)</h3>
          <div className="row">
            <div className="field" style={{ minWidth: 440 }}>
              <label>Drive folder link or ID</label>
              <input value={folderUrl} onChange={(e) => setFolderUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" />
            </div>
            <button
              className="primary"
              disabled={busy || !folderUrl.trim()}
              title={!clientId ? 'No Google OAuth client ID configured yet — click to see what to do' : undefined}
              onClick={() => void doScan()}
            >
              {busy ? 'Scanning…' : 'Scan Drive folder'}
            </button>
          </div>

          {!clientId ? (
            <div className="banner info" style={{ marginTop: 14 }}>
              <strong>Live scanning is off — no Google OAuth client ID configured.</strong>
              <p style={{ margin: '8px 0 6px' }}>
                Google requires a client ID for any app that reads private Drive files. It is a one-time,
                five-minute setup and costs nothing:
              </p>
              <ol style={{ margin: '0 0 6px 18px', padding: 0, lineHeight: 1.7 }}>
                <li>Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">console.cloud.google.com</a> and create a project (or pick an existing one).</li>
                <li><a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">Enable the Google Drive API</a> on that project.</li>
                <li><strong><a href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noreferrer">Google Auth Platform → Branding</a></strong> → app name + support email. (This replaced the old “OAuth consent screen” page.)</li>
                <li><strong><a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer">Audience</a></strong> → <em>Internal</em> if you sign in with a Flipspaces Workspace account, otherwise <em>External</em> and add your own Google address under <strong>Test users</strong>.</li>
                <li><strong><a href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Clients → Create client</a> → Web application</strong>.</li>
                <li>Under <strong>Authorised JavaScript origins</strong> add exactly: <code>{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}</code></li>
                <li>Copy the client ID (ends in <code>.apps.googleusercontent.com</code>) and paste it into <strong>Settings → Google Drive access</strong>.</li>
              </ol>
              <p style={{ margin: '6px 0 0' }} className="muted">
                Scope requested is <code>drive.readonly</code> — the engine can list and read, never write or delete.
                Google classes it as restricted, so an <em>External</em> app in Testing mode shows an “unverified app”
                warning: click <strong>Advanced → Go to…</strong>. No Google review is needed while it stays in Testing.
                If you open this app from a file (<code>file://</code>), Google will reject the origin; run <code>npm run dev</code> instead.
              </p>
            </div>
          ) : (
            <div className="banner ok" style={{ marginTop: 14 }}>
              OAuth client ID configured. Paste a folder link above and the engine will scan it live.
            </div>
          )}

          <h3 style={{ marginTop: 22 }}>Option C — import a folder manifest</h3>
          <div className="row">
            <input type="file" accept=".json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadManifest(f); }} />
            <span className="muted" style={{ fontSize: 12, maxWidth: 620 }}>
              A JSON file with a <code>files[]</code> array of {'{ id, name, mimeType, sizeBytes, path }'}. Lists the
              documents but carries no contents, so the BOQ cannot be parsed — use Option A if you have the files.
            </span>
          </div>
        </>
      )}

      {step === 'inventory' && inventory && (
        <>
          <h2>Documents found in “{scan!.folderName}”</h2>
          {(scan!.notes ?? []).map((n, i) => (
            <div key={i} className="banner" style={{ marginBottom: 12 }}>{n}</div>
          ))}
          <div className="cards">
            <div className="card"><div className="k">Files</div><div className="v">{scan!.files.length}</div></div>
            <div className="card"><div className="k">Checklist matched</div><div className="v">{inventory.slots.filter((s) => s.present).length} / {inventory.slots.length}</div></div>
            <div className="card"><div className="k">Mandatory missing</div><div className="v" style={{ color: inventory.mandatoryMissing.length ? 'var(--crit)' : 'var(--ok)' }}>{inventory.mandatoryMissing.length}</div></div>
            <div className="card"><div className="k">Unclassified</div><div className="v">{inventory.unmatched.length}</div></div>
          </div>

          <div className="tblwrap">
            <table>
              <thead><tr><th style={{ width: 30 }}></th><th>Required input</th><th>Mandatory</th><th>Matched documents</th></tr></thead>
              <tbody>{inventory.slots.map((s) => (
                <tr key={s.slot.key}>
                  <td>{s.present ? <span className="tag ok">✓</span> : s.slot.mandatory ? <span className="tag crit">!</span> : <span className="faint">—</span>}</td>
                  <td><strong>{s.slot.label}</strong><div className="faint" style={{ fontSize: 11.5 }}>{s.slot.hint}</div></td>
                  <td>{s.slot.mandatory ? <span className="tag warn">Mandatory</span> : <span className="tag">Optional</span>}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{s.matches.length ? s.matches.map((m) => m.name).join(' · ') : <span className="faint">not found</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button onClick={() => setStep('link')}>Back</button>
            <button className="primary" onClick={() => { setApproved(new Set(scan!.files.filter((f) => /\.(xlsx|xls|csv|pdf)$/i.test(f.name)).map((f) => f.id))); setStep('permission'); }}>
              Continue to read permission
            </button>
            {mode === 'google' && <button onClick={() => void doScan()} disabled={busy}>Rescan folder</button>}
          </div>
        </>
      )}

      {step === 'permission' && scan && (
        <>
          <h2>Approve which files the engine may read</h2>
          <p className="muted" style={{ marginTop: -4, maxWidth: 760 }}>
            Scanning only listed names. Reading opens file contents. Approve the documents you want parsed —
            spreadsheets are extracted structurally, other formats are recorded as evidence.
          </p>
          <div className="row" style={{ margin: '12px 0' }}>
            <button onClick={() => setApproved(new Set(scan.files.map((f) => f.id)))}>Select all</button>
            <button onClick={() => setApproved(new Set())}>Select none</button>
            <span className="muted" style={{ fontSize: 12 }}>{approved.size} of {scan.files.length} approved</span>
          </div>
          <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
            {scan.files.map((f: DriveFile) => (
              <label key={f.id} className="filebar">
                <input type="checkbox" style={{ width: 16, boxShadow: 'none' }} checked={approved.has(f.id)}
                  onChange={(e) => setApproved((prev) => { const n = new Set(prev); if (e.target.checked) n.add(f.id); else n.delete(f.id); return n; })} />
                <span className="nm">{f.name}<div className="faint" style={{ fontSize: 11 }}>{f.path}</div></span>
                <span className="faint mono" style={{ fontSize: 11.5 }}>{kb(f.sizeBytes)}</span>
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button onClick={() => setStep('inventory')}>Back</button>
            <button className="primary" disabled={busy || approved.size === 0} onClick={() => void readApproved()}>
              {busy ? 'Reading…' : `Read ${approved.size} file(s) and generate queries`}
            </button>
          </div>
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
            <button onClick={() => setStep('permission')}>Back</button>
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
