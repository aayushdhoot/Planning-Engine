// The executive cockpit. One screen, exception-first, with brushing.
//
// Brushing is the Spotfire idea worth stealing: select a trade anywhere, and every other visual
// on the screen re-expresses itself for that trade rather than filtering it away. Nothing is
// hidden — the unselected material stays visible but recedes, so you keep the context you were
// comparing against.
import { useMemo, useState } from 'react';
import type { Plan } from '../engine/planner';
import { buildCockpit, type Rag } from '../engine/cockpit';
import { buildSCurve } from '../engine/scurve';
import { SCurveChart } from './SCurve';

const RAG_COLOUR: Record<Rag, string> = { green: 'var(--ok)', amber: 'var(--warn)', red: 'var(--crit)' };
const RAG_SOFT: Record<Rag, string> = { green: 'var(--ok-soft)', amber: 'var(--warn-soft)', red: 'var(--crit-soft)' };

export function Cockpit({ plan, today, onOpen }: { plan: Plan; today: string; onOpen: (area: string) => void }) {
  const [brushed, setBrushed] = useState<string | null>(null);
  const c = useMemo(() => buildCockpit(plan, today), [plan, today]);
  const acts = plan.modules.timeline.activities;

  // the curve re-expresses itself for the brushed trade rather than the whole project
  const curve = useMemo(
    () => (brushed ? buildSCurve(acts.filter((a) => a.trade === brushed), today) : c.curve),
    [acts, brushed, today, c.curve],
  );

  if (!acts.length)
    return <p className="muted">No plan yet — this project is still pending inputs.</p>;

  const maxManDays = Math.max(...c.trades.map((t) => t.manDays), 1);
  const shownExceptions = brushed ? c.exceptions.filter((e) => !e.trades.length || e.trades.includes(brushed)) : c.exceptions;

  return (
    <>
      {/* ---------------------------------------------------------- headline */}
      <div
        className="card"
        style={{ borderColor: RAG_COLOUR[c.rag], background: RAG_SOFT[c.rag], marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20 }}
      >
        <div style={{ minWidth: 96, textAlign: 'center' }}>
          <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, color: RAG_COLOUR[c.rag] }}>{c.health}</div>
          <div className="k" style={{ marginTop: 2 }}>health</div>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{c.headline}</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {plan.project.name} · client baseline {plan.external?.start} → {plan.external?.end}
            {brushed && <> · <strong>brushed to {brushed}</strong></>}
          </div>
        </div>
        {brushed && (
          <button style={{ marginLeft: 'auto' }} onClick={() => setBrushed(null)}>Clear selection</button>
        )}
      </div>

      {/* ---------------------------------------------------------- KPIs */}
      <div className="cards">
        {c.kpis.map((k) => (
          <div
            key={k.key}
            className="card"
            style={{ borderColor: k.rag === 'green' ? undefined : RAG_COLOUR[k.rag], background: k.rag === 'green' ? undefined : RAG_SOFT[k.rag], cursor: 'pointer' }}
            onClick={() => onOpen(k.key)}
            title="Open the detail for this"
          >
            <div className="k">{k.label}</div>
            <div className="v" style={{ color: k.rag === 'green' ? undefined : RAG_COLOUR[k.rag] }}>{k.value}</div>
            <div className="s">{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* -------------------------------------------------------- exceptions */}
        <div>
          <h2 style={{ marginTop: 4 }}>
            Needs a decision {shownExceptions.length > 0 && <span className="tag crit" style={{ marginLeft: 6 }}>{shownExceptions.length}</span>}
          </h2>
          {shownExceptions.length === 0 ? (
            <div className="banner ok">Nothing outstanding{brushed ? ` for ${brushed}` : ''}. The detail tabs carry the full registers.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shownExceptions.map((e) => (
                <div
                  key={e.id}
                  className="card"
                  style={{ borderLeft: `4px solid ${RAG_COLOUR[e.severity]}`, cursor: 'pointer', padding: '11px 14px' }}
                  onClick={() => onOpen(e.area)}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span className={`tag ${e.severity === 'red' ? 'crit' : 'warn'}`}>{e.area}</span>
                    <strong style={{ fontSize: 13 }}>{e.title}</strong>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{e.detail}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* -------------------------------------------------------- trades (the brush) */}
        <div>
          <h2 style={{ marginTop: 4 }}>Where the work is</h2>
          <p className="muted" style={{ marginTop: -8, fontSize: 12 }}>
            Sized by work content. Click a trade to brush the whole screen to it.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {c.trades.map((t) => {
              const on = brushed === t.trade;
              return (
                <button
                  key={t.trade}
                  onClick={() => setBrushed(on ? null : t.trade)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '104px 1fr 78px',
                    alignItems: 'center',
                    gap: 8,
                    textAlign: 'left',
                    padding: '5px 8px',
                    border: '1px solid transparent',
                    borderColor: on ? 'var(--accent)' : 'transparent',
                    background: on ? 'var(--accent-soft)' : 'transparent',
                    boxShadow: 'none',
                    // unselected material recedes rather than disappearing, so the comparison survives
                    opacity: brushed && !on ? 0.42 : 1,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: on ? 600 : 400 }}>
                    {t.trade}
                    {t.behind > 0 && <span className="tag crit" style={{ marginLeft: 5, padding: '0 5px' }}>{t.behind}</span>}
                  </span>
                  <span className="bar" style={{ height: 12 }}>
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${(t.manDays / maxManDays) * 100}%`,
                        background: t.behind > 0 ? 'var(--crit)' : t.critical > 0 ? 'var(--accent)' : 'var(--line)',
                        borderRadius: 3,
                      }}
                    />
                  </span>
                  <span className="faint mono" style={{ fontSize: 11, textAlign: 'right' }}>{t.manDays.toLocaleString('en-IN')} md</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------- curve */}
      <h2 style={{ marginTop: 22 }}>
        Progress {brushed ? <span className="tag info">{brushed} only</span> : <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>whole project</span>}
      </h2>
      <p className="muted" style={{ marginTop: -8, fontSize: 12 }}>
        Planned {curve.plannedToday}% · recorded {curve.actualToday}% · {curve.varianceToday > 0 ? '+' : ''}{curve.varianceToday}% variance.
        Progress is only ever what site recorded — a date passing is not evidence of work.
      </p>
      <SCurveChart curve={curve} today={today} />
    </>
  );
}
