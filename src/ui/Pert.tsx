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

export function Pert({ tree, today }: { tree: PertTree; today: string }) {
  const [category, setCategory] = useState<PertCategory | 'all'>('all');
  const [depth, setDepth] = useState<Depth>('summary');
  const [collapsed, setCollapsed] = useState<Set<number>>(() => collapseForDepth(tree, 'summary'));
  const [showBars, setShowBars] = useState(true);

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
      <div className="row" style={{ marginBottom: 12 }}>
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
        <button onClick={expandAll} disabled={depth !== 'activity'} title={depth !== 'activity' ? 'Switch to Activity level to expand by hand' : undefined}>Expand all</button>
        <button onClick={collapseAll} disabled={depth !== 'activity'}>Collapse all</button>
        <button onClick={() => setShowBars((v) => !v)}>{showBars ? 'Hide' : 'Show'} bars</button>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {visible.length} of {tree.totalTasks} rows · {DEPTHS.find((d) => d.key === depth)!.hint} · source: {tree.source}
        </span>
      </div>

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
              return (
                <tr key={n.id} className={`lvl${Math.min(n.level, 3)} ${n.status === 'complete' ? 'done' : ''} ${n.status === 'delayed' ? 'late' : ''}`}>
                  <td className="faint mono">{n.id}</td>
                  <td className="name" style={{ paddingLeft: 11 + n.level * 16 }}>
                    {n.children.length > 0 ? (
                      <button className="twist" onClick={() => toggle(n.id)} aria-label={collapsed.has(n.id) ? 'Expand' : 'Collapse'}>
                        {collapsed.has(n.id) ? '▸' : '▾'}
                      </button>
                    ) : (
                      <span style={{ display: 'inline-block', width: 22 }} />
                    )}
                    {n.name}
                  </td>
                  <td className="mono">{n.durationDays} d</td>
                  <td className="mono">{fmt(n.start)}</td>
                  <td className="mono">{fmt(n.finish)}</td>
                  <td className="mono faint">{fmt(n.actualStart)}</td>
                  <td className="mono faint">{fmt(n.actualFinish)}</td>
                  <td className="mono">{n.percentComplete}%</td>
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
