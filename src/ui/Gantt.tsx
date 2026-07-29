import type { Plan } from '../engine/planner';

const DAY = 86400000;
const iso = (s: string) => Date.parse(s + 'T00:00:00Z');

/** Tracked state per activity, supplied by whatever the team has updated. */
export interface GanttProgress {
  /** 0..100 */
  percent?: number;
  actualStart?: string | null;
  actualFinish?: string | null;
}

/**
 * The Gantt draws the plan *and* how far it has actually got.
 *
 * Progress is only ever what someone recorded. It is never inferred from the date — an
 * activity whose window has passed is shown as behind, not as done, because the calendar is
 * not evidence of work.
 */
export function Gantt({
  plan,
  today,
  progress,
}: {
  plan: Plan;
  today?: string;
  progress?: Record<string, GanttProgress>;
}) {
  const acts = plan.modules.timeline.activities;
  if (!acts.length) return null;

  const start = iso(plan.external?.start ?? acts[0].startDate);
  const end = Math.max(iso(plan.external?.end ?? acts[acts.length - 1].endDate), ...acts.map((a) => iso(a.endDate)));
  const totalDays = Math.round((end - start) / DAY) + 1;

  const px = 7; // px per day
  const rowH = 18;
  const labelW = 250;
  const width = labelW + totalDays * px + 20;
  const height = acts.length * rowH + 46;

  const x = (d: string) => labelW + Math.round((iso(d) - start) / DAY) * px;
  const inRange = (d: string) => iso(d) >= start && iso(d) <= end;

  // month ticks
  const ticks: { x: number; label: string }[] = [];
  for (let t = start; t <= end; t += DAY) {
    const dt = new Date(t);
    if (dt.getUTCDate() === 1 || t === start)
      ticks.push({ x: labelW + Math.round((t - start) / DAY) * px, label: dt.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }) });
  }

  return (
    <div className="gantt">
      <svg width={width} height={height} role="img" aria-label="Project Gantt chart">
        {ticks.map((t) => (
          <g key={t.x}>
            <line x1={t.x} y1={20} x2={t.x} y2={height - 4} stroke="#eef1f6" />
            <text x={t.x + 3} y={14} fill="#98a2b1" fontSize={10}>{t.label}</text>
          </g>
        ))}

        {/* client committed finish */}
        {plan.external && (
          <g>
            <line x1={x(plan.external.end)} y1={18} x2={x(plan.external.end)} y2={height - 4} stroke="#6941c6" strokeDasharray="4 3" />
            <text x={x(plan.external.end) + 4} y={height - 8} fill="#6941c6" fontSize={10}>client end {plan.external.end}</text>
          </g>
        )}
        {plan.internal && (
          <g>
            <line x1={x(plan.internal.end)} y1={18} x2={x(plan.internal.end)} y2={height - 4} stroke="#12805c" strokeDasharray="4 3" />
            <text x={x(plan.internal.end) + 4} y={height - 20} fill="#12805c" fontSize={10}>internal finish {plan.internal.end}</text>
          </g>
        )}
        {/* internal target, when one is set and the CPM finish misses it */}
        {plan.internal?.target && plan.internal.target !== plan.internal.end && inRange(plan.internal.target) && (
          <g>
            <line x1={x(plan.internal.target)} y1={18} x2={x(plan.internal.target)} y2={height - 4} stroke="#b54708" strokeDasharray="2 3" />
            <text x={x(plan.internal.target) + 4} y={height - 32} fill="#b54708" fontSize={10}>target {plan.internal.target}</text>
          </g>
        )}
        {today && inRange(today) && (
          <g>
            <line x1={x(today)} y1={18} x2={x(today)} y2={height - 4} stroke="#d92d20" strokeWidth={1.5} />
            <text x={x(today) + 4} y={height - 44} fill="#d92d20" fontSize={10} fontWeight="600">today</text>
          </g>
        )}

        {acts.map((a, i) => {
          const y = 26 + i * rowH;
          const x1 = x(a.startDate);
          const w = Math.max(px, x(a.endDate) - x1 + px);
          const floatW = a.totalFloat * px;
          const tracked = progress?.[a.id];
          const pct = Math.max(0, Math.min(100, tracked?.percent ?? 0));
          // behind = its planned window has passed but it is not recorded complete
          const behind = !!today && a.endDate < today && pct < 100;
          const barFill = a.critical ? '#d92d20' : '#0f6fff';
          return (
            <g key={a.id}>
              <text x={6} y={y + 11} fill={behind ? '#d92d20' : '#14181f'} fontSize={11}>
                {a.name.length > 34 ? a.name.slice(0, 33) + '…' : a.name}
              </text>
              {plan.internal && a.totalFloat > 0 && (
                <rect x={x1 + w} y={y + 4} width={floatW} height={8} fill="#e2e7ee" rx={2} />
              )}
              {/* planned bar fades once tracking starts, so the progress fill reads clearly */}
              <rect x={x1} y={y + 2} width={w} height={12} rx={3} fill={barFill} opacity={pct > 0 ? 0.28 : a.critical ? 0.95 : 0.85}>
                <title>{`${a.name}\n${a.startDate} → ${a.endDate} (${a.duration.value}d)\nfloat ${a.totalFloat}d${a.critical ? ' · CRITICAL' : ''}${tracked ? `\nprogress ${pct}%` : ''}`}</title>
              </rect>
              {pct > 0 && (
                <rect x={x1} y={y + 2} width={Math.max(2, (w * pct) / 100)} height={12} rx={3} fill={pct >= 100 ? '#12805c' : barFill}>
                  <title>{`${a.name} — ${pct}% complete`}</title>
                </rect>
              )}
              {behind && <rect x={x1 + w} y={y + 2} width={3} height={12} fill="#d92d20" />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
