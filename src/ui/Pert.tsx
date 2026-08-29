import { useMemo, useState } from 'react';
import type { PertCategory, PertNode, PertTree } from '../domain/pert';
import { PERT_CATEGORIES, descendantIds, flattenPert } from '../domain/pert';
import {
  PERT_ACTUAL_FINISH, PERT_ACTUAL_START, PERT_NAME, PERT_PERCENT, PERT_STATUS,
} from '../engine/pert-build';

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

/**
 * The row's own date columns, per stream — the same names the Design and
 * Procurement tabs read, so a date typed here and a date typed there are one
 * value. A milestone is a single point in time, so both its ends write `date`.
 */
const MOD_FIELDS: Record<string, { start: string; finish: string }> = {
  design: { start: 'readyBy', finish: 'approvalBy' },
  procurement: { start: 'orderBy', finish: 'deliveryRequired' },
  schedule: { start: 'date', finish: 'date' },
  execution: { start: 'startDate', finish: 'endDate' },
};

const MOD_DATE_HINT: Record<string, { start: string; finish: string }> = {
  design: { start: 'ready-by date — the same cell the Design tab shows', finish: 'client approval-by date — the same cell the Design tab shows' },
  procurement: { start: 'order-by date — the same cell the Procurement tab shows', finish: 'delivery-required date — the same cell the Procurement tab shows' },
  schedule: { start: 'the milestone date — a milestone is one day, so both ends move together', finish: 'the milestone date — a milestone is one day, so both ends move together' },
};

const MOD_HINT: Record<string, string> = {
  design: 'a drawing from the design register — edits here and on the Design tab are the same value',
  procurement: 'a purchase package — edits here and on the Procurement tab are the same value',
  schedule: 'a contract milestone',
};

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
    start?: string | null; startMode?: 'pin' | 'display';
    finish?: string | null; finishMode?: 'pin' | 'display';
    actualStart?: string | null; actualFinish?: string | null;
    status?: PertNode['status'] | null;
    deps?: { pred: string; type: string; lag: number }[];
    deleted?: boolean; added?: unknown }>;
  set: (id: string, patch: Record<string, unknown>) => void;
  /**
   * Working days between two dates, on the project's own calendar.
   *
   * A typed FINISH has to become a duration, and only the calendar knows how
   * many working days lie between two dates once Sundays and the holiday list
   * are taken out. Counting them here off the raw dates would put a row's
   * duration out of step with every other duration in the programme, which are
   * all working days — a fortnight spanning two Sundays would come back as 14.
   */
  workingDays: (fromIso: string, toIso: string) => number;
  add: () => string;
  link: (id: string, predId: string) => string | null;
  unlink: (id: string, predId: string) => void;
  clear: () => void;
  count: number;
  /** the real activities, so the editor can offer predecessors and read live values */
  activities: { id: string; name: string; startDate: string; endDate: string;
    duration: { value: number }; deps: { pred: string }[]; percentComplete?: { value: number } }[];
  /**
   * Edit a row that is NOT a CPM activity — a drawing, a purchase package, a
   * contract milestone. It goes to the shared tracker overlay rather than to the
   * schedule inputs, because there is no network under it to re-solve; see
   * engine/pert-build.ts. Written straight through, so the value shown is the
   * value stored.
   */
  setModule: (rowId: string, field: string, value: string) => void;
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
  /**
   * Which ids are real CPM activities. A row whose id is in here is edited
   * through the schedule inputs and re-solves the network; every other row is a
   * tracker row and is written straight to the overlay.
   *
   * This replaced a name lookup. Matching a row to its activity by NAME held only
   * until somebody renamed one — the first hand-edited name broke the link and
   * the row quietly stopped being editable, with nothing on screen to say why.
   */
  const activityIds = useMemo(
    () => new Set((editing?.activities ?? []).map((a) => a.id)),
    [editing],
  );

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

  /**
   * A typed finish, in whichever way the person meant it.
   *
   * PINNED it is a commitment about when the row ends, and the only honest way
   * to hold one in a network solved forwards from its start is as a DURATION:
   * start → typed finish, counted in working days on the project calendar. CPM
   * then re-solves and successors move, which is what pinning promises. Writing
   * the date straight onto the row instead would leave a finish that its own
   * start and duration contradict, and the next recompute would overwrite it.
   *
   * DISPLAY it is recorded as typed and nothing reflows.
   *
   * A finish before its start is refused rather than clamped: it is a typo often
   * enough that silently turning it into a one-day activity would bury it.
   */
  const setFinish = (actId: string, n: PertNode, typed: string) => {
    if (!typed) {
      editing!.set(actId, { finish: null, finishMode: dateMode });
      setLinkErr(null);
      return;
    }
    if (dateMode === 'display') {
      editing!.set(actId, { finish: typed, finishMode: 'display' });
      setLinkErr(null);
      return;
    }
    const start = n.start;
    if (!start) { setLinkErr('that row has no start to measure a finish from'); return; }
    if (typed < start) { setLinkErr(`a finish of ${typed} is before that row's start of ${start}`); return; }
    const days = editing!.workingDays(start, typed);
    if (days < 1) { setLinkErr(`${typed} is not a working day on this calendar`); return; }
    setLinkErr(null);
    // The duration IS the edit. Recording the typed finish alongside it would
    // store the same fact twice — and count as two edits on the push badge for
    // one thing the person did.
    editing!.set(actId, { durationDays: days });
  };

  /**
   * A tracker row's duration, typed as a number of days.
   *
   * Held as a MOVED FINISH rather than as a duration of its own, because a
   * drawing has two dates and no third field to keep in step with them. Counted
   * in calendar days, which is what the gap between a ready-by and an
   * approval-by is — these rows are not on the CPM's working-day calendar.
   */
  const setModuleDuration = (n: PertNode, days: number) => {
    if (!n.sourceId || !n.start || !Number.isFinite(days) || days < 1) return;
    const finish = new Date(iso(n.start) + (days - 1) * DAY).toISOString().slice(0, 10);
    editing!.setModule(n.sourceId, MOD_FIELDS[n.category].finish, finish);
  };

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
            {/* Turning editing on DROPS TO ACTIVITY LEVEL, and that is not a
                convenience. Only activity rows can be edited, and the table opens
                at Summary level — where there are none. Pressing "Edit schedule"
                there changed the toolbar and nothing else: no field on any visible
                row became editable, which reads exactly like a button that does
                not work. The editor now shows the rows it can actually edit. */}
            <button className={on ? 'primary' : ''}
              onClick={() => {
                const next = !on;
                setEditMode(next);
                setLinkErr(null);
                if (next && depth !== 'activity') chooseDepth('activity');
              }}
              title="edit durations, dates, actuals, percent, status and links, and add or remove activities">
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
          {/* The mode governs the PLANNED dates only. Start and Finish are the
              programme's claim about the future and can be argued with; Actual
              Start and Actual Finish are a record of the past, and there is
              nothing for a network to reflow around a fact. */}
          <span className="pert-label">Typed start &amp; finish</span>
          <div className="seg" title="what happens when you type a planned date — the actuals are always recorded as typed">
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
          re-run the CPM, so successors move and the critical path can change. Typed start and
          finish dates are currently <strong>{dateMode === 'pin' ? 'pinned' : 'display only'}</strong>
          {dateMode === 'pin'
            ? ' — the network re-solves around them. A typed finish is held as the duration that reaches it, so the row keeps that length even if its start later moves.'
            : ' — recorded as typed, with nothing reflowing around them.'}
          {' '}<strong>Actual start</strong>, <strong>actual finish</strong> and <strong>status</strong> are
          records rather than plans: they are always kept exactly as entered, and a status left on
          “derived” goes on following progress against today.
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
              // A summary row is still not editable, and that has not changed: it
              // is the sum of its children and has no dates of its own, so an edit
              // would have to guess how to spread itself across them — a decision
              // that belongs on the rows.
              const leaf = n.children.length === 0 ? n.sourceId ?? null : null;
              // Two kinds of leaf, edited two different ways. An activity folds
              // back into the schedule inputs and re-solves the network; a
              // drawing, a package or a milestone is written straight to the
              // shared tracker overlay, because nothing computes it.
              const actId = leaf && activityIds.has(leaf) ? leaf : null;
              const modId = leaf && !actId ? leaf : null;
              const rowEdit = on && actId ? editing!.edits[actId] : undefined;
              const act = actId ? editing?.activities.find((a) => a.id === actId) : undefined;
              const cell = (v: React.ReactNode) => <td className="mono">{v}</td>;
              /** A tracker-row cell: what is on screen is what is stored. */
              const mod = (field: string, value: string) => editing!.setModule(modId!, field, value);
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
                    ) : on && modId ? (
                      <input defaultValue={n.name} style={{ width: 300, padding: '3px 6px', fontSize: 12.5 }}
                        title={MOD_HINT[n.category]}
                        onBlur={(e) => { if (e.target.value !== n.name) mod(PERT_NAME, e.target.value); }} />
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
                  ) : on && modId ? (
                    // A tracker row's duration is the gap between its two dates, so
                    // it is edited BY MOVING THE FINISH. Storing a duration of its
                    // own would leave a third number that its own dates contradict.
                    <td className="edit"><input type="number" min={1} defaultValue={n.durationDays} style={{ width: 62 }}
                      title="days from this row’s start — moves its finish"
                      onBlur={(e) => setModuleDuration(n, Number(e.target.value))} /></td>
                  ) : cell(`${n.durationDays} d`)}
                  {on && actId ? (
                    <td className="edit"><input type="date" defaultValue={n.start ?? ''} style={{ width: 128 }}
                      title={dateMode === 'pin' ? 'pinned: CPM re-solves around this' : 'display only: nothing reflows'}
                      onChange={(e) => editing!.set(actId, { start: e.target.value || null, startMode: dateMode })} /></td>
                  ) : on && modId ? (
                    <td className="edit"><input type="date" defaultValue={n.start ?? ''} style={{ width: 128 }}
                      title={MOD_DATE_HINT[n.category]?.start ?? 'recorded as typed'}
                      onChange={(e) => mod(MOD_FIELDS[n.category].start, e.target.value)} /></td>
                  ) : cell(fmt(n.start))}
                  {/* FINISH. Pinned, it is a duration — see the handler. On display
                      it is recorded as typed and the network is left alone. */}
                  {on && actId ? (
                    <td className="edit"><input type="date" defaultValue={n.finish ?? ''} style={{ width: 128 }}
                      title={dateMode === 'pin'
                        ? 'pinned: sets the duration that reaches this date from the row’s start today — if the network later moves that start, the finish moves with it'
                        : 'display only: recorded as typed, nothing reflows'}
                      onChange={(e) => setFinish(actId, n, e.target.value)} /></td>
                  ) : on && modId ? (
                    <td className="edit"><input type="date" defaultValue={n.finish ?? ''} style={{ width: 128 }}
                      title={MOD_DATE_HINT[n.category]?.finish ?? 'recorded as typed'}
                      onChange={(e) => mod(MOD_FIELDS[n.category].finish, e.target.value)} /></td>
                  ) : cell(fmt(n.finish))}
                  {/* THE ACTUALS. Recorded, never computed: these say what happened,
                      so nothing reflows around them however they are typed. */}
                  {on && actId ? (
                    <td className="edit"><input type="date" defaultValue={n.actualStart ?? ''} style={{ width: 128 }}
                      title="the date work actually started on site"
                      onChange={(e) => editing!.set(actId, { actualStart: e.target.value || null })} /></td>
                  ) : on && modId ? (
                    <td className="edit"><input type="date" defaultValue={n.actualStart ?? ''} style={{ width: 128 }}
                      title="the date this actually started"
                      onChange={(e) => mod(PERT_ACTUAL_START, e.target.value)} /></td>
                  ) : <td className="mono faint">{fmt(n.actualStart)}</td>}
                  {on && actId ? (
                    <td className="edit"><input type="date" defaultValue={n.actualFinish ?? ''} style={{ width: 128 }}
                      title="the date work actually finished — a row with one reads as complete"
                      onChange={(e) => editing!.set(actId, { actualFinish: e.target.value || null })} /></td>
                  ) : on && modId ? (
                    <td className="edit"><input type="date" defaultValue={n.actualFinish ?? ''} style={{ width: 128 }}
                      title="the date this actually finished — a row with one reads as complete"
                      onChange={(e) => mod(PERT_ACTUAL_FINISH, e.target.value)} /></td>
                  ) : <td className="mono faint">{fmt(n.actualFinish)}</td>}
                  {on && actId ? (
                    <td className="edit"><input type="number" min={0} max={100} defaultValue={n.percentComplete} style={{ width: 54 }}
                      onBlur={(e) => editing!.set(actId, { percentComplete: Number(e.target.value) })} /></td>
                  ) : on && modId ? (
                    <td className="edit"><input type="number" min={0} max={100} defaultValue={n.percentComplete} style={{ width: 54 }}
                      onBlur={(e) => mod(PERT_PERCENT, e.target.value)} /></td>
                  ) : cell(`${n.percentComplete}%`)}
                  {/* STATUS. Normally worked out from progress against today, which is
                      right nearly always — "" hands the row back to that derivation
                      rather than freezing whatever it happened to say when picked. */}
                  {on && actId ? (
                    <td className="edit">
                      <select value={rowEdit?.status ?? ''} style={{ padding: '2px 4px', fontSize: 11.5, width: 92 }}
                        title="set the status by hand, or leave it to follow progress"
                        onChange={(e) => editing!.set(actId, { status: (e.target.value || null) as PertNode['status'] | null })}>
                        <option value="">— derived —</option>
                        {(Object.keys(STATUS_TAG) as PertNode['status'][]).map((s) => (
                          <option key={s} value={s}>{STATUS_TAG[s].label}</option>
                        ))}
                      </select>
                    </td>
                  ) : on && modId ? (
                    <td className="edit">
                      <select value={n.statusIsManual ? n.status : ''} style={{ padding: '2px 4px', fontSize: 11.5, width: 92 }}
                        title="set the status by hand, or leave it to follow progress"
                        onChange={(e) => mod(PERT_STATUS, e.target.value)}>
                        <option value="">— derived —</option>
                        {(Object.keys(STATUS_TAG) as PertNode['status'][]).map((s) => (
                          <option key={s} value={s}>{STATUS_TAG[s].label}</option>
                        ))}
                      </select>
                    </td>
                  ) : (
                    <td>
                      {tag.label === 'Not started' ? <span className="faint">{tag.label}</span> : <span className={`tag ${tag.cls}`}>{tag.label}</span>}
                      {n.statusIsManual && <span className="faint" title="set by hand, not derived from progress"> ✎</span>}
                    </td>
                  )}
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
