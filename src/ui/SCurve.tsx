// Planned vs actual progress curve. Actual stops at today — the future has no actuals.
import type { SCurve as SCurveData } from '../engine/scurve';

const W = 900;
const H = 300;
const PAD = { l: 44, r: 16, t: 14, b: 34 };

export function SCurveChart({ curve, today }: { curve: SCurveData; today: string }) {
  const { points } = curve;
  if (points.length < 2) return null;

  const t0 = Date.parse(`${points[0].date}T00:00:00Z`);
  const t1 = Date.parse(`${points.at(-1)!.date}T00:00:00Z`);
  const span = Math.max(1, t1 - t0);

  const x = (d: string) => PAD.l + ((Date.parse(`${d}T00:00:00Z`) - t0) / span) * (W - PAD.l - PAD.r);
  const y = (pct: number) => PAD.t + (1 - pct / 100) * (H - PAD.t - PAD.b);

  const path = (sel: (p: (typeof points)[number]) => number | null) => {
    const segs: string[] = [];
    let open = false;
    for (const p of points) {
      const v = sel(p);
      if (v === null) {
        open = false;
        continue;
      }
      segs.push(`${open ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(v).toFixed(1)}`);
      open = true;
    }
    return segs.join(' ');
  };

  const area = () => {
    const pts = points.map((p) => `${x(p.date).toFixed(1)},${y(p.planned).toFixed(1)}`);
    return `M${PAD.l},${y(0)} L${pts.join(' L')} L${x(points.at(-1)!.date).toFixed(1)},${y(0)} Z`;
  };

  // month ticks
  const ticks: { d: string; label: string }[] = [];
  let seen = '';
  for (const p of points) {
    const key = p.date.slice(0, 7);
    if (key !== seen) {
      seen = key;
      ticks.push({ d: p.date, label: new Date(`${p.date}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }) });
    }
  }

  return (
    <div className="gantt">
      <svg width={W} height={H} role="img" aria-label="Planned versus actual progress S-curve">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={PAD.l} y1={y(g)} x2={W - PAD.r} y2={y(g)} stroke="#eef1f6" />
            <text x={PAD.l - 8} y={y(g) + 3} textAnchor="end" fill="#98a2b1" fontSize={10}>{g}%</text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t.d} x={x(t.d)} y={H - 12} fill="#98a2b1" fontSize={10} textAnchor="middle">{t.label}</text>
        ))}

        <path d={area()} fill="#0f6fff" opacity={0.07} />
        <path d={path((p) => p.planned)} fill="none" stroke="#0f6fff" strokeWidth={2} />
        <path d={path((p) => p.actual)} fill="none" stroke="#12805c" strokeWidth={2.5} />

        {x(today) >= PAD.l && x(today) <= W - PAD.r && (
          <g>
            <line x1={x(today)} y1={PAD.t} x2={x(today)} y2={H - PAD.b} stroke="#d92d20" strokeWidth={1.5} strokeDasharray="3 3" />
            <text x={x(today) + 4} y={PAD.t + 10} fill="#d92d20" fontSize={10} fontWeight="600">today</text>
          </g>
        )}

        <g transform={`translate(${PAD.l + 8},${PAD.t + 6})`}>
          <rect x={0} y={0} width={10} height={3} fill="#0f6fff" />
          <text x={16} y={4} fontSize={10} fill="#66717f">planned</text>
          <rect x={70} y={0} width={10} height={3} fill="#12805c" />
          <text x={86} y={4} fontSize={10} fill="#66717f">actual (recorded)</text>
        </g>
      </svg>
    </div>
  );
}
