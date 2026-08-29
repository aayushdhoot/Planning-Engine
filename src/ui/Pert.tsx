import { useMemo, useState } from 'react';
import type { PertCategory, PertNode, PertTree } from '../domain/pert';
import { PERT_CATEGORIES, descendantIds, flattenPert } from '../domain/pert';

const DAY = 86400000;
const iso = (s: string) => Date.parse(s + 'T00:00:00Z');
const fmt = (s: string | null) => (s ? new Date(iso(s)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }) : '—');

/** How much of the programme to show. The tree's own levels do the work. */
type Depth = 'wbs' | 'summary' | 'activity';
const DEPTHS: { key: Depth; label: string; hint: string }[] = [
  { key: 'wbs', label: 'WBS level', hint: 'work breakdown only — project and its four streams' },
  { key: 'summary', label: 'Summary level', hint: 'summary rows — each stream broken into its sections' },
  { key: 'activity', label: 'Activity level', hint: 'every activity, collapsible by hand' },
];

const STATUS_TAG: Record<PertNode['status'], { cls: string; label: string }> = {
  complete: { cls: 'ok', label: 'Complete' },
  in_progress: { cls: 'info', label: 'In progress' },
  delayed: { cls: 'crit', label: 'Delayed' },
  not_started: { cls: '', label: 'Not started' },
};

/** Ids to collapse so the tree reads at the requested level. Activity level collapses nothing. */
function collapseForDepth(tree: PertTree, depth: Depth): Set<number> {
  const s = new Set<number>();
  if (depth === 'activity') return s;
  const maxLevel = depth === 'wbs' ? 1 : 2;
  const walk = (n: PertNode) => {
    if (n.level >= maxLevel && n.children.length) s.add(n.id);
    n.children.forEach(walk);
  };
  if (tree.root) walk(tree.root);
  return s;
}

/** What the editor needs from the app to do its work. Absent = read-only. */
export interface PertEditing {
  /** activity id -> the current edit overlay for it */
  edits: Record<string, { name?: string; durationDays?: number; percentComplete?: number;
    start?: string | null; startMode?: 'pin' | 'display'; deps?: { pred: string; type: string; lag: number }[];
    deleted?: boolean; added?: unknown }>;
  set: (id: string, patch: Record<string, unknown>) => void;
  add: () => string;
  link: (id: string, predId: string) => string | null;
  unlink: (id: string, predId: string) => void;
  clear: () => void;
  count: number;
  /** the real activities, so the editor can offer predecessors and read live values */
  activities: { id: string; name: string; startDate: string; endDate: string;
    duration: { value: number }; deps: { pred: string }[]; percentComplete?: { value: number } }[];
}

