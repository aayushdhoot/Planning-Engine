import { useEffect, useRef, useState } from 'react';
import type { EngineConfig, ProjectInputs } from '../domain/types';
import type { ExternalDelay } from '../engine/planner';
import { fetchReplanPreview, ReplanClientError } from '../services/replan/browser-client';
import type { ReplanPreview } from '../services/replan/apply';

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text?: string; // user message, or an assistant-side error
  preview?: ReplanPreview;
  approved?: boolean;
  discarded?: boolean;
}

let turnCounter = 0;
const uid = () => `turn-${++turnCounter}`;
export function Assistant({
  p, cfg, today, onApprove,
}: {
  p: ProjectInputs;
  cfg: EngineConfig;
  today: string;
  /** lifts the resolved delays up to App.tsx, which folds them into buildPlan() for this
   * project going forward — session-only for now */
  onApprove: (delays: ExternalDelay[], summary: string) => void;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // The original query a clarifying question was raised against — a chat reply while this is
  // set is a continuation of the SAME question, not a new topic, so it gets folded in rather
  // than sent to the agent on its own (which is how the previous non-chat version needed a
  // separate "answer" box; here the ordinary message box just does double duty).
  const [pendingOriginal, setPendingOriginal] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setTurns((t) => [...t, { id: uid(), role: 'user', text }]);

    const effectiveQuery = pendingOriginal ? `${pendingOriginal} — ${text}` : text;
    setLoading(true);
    try {
      const result = await fetchReplanPreview(p, cfg, today, effectiveQuery);
      setPendingOriginal(result.applicable && result.clarifyingQuestion ? effectiveQuery : null);
      setTurns((t) => [...t, { id: uid(), role: 'assistant', preview: result }]);
    } catch (e) {
      setPendingOriginal(null);
      const msg = e instanceof ReplanClientError ? e.message : e instanceof Error ? e.message : String(e);
      setTurns((t) => [...t, { id: uid(), role: 'assistant', text: msg }]);
    } finally {
      setLoading(false);
    }
  };

  const approve = (turnId: string, preview: ReplanPreview) => {
    if (!preview.resolvedDelays.length) return;
    onApprove(preview.resolvedDelays, preview.summary);
    setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, approved: true } : x)));
  };

  const discard = (turnId: string) => {
    setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, discarded: true } : x)));
  };

  return (
    <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)', minHeight: 420 }}>
      <h2>AI Assistant</h2>
      <p className="muted" style={{ marginTop: -4, maxWidth: 780 }}>
        Ask about a delay or change — e.g. "flooring is delayed by 10 days" — and review the revised plan before
        anything is applied. Nothing here overwrites your source documents; approving adds a replanning constraint
        on top, and the deterministic engine still computes every date.
      </p>

      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border, #e2e2e2)', borderRadius: 10, padding: 14, marginTop: 10 }}>
        {turns.length === 0 && !loading && (
          <p className="muted" style={{ margin: 0 }}>No messages yet — ask about a delay to get started.</p>
        )}

        {turns.map((turn) => (
          <div key={turn.id} style={{ display: 'flex', justifyContent: turn.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
            <div
              className={turn.role === 'assistant' ? 'banner info' : undefined}
              style={{
                maxWidth: '82%',
                padding: turn.role === 'user' ? '8px 14px' : '10px 14px',
                borderRadius: 12,
                background: turn.role === 'user' ? 'var(--accent, #2563eb)' : undefined,
                color: turn.role === 'user' ? '#fff' : undefined,
                margin: 0,
              }}
            >
              {turn.role === 'user' && <span>{turn.text}</span>}

              {turn.role === 'assistant' && turn.text && !turn.preview && <span>{turn.text}</span>}

              {turn.role === 'assistant' && turn.preview && (() => {
                const preview = turn.preview;
                return (
                  <>
                    <strong>{preview.summary}</strong>

                    {!preview.applicable && (
                      <p style={{ marginTop: 8, marginBottom: 0 }}>This doesn't look like a delay or replan request — nothing to apply.</p>
                    )}

                    {preview.applicable && preview.clarifyingQuestion && (
                      <p style={{ marginTop: 8, marginBottom: 0 }}>{preview.clarifyingQuestion}</p>
                    )}

                    {preview.applicable && !preview.clarifyingQuestion && preview.revised && (
                      <>
                        <p style={{ marginTop: 8, marginBottom: 0 }}>
                          Internal finish: <strong>{preview.internalEndBefore}</strong> → <strong>{preview.internalEndAfter}</strong>
                          {preview.internalEndAfter && preview.internalEndBefore !== preview.internalEndAfter ? '' : ' (no change)'}
                          {preview.ieInvariantHoldsAfter === false && (
                            <span className="tag crit" style={{ marginLeft: 8 }}>would breach the client commitment date</span>
                          )}
                        </p>

                        {preview.changedActivities.length > 0 ? (
                          <table style={{ marginTop: 10, width: '100%' }}>
                            <thead>
                              <tr><th>Activity</th><th>Trade</th><th>Was</th><th>Now</th><th>Δ working days</th></tr>
                            </thead>
                            <tbody>
                              {preview.changedActivities.map((c) => (
                                <tr key={c.id}>
                                  <td>{c.name}</td>
                                  <td>{c.trade}</td>
                                  <td>{c.startBefore}</td>
                                  <td>{c.startAfter}</td>
                                  <td>+{c.deltaWorkingDays}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p style={{ marginTop: 8, marginBottom: 0 }} className="muted">
                            No activity dates actually moved — existing float already absorbed this delay.
                          </p>
                        )}

                        {!turn.approved && !turn.discarded && (
                          <div className="row" style={{ marginTop: 12 }}>
                            <button className="primary" onClick={() => approve(turn.id, preview)}>Approve — apply to this session</button>
                            <button onClick={() => discard(turn.id)}>Discard</button>
                          </div>
                        )}
                        {turn.approved && <div className="tag ok" style={{ marginTop: 10 }}>Applied</div>}
                        {turn.discarded && <div className="tag" style={{ marginTop: 10 }}>Discarded</div>}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div className="banner info" style={{ margin: 0 }}>Thinking…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {pendingOriginal && !loading && (
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          Answering the question above — your next message will be combined with the original request.
        </p>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !loading) void send(); }}
          placeholder={pendingOriginal ? 'e.g. "5 days"' : 'e.g. "gypsum board delivery is delayed by 5 days"'}
          style={{ flex: 1, minWidth: 420 }}
          autoFocus
        />
        <button className="primary" disabled={loading || !input.trim()} onClick={() => void send()}>
          {loading ? 'Thinking…' : 'Send'}
        </button>
      </div>
    </div>
  );
}