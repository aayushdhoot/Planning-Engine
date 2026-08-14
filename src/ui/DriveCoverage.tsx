// "What is in Drive" — the audit screen. Its whole job is to make it obvious whether the
// engine actually turned each input document into numbers, or merely opened it.
import { Fragment, useMemo, useState } from 'react';
import type { DriveFile, DriveScan } from '../services/drive';
import { buildCoverage, coverageRank, groupCoverage, startsCollapsed, type CoverageRow, type DocStates, type GroupBy, type ReadState } from '../engine/coverage';

const kb = (n: number | null) => (n == null ? '—' : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const STATE_TAG: Record<ReadState, { label: string; cls: string }> = {
  extracted: { label: 'READ', cls: 'ok' },
  logged: { label: 'EVIDENCE ONLY', cls: 'warn' },
  pending: { label: 'NOT READ', cls: 'crit' },
  dropped: { label: 'DROPPED', cls: '' },
};

export function DriveCoverage({
  scan,
  states,
  busy,
  progress,
  onStop,
  onRead,
  onPrepareByHand,
  onDrop,
  onUndrop,
  onRescan,
  onContinue,
  onBack,
}: {
  scan: DriveScan;
  states: DocStates;
  busy: string | null;
  /** how far a multi-document read has got — a 130-photo folder takes long enough that a
   * button stuck on "Reading…" with no count reads as a hang */
  progress?: { done: number; total: number } | null;
  onStop?: () => void;
  onRead: (files: DriveFile[]) => void;
  onPrepareByHand: (file: DriveFile) => void;
  onDrop: (file: DriveFile) => void;
  onUndrop: (file: DriveFile) => void;
  onRescan: (() => void) | null;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('slot');
  // keys the user has explicitly flipped; everything else follows startsCollapsed()
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const cov = useMemo(() => buildCoverage(scan, states), [scan, states]);

  const visible = cov.rows
    .filter((r) => showAll || r.slot || r.extractor)
    .sort((a, b) => coverageRank(a) - coverageRank(b) || a.file.name.localeCompare(b.file.name));

  const groups = useMemo(() => groupCoverage(visible, groupBy), [visible, groupBy]);

  // A group carrying parseable documents starts open; a folder of ninety photographs does not.
  // Tracking only what the user flipped keeps that default alive for groups they never touched,
  // including ones that appear after a rescan.
  const isOpen = (g: (typeof groups)[number]) => (flipped.has(g.key) ? startsCollapsed(g) : !startsCollapsed(g));
  const toggle = (key: string) =>
    setFlipped((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const readable = cov.rows.filter((r) => r.extractor && r.state === 'pending').map((r) => r.file);
  const scannedAt = new Date(scan.scannedAt);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>What is in Drive</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            “{scan.folderName}” · {cov.documents} files · {cov.extracted} read · {cov.extractableNotRead} readable but not read ·
            scanned {Number.isNaN(scannedAt.getTime()) ? '—' : scannedAt.toLocaleTimeString()}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {readable.length > 0 && (
            <button className="primary" disabled={!!busy} onClick={() => onRead(readable)}>
              {busy ? 'Reading…' : `Read all ${readable.length} readable`}
            </button>
          )}
          {busy && progress && (
            <span className="muted mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              {progress.done} / {progress.total} read
            </span>
          )}
          {busy && onStop && <button onClick={onStop} title="Finish the reads already in flight and stop there">Stop reading</button>}
          {onRescan && <button disabled={!!busy} onClick={onRescan}>Scan Drive now</button>}
        </div>
      </div>

      {busy && progress && progress.total > 1 && (
        <div
          aria-label={`Reading ${progress.done} of ${progress.total}`}
          style={{ height: 4, background: 'var(--panel2)', borderRadius: 2, marginBottom: 12, overflow: 'hidden' }}
        >
          <div style={{ width: `${Math.round((100 * progress.done) / Math.max(1, progress.total))}%`, height: '100%', background: 'var(--accent, #2563eb)' }} />
        </div>
      )}

      <div className="cards">
        <div className="card">
          <div className="k">Files in Drive</div>
          <div className="v">{cov.documents}</div>
          <div className="s">{cov.required} match a required input</div>
        </div>
        <div className="card">
          <div className="k">Read into the plan</div>
          <div className="v" style={{ color: 'var(--ok)' }}>{cov.extracted}</div>
          <div className="s">structurally extracted</div>
        </div>
        <div className="card">
          <div className="k">Evidence only</div>
          <div className="v" style={{ color: cov.loggedOnly ? 'var(--warn)' : undefined }}>{cov.loggedOnly}</div>
          <div className="s">opened, but nothing extractable</div>
        </div>
        <div className="card" style={cov.extractableNotRead ? { borderColor: 'var(--warn)', background: 'var(--warn-soft)' } : undefined}>
          <div className="k">Readable but never read</div>
          <div className="v" style={{ color: cov.extractableNotRead ? 'var(--warn)' : undefined }}>{cov.extractableNotRead}</div>
          <div className="s">the engine can parse these — it has not</div>
        </div>
      </div>

      {cov.evidenceOnlyMandatory.length > 0 && (
        <div className="banner" style={{ marginBottom: 14 }}>
          <strong>Held as evidence, not as input:</strong> {cov.evidenceOnlyMandatory.join(', ')}. Documents are present, but the
          engine cannot turn these formats into numbers — anything they contain must be answered in the questions step, or the plan
          will record an assumption instead.
        </div>
      )}
      {/*
        Missing documents are reported, never enforced. A brand guideline, a fit-out manual or a
        DBR is absent from most folders, and a project head who has one waits for nobody: the
        plan is built from what is here, and each gap is carried into the questions step as an
        explicit assumption rather than a silently invented value.
      */}
      {(cov.missingMandatory.length > 0 || cov.missingOptional.length > 0) && (
        <div className="banner" style={{ marginBottom: 14 }}>
          <strong>Not in the folder at all.</strong> The plan is still generated — each of these is recorded as an
          assumption, and can be answered in the questions step or supplied later with “Prepare by hand”.
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {cov.missingMandatory.map((label) => (
              <span key={label} className="tag crit" title="A required input — the plan proceeds, but on an assumption">{label}</span>
            ))}
            {cov.missingOptional.map((label) => (
              <span key={label} className="tag" title="Optional input — frequently absent, and not needed to plan">{label}</span>
            ))}
          </div>
          {cov.missingMandatory.length > 0 && (
            <div className="faint" style={{ fontSize: 11.5, marginTop: 8 }}>
              Red = on the required-input checklist. Grey = optional, and absent from most folders.
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ margin: '0 0 10px' }}>
        <div className="seg">
          <button className={!showAll ? 'on' : ''} onClick={() => setShowAll(false)}>Input documents ({cov.rows.filter((r) => r.slot || r.extractor).length})</button>
          <button className={showAll ? 'on' : ''} onClick={() => setShowAll(true)}>Everything ({cov.documents})</button>
        </div>
        <div className="seg">
          <button className={groupBy === 'slot' ? 'on' : ''} onClick={() => { setGroupBy('slot'); setFlipped(new Set()); }}>By required input</button>
          <button className={groupBy === 'folder' ? 'on' : ''} onClick={() => { setGroupBy('folder'); setFlipped(new Set()); }}>By folder</button>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {groups.length} group{groups.length === 1 ? '' : 's'} · groups holding readable documents open first
        </span>
      </div>

      <div className="tblwrap">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Required input</th>
              <th>Size</th>
              <th>Engine read</th>
              <th>What the engine got</th>
              <th style={{ textAlign: 'right' }}>Do</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const opened = isOpen(g);
              const unreadFiles = g.rows.filter((r) => r.extractor && r.state === 'pending').map((r) => r.file);
              return (
                <Fragment key={g.key}>
                  <tr style={{ background: 'var(--panel2)' }}>
                    <td colSpan={4}>
                      <button
                        style={{ boxShadow: 'none', padding: '2px 8px', marginRight: 8 }}
                        onClick={() => toggle(g.key)}
                      >
                        {opened ? '▾' : '▸'}
                      </button>
                      <strong style={{ fontSize: 12.5 }}>{g.label}</strong>
                      <span className="faint" style={{ fontSize: 11, marginLeft: 8 }}>
                        {g.rows.length} file{g.rows.length === 1 ? '' : 's'}
                        {g.hint && g.hint !== g.label ? ` · ${g.hint}` : ''}
                      </span>
                    </td>
                    <td className="muted" style={{ fontSize: 11.5 }}>
                      {[
                        g.extracted ? `${g.extracted} read` : '',
                        g.logged ? `${g.logged} evidence only` : '',
                        g.readable ? `${g.readable} readable, not read` : '',
                        g.dropped ? `${g.dropped} dropped` : '',
                      ].filter(Boolean).join(' · ') || `${g.pending} not read`}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {unreadFiles.length > 0 && (
                          <button className="primary" disabled={!!busy} onClick={() => onRead(unreadFiles)}>
                            Read {unreadFiles.length}
                          </button>
                        )}
                        <button
                          title="Exclude every document in this group"
                          onClick={() => g.rows.filter((r) => r.state !== 'dropped').forEach((r) => onDrop(r.file))}
                        >
                          Drop group
                        </button>
                      </div>
                    </td>
                  </tr>
                  {opened &&
                    g.rows.map((r) => (
                      <Row
                        key={r.file.id}
                        r={r}
                        busy={busy}
                        onRead={() => onRead([r.file])}
                        onPrepareByHand={() => onPrepareByHand(r.file)}
                        onDrop={() => onDrop(r.file)}
                        onUndrop={() => onUndrop(r.file)}
                      />
                    ))}
                </Fragment>
              );
            })}
            {groups.length === 0 && (
              <tr><td colSpan={6} className="muted">No documents matched the required-input checklist. Switch to “Everything” to see the whole folder.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={onBack}>Back</button>
        <button className="primary" onClick={onContinue}>Continue to project queries</button>
        {cov.extractableNotRead > 0 && (
          <span className="muted" style={{ fontSize: 12 }}>
            {cov.extractableNotRead} readable document(s) still unread — the plan will be built without them.
          </span>
        )}
      </div>
    </>
  );
}

function Row({
  r,
  busy,
  onRead,
  onPrepareByHand,
  onDrop,
  onUndrop,
}: {
  r: CoverageRow;
  busy: string | null;
  onRead: () => void;
  onPrepareByHand: () => void;
  onDrop: () => void;
  onUndrop: () => void;
}) {
  const tag = STATE_TAG[r.state];
  // the gap this screen exists to expose: parseable, and nobody has parsed it
  const highlight = r.extractor && r.state === 'pending';
  return (
    <tr style={highlight ? { background: 'var(--warn-soft)' } : r.state === 'dropped' ? { opacity: 0.5 } : undefined}>
      <td style={{ paddingLeft: 30 }}>
        <strong style={{ fontSize: 12.5 }}>{r.file.name}</strong>
        <div className="faint" style={{ fontSize: 11 }}>{r.file.path}</div>
      </td>
      <td>{r.slot ? <span className={`tag ${r.slot.mandatory ? 'info' : ''}`}>{r.slot.label}</span> : <span className="faint">—</span>}</td>
      <td className="faint mono" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{kb(r.file.sizeBytes)}</td>
      <td><span className={`tag ${tag.cls}`}>{tag.label}</span></td>
      <td className="muted" style={{ fontSize: 11.5, maxWidth: 320 }}>{r.detail}</td>
      <td>
        <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
          {r.state === 'dropped' ? (
            <button onClick={onUndrop}>Restore</button>
          ) : (
            <>
              {/*
                Every file can be read, and re-read, on demand. This used to be disabled for
                anything without a structural extractor, which meant a drawing or a contract
                could never be sent back for another attempt — the one thing you want when a
                document looks like it was not picked up properly.
              */}
              <button
                className={r.extractor ? 'primary' : ''}
                disabled={!!busy}
                title={
                  r.extractor
                    ? 'Fetch this file and parse it into engine inputs'
                    : 'Fetch this file and report exactly what could be extracted from it'
                }
                onClick={onRead}
              >
                {busy === r.file.id ? 'Reading…' : r.state === 'pending' ? 'Read now' : 'Re-read'}
              </button>
              <button onClick={onPrepareByHand} title="Supply this document's contents yourself">Prepare by hand</button>
              <button onClick={onDrop} title="Exclude this document from the plan">Drop reading</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
