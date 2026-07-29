import type { Plan } from '../engine/planner';

const DAY = 86400000;
const iso = (s: string) => Date.parse(s + 'T00:00:00Z');

export function Gantt({ plan }: { plan: Plan }) {
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

  // month ticks
  const ticks: { x: number; label: string }[] = [];
  for (let t = start; t <= end; t += DAY) {
    const d = new Date(t);
    if (d.getUTCDate() === 1 || t === start)
      ticks.push({ x: labelW + Math.round((t - start) / DAY) * px, label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }) });
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

        {/* contract end marker */}
        {plan.external && (
          <g>
            <line x1={x(plan.external.end)} y1={18} x2={x(plan.external.end)} y2={height - 4} stroke="#6941c6" strokeDasharray="4 3" />
            <text x={x(plan.external.end) + 4} y={height - 8} fill="#6941c6" fontSize={10}>contract end {plan.external.end}</text>
          </g>
        )}
        {plan.internal && (
          <g>
            <line x1={x(plan.internal.end)} y1={18} x2={x(plan.internal.end)} y2={height - 4} stroke="#12805c" strokeDasharray="4 3" />
            <text x={x(plan.internal.end) + 4} y={height - 20} fill="#12805c" fontSize={10}>internal target {plan.internal.end}</text>
          </g>
        )}

        {acts.map((a, i) => {
          const y = 26 + i * rowH;
          const x1 = x(a.startDate);
          const w = Math.max(px, x(a.endDate) - x1 + px);
          const floatW = a.totalFloat * px;
          return (
            <g key={a.id}>
              <text x={6} y={y + 11} fill="#14181f" fontSize={11}>{a.name.length > 36 ? a.name.slice(0, 35) + '…' : a.name}</text>
              {plan.internal && a.totalFloat > 0 && (
                <rect x={x1 + w} y={y + 4} width={floatW} height={8} fill="#e2e7ee" rx={2} />
              )}
              <rect x={x1} y={y + 2} width={w} height={12} rx={3} fill={a.critical ? '#d92d20' : '#0f6fff'} opacity={a.critical ? 0.95 : 0.85}>
                <title>{`${a.name}\n${a.startDate} → ${a.endDate} (${a.duration.value}d)\nfloat ${a.totalFloat}d${a.critical ? ' · CRITICAL' : ''}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