export function Pert({ tree, today, editing }: { tree: PertTree; today: string; editing?: PertEditing }) {
  const [category, setCategory] = useState<PertCategory | 'all'>('all');
  const [depth, setDepth] = useState<Depth>('summary');
  const [collapsed, setCollapsed] = useState<Set<number>>(() => collapseForDepth(tree, 'summary'));
  const [showBars, setShowBars] = useState(true);
  const [editMode, setEditMode] = useState(false);
  /**
   * How a typed date behaves, and it is a CHOICE rather than a rule.
   *
   *   pin      the date is a commitment; CPM re-solves around it and successors
   *            move. The programme stays internally consistent.
   *   display  the date is recorded as typed and nothing reflows — for putting
   *            down what a drawing or a client letter says without claiming the
   *            network agrees with it.
   *
   * It is on screen rather than buried, because the same keystroke means two
   * different things depending on which is active, and a person has to be able
   * to see which one they are in.
   */
  const [dateMode, setDateMode] = useState<'pin' | 'display'>('pin');
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const canEdit = !!editing;
  const on = canEdit && editMode;
  const byName = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of editing?.activities ?? []) m.set(a.name, a.id);
    return m;
  }, [editing]);

  /**
   * Choosing a level RESETS the collapse state to that level. It used to layer the level on top
   * of whatever was already collapsed, which meant picking "Activity level" left the mount-time
   * collapse in place and showed exactly the same rows as Summary — the control looked broken.
   * Hand expand/collapse still works afterwards; it is the level that seeds it.
   */
  const chooseDepth = (d: Depth) => {
    setDepth(d);
    setCollapsed(collapseForDepth(tree, d));
  };

  const roots: PertNode[] = useMemo(() => {
    if (!tree.root) return [];
    return category === 'all' ? [tree.root] : tree.byCategory[category];
  }, [tree, category]);

  const visible = useMemo(() => flattenPert(roots, collapsed), [roots, collapsed]);

  const range = useMemo(() => {
    const all = flattenPert(roots, new Set());
    const starts = all.map((n) => n.start).filter(Boolean) as string[];
    const finishes = all.map((n) => n.finish).filter(Boolean) as string[];
    if (!starts.length) return null;
    const min = starts.reduce((a, b) => (a < b ? a : b));
    const max = finishes.reduce((a, b) => (a > b ? a : b), starts[0]);
    return { min, max, days: Math.max(1, Math.round((iso(max) - iso(min)) / DAY) + 1) };
  }, [roots]);

  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(descendantIds(roots)));

  if (!tree.root) return <p className="muted">No PERT programme available for this project.</p>;

  const barFor = (n: PertNode) => {
    if (!range || !n.start || !n.finish) return null;
    const left = ((iso(n.start) - iso(range.min)) / DAY / range.days) * 100;
    const width = Math.max(0.6, ((iso(n.finish) - iso(n.start)) / DAY + 1) / range.days * 100);
    const colour = n.status === 'delayed' ? 'var(--crit)' : n.status === 'complete' ? 'var(--ok)' : n.isSummary ? 'var(--ext)' : 'var(--accent)';
    return (
      <div style={{ position: 'relative', height: 14, minWidth: 220 }}>
        <div style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: 3, height: n.isSummary ? 6 : 9, background: colour, borderRadius: 3, opacity: n.isSummary ? 0.85 : 1 }} />
        {n.percentComplete > 0 && n.percentComplete < 100 && (
          <div style={{ position: 'absolute', left: `${left}%`, width: `${(width * n.percentComplete) / 100}%`, top: 3, height: n.isSummary ? 6 : 9, background: 'rgba(0,0,0,.35)', borderRadius: 3 }} />
        )}
      </div>
    );
  };

  return (
    <>
      {/* THE TOOLBAR, IN GROUPS.
          Everything used to sit in one row: two segmented controls, three
          buttons, an edit toggle, a date-mode control, an add button, a count
          and a reset — eleven controls wrapping into each other with nothing to
          say which belonged with which. They are split by what they do:
            FILTER   which part of the programme, and how deep
            VIEW     expand, collapse, bars
            EDIT     appears only in the internal view, and only its own tools
          The editing tools are on their own line when open, so turning editing
          on does not reflow the controls above it. */}
      <div className="pert-bar">
        <div className="pert-group" role="group" aria-label="Filter the programme">
          <div className="seg">
            <button className={category === 'all' ? 'on' : ''} onClick={() => setCategory('all')}>All</button>
            {PERT_CATEGORIES.map((c) => (
              <button key={c.key} className={category === c.key ? 'on' : ''} onClick={() => setCategory(c.key)}>{c.label}</button>
            ))}
          </div>
          <div className="seg">
            {DEPTHS.map((d) => (
              <button key={d.key} className={depth === d.key ? 'on' : ''} onClick={() => chooseDepth(d.key)} title={d.hint}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pert-group" role="group" aria-label="View options">
          <button onClick={expandAll} disabled={depth !== 'activity'} title={depth !== 'activity' ? 'Pick Activity level to expand and collapse by hand' : undefined}>Expand all</button>
          <button onClick={collapseAll} disabled={depth !== 'activity'} title={depth !== 'activity' ? 'Pick Activity level to expand and collapse by hand' : undefined}>Collapse all</button>
          <button onClick={() => setShowBars((v) => !v)}>{showBars ? 'Hide' : 'Show'} bars</button>
        </div>

        {canEdit && (
          <div className="pert-group" role="group" aria-label="Edit the programme">
            <button className={on ? 'primary' : ''} onClick={() => { setEditMode((v) => !v); setLinkErr(null); }}
              title="edit durations, dates, percent, links, and add or remove activities">
              {on ? 'Done editing' : 'Edit schedule'}
            </button>
          </div>
        )}

        <div className="spacer" />
        <span className="muted pert-count">
          {visible.length} of {tree.totalTasks} rows · {DEPTHS.find((d) => d.key === depth)!.hint}
          <br />source: {tree.source}
        </span>
      </div>

      {on && (
        <div className="pert-bar pert-editbar">
          <span className="pert-label">Typed dates</span>
          <div className="seg" title="what happens when you type a date">
            <button className={dateMode === 'pin' ? 'on' : ''} onClick={() => setDateMode('pin')}
              title="the date becomes a constraint — CPM re-solves and successors move">Pin &amp; reflow</button>
            <button className={dateMode === 'display' ? 'on' : ''} onClick={() => setDateMode('display')}
              title="the date is recorded as typed and nothing reflows">Display only</button>
          </div>
          <span className="pert-sep" />
          <button onClick={() => { editing!.add(); setDepth('activity'); setCollapsed(new Set()); }}>+ Activity</button>
          {editing!.count > 0 && (
            <>
              <span className="tag info">{editing!.count} edit{editing!.count > 1 ? 's' : ''}</span>
              <button onClick={editing!.clear} title="drop every hand edit and go back to the computed programme">Reset edits</button>
            </>
          )}
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 11.5 }}>Only activity rows are editable — a summary row is the sum of its children.</span>
        </div>
      )}

      {on && (
        <div className="banner info" style={{ marginBottom: 10 }}>
          <strong>Editing the programme.</strong> Duration, links, added and removed activities
          re-run the CPM, so successors move and the critical path can change. Typed dates are
          currently <strong>{dateMode === 'pin' ? 'pinned' : 'display only'}</strong>
          {dateMode === 'pin'
            ? ' — the network re-solves around them.'
            : ' — recorded as typed, with nothing reflowing around them.'}
          {' '}Only activity rows are editable; a summary row is the sum of its children.
          {linkErr && <div style={{ color: 'var(--crit)', marginTop: 5 }}>{linkErr}</div>}
        </div>
      )}

      <div className="legend">
        <span><i className="swatch" style={{ background: 'var(--ext)' }} /> Summary</span>
        <span><i className="swatch" style={{ background: 'var(--accent)' }} /> Task</span>
        <span><i className="swatch" style={{ background: 'var(--ok)' }} /> Complete</span>
        <span><i className="swatch" style={{ background: 'var(--crit)' }} /> Delayed vs {today}</span>
      </div>

      <div className="pert">
        <table>
          <thead>
            <tr>
              <th style={{ width: 52 }}>ID</th>
              <th>Task Name</th>
              <th style={{ width: 74 }}>Duration</th>
              <th style={{ width: 96 }}>Start</th>
              <th style={{ width: 96 }}>Finish</th>
              <th style={{ width: 96 }}>Actual Start</th>
              <th style={{ width: 100 }}>Actual Finish</th>
              <th style={{ width: 58 }}>%</th>
              <th style={{ width: 96 }}>Status</th>
              {showBars && <th>Timeline</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((n) => {
              const tag = STATUS_TAG[n.status];
              // Only leaf rows map to a real activity. A summary row is a rollup
              // of its children and has no duration of its own to edit — editing
              // it would have to guess how to spread the change across them,
              // which is a decision the person should make on the rows.
              const actId = n.children.length === 0 ? byName.get(n.name) ?? null : null;
              const rowEdit = on && actId ? editing!.edits[actId] : undefined;
              const act = actId ? editing?.activities.find((a) => a.id === actId) : undefined;
              const cell = (v: React.ReactNode) => <td className="mono">{v}</td>;
              return (
                <tr key={n.id} className={`lvl${Math.min(n.level, 3)} ${n.status === 'complete' ? 'done' : ''} ${n.status === 'delayed' ? 'late' : ''}`}
                    style={rowEdit?.deleted ? { opacity: 0.45, textDecoration: 'line-through' } : undefined}>
                  <td className="faint mono">{n.id}</td>
                  <td className="name" style={{ paddingLeft: 11 + n.level * 16 }}>
                    {n.children.length > 0 ? (
                      <button className="twist" onClick={() => toggle(n.id)} aria-label={collapsed.has(n.id) ? 'Expand' : 'Collapse'}>
                        {collapsed.has(n.id) ? '▸' : '▾'}
                      </button>
                    ) : (
                      <span style={{ display: 'inline-block', width: 22 }} />
                    )}
                    {on && actId ? (
                      <input defaultValue={n.name} style={{ width: 300, padding: '3px 6px', fontSize: 12.5 }}
                        onBlur={(e) => { if (e.target.value !== n.name) editing!.set(actId, { name: e.target.value }); }} />
                    ) : n.name}
                    {on && actId && (
                      <span style={{ marginLeft: 8, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        <select value="" style={{ padding: '2px 5px', fontSize: 11 }} title="add a predecessor"
                          onChange={(e) => { const err = editing!.link(actId, e.target.value); setLinkErr(err); e.currentTarget.value = ''; }}>
                          <option value="">+ link…</option>
                          {(editing!.activities ?? []).filter((a) => a.id !== actId).map((a) => (
                            <option key={a.id} value={a.id}>{a.name.slice(0, 44)}</option>
                          ))}
                        </select>
                        {(act?.deps ?? []).map((d) => {
                          const p = editing!.activities.find((x) => x.id === d.pred);
                          return (
                            <span key={d.pred} className="tag" title={`waits for ${p?.name ?? d.pred}`}>
                              {(p?.name ?? d.pred).slice(0, 14)}
                              <button className="twist" style={{ marginLeft: 3, width: 13, height: 13 }}
                                title="remove this link" onClick={() => editing!.unlink(actId, d.pred)}>×</button>
                            </span>
                          );
                        })}
                        <button className="twist" title={rowEdit?.deleted ? 'restore this activity' : 'remove this activity'}
                          onClick={() => editing!.set(actId, { deleted: !rowEdit?.deleted })}>
                          {rowEdit?.deleted ? '↺' : '🗑'}
                        </button>
                      </span>
                    )}
                  </td>
                  {on && actId ? (
                    <td className="edit"><input type="number" min={1} defaultValue={n.durationDays} style={{ width: 62 }}
                      onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== n.durationDays) editing!.set(actId, { durationDays: v }); }} /></td>
                  ) : cell(`${n.durationDays} d`)}
                  {on && actId ? (
                    <td className="edit"><input type="date" defaultValue={n.start ?? ''} style={{ width: 128 }}
                      title={dateMode === 'pin' ? 'pinned: CPM re-solves around this' : 'display only: nothing reflows'}
                      onChange={(e) => editing!.set(actId, { start: e.target.value || null, startMode: dateMode })} /></td>
                  ) : cell(fmt(n.start))}
                  {cell(fmt(n.finish))}
                  <td className="mono faint">{fmt(n.actualStart)}</td>
                  <td className="mono faint">{fmt(n.actualFinish)}</td>
                  {on && actId ? (
                    <td className="edit"><input type="number" min={0} max={100} defaultValue={n.percentComplete} style={{ width: 54 }}
                      onBlur={(e) => editing!.set(actId, { percentComplete: Number(e.target.value) })} /></td>
                  ) : cell(`${n.percentComplete}%`)}
                  <td>{tag.label === 'Not started' ? <span className="faint">{tag.label}</span> : <span className={`tag ${tag.cls}`}>{tag.label}</span>}</td>
                  {showBars && <td>{barFor(n)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
