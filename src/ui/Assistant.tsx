import { useEffect, useRef, useState } from 'react';
import type { EngineConfig, ProjectInputs } from '../domain/types';
import type { ExternalDelay } from '../engine/planner';
import { fetchReplanPreview, ReplanClientError } from '../services/replan/browser-client';
import type { ReplanPreview } from '../services/replan/apply';

/**
 * What a reply keeps once the thread is stored.
 *
 * A `ReplanPreview` carries two WHOLE PLANS — `baseline`, and `revised` when the query was a
 * delay. Nothing outside apply.ts ever reads them: `baseline` is the intermediate the diff was
 * computed against, and the screen only ever asks `revised` whether it exists. Keeping them made
 * a single two-message thread 507 KB on disk, and the store holds every thread for every
 * project — a few days of use would have produced a file too big to open and slow to load, to
 * carry two plans nobody looks at.
 *
 * So a stored reply keeps exactly what the thread draws and what approving it needs: the
 * summary, the prose, the two end dates, the activities that actually moved, and the resolved
 * delays that get applied. That is ~1 KB instead of ~233 KB, and it is also the honest list of
 * what a saved conversation IS.
 */
export interface ChatPreview {
  kind: ReplanPreview['kind'];
  summary: string;
  answer?: string;
  clarifyingQuestion?: string;
  /** whether a revised plan was produced — the full plan itself is not kept */
  hasRevised: boolean;
  changedActivities: ReplanPreview['changedActivities'];
  resolvedDelays: ReplanPreview['resolvedDelays'];
  internalEndBefore: string | null;
  internalEndAfter: string | null;
  ieInvariantHoldsAfter: boolean | null;
}

export const toChatPreview = (p: ReplanPreview): ChatPreview => ({
  kind: p.kind,
  summary: p.summary,
  answer: p.answer,
  clarifyingQuestion: p.clarifyingQuestion,
  hasRevised: !!p.revised,
  changedActivities: p.changedActivities,
  resolvedDelays: p.resolvedDelays,
  internalEndBefore: p.internalEndBefore,
  internalEndAfter: p.internalEndAfter,
  ieInvariantHoldsAfter: p.ieInvariantHoldsAfter,
});

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text?: string; // user message, or an assistant-side error
  preview?: ChatPreview;
  approved?: boolean;
  discarded?: boolean;
}

/** everything Assistant needs to resume exactly where it left off for one project */
export interface ChatState {
  turns: ChatTurn[];
  pendingOriginal: string | null;
}

export const EMPTY_CHAT_STATE: ChatState = { turns: [], pendingOriginal: null };

let turnCounter = 0;
const uid = () => `turn-${++turnCounter}`;
/** One row in the history list. The thread itself stays in the store. */
export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
  turnCount: number;
}

export function Assistant({
  p, cfg, today, appliedDelays, chat, onChatChange, onApprove,
  history = [], activeId = null, onSelectChat, onNewChat, onDeleteChat, onRenameChat, storeError,
}: {
  p: ProjectInputs;
  cfg: EngineConfig;
  today: string;
  /** delays already approved this session for this project, so replies (including general
   * answers) reflect the plan the person is actually looking at elsewhere in the app */
  appliedDelays: ExternalDelay[];
  /** this project's chat — lifted up to App.tsx, keyed by project id, so it survives switching
   * tabs away and back, and starts fresh (or resumes) correctly when the project changes */
  chat: ChatState;
  /** functional updater (like useState's setter) — NOT a plain new value. send() below fires
   * two updates in one async call (the user's turn, then the assistant's reply); a plain-value
   * setter would apply both against the same stale `chat` prop and drop the first one. */
  onChatChange: (updater: (prev: ChatState) => ChatState) => void;
  /** lifts the resolved delays up to App.tsx, which folds them into buildPlan() for this
   * project going forward — session-only for now */
  onApprove: (delays: ExternalDelay[], summary: string) => void;
  /** this project's saved threads, newest first */
  history?: ChatSummary[];
  activeId?: string | null;
  onSelectChat?: (id: string) => void;
  onNewChat?: () => void;
  onDeleteChat?: (id: string) => void;
  onRenameChat?: (id: string, title: string) => void;
  /** why history could not be loaded or saved, when that is the case */
  storeError?: string | null;
}) {
  const { turns, pendingOriginal } = chat;
  const setTurns = (updater: (t: ChatTurn[]) => ChatTurn[]) => onChatChange((prev) => ({ ...prev, turns: updater(prev.turns) }));
  const setPendingOriginal = (v: string | null) => onChatChange((prev) => ({ ...prev, pendingOriginal: v }));
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
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
      const result = await fetchReplanPreview(p, cfg, today, effectiveQuery, appliedDelays);
      // only a delay-kind reply with an outstanding clarifying question continues the same
      // thread; a question/unclear reply (or a fully-resolved delay) closes it out
      setPendingOriginal(result.kind === 'delay' && result.clarifyingQuestion ? effectiveQuery : null);
      setTurns((t) => [...t, { id: uid(), role: 'assistant', preview: toChatPreview(result) }]);
    } catch (e) {
      setPendingOriginal(null);
      const msg = e instanceof ReplanClientError ? e.message : e instanceof Error ? e.message : String(e);
      setTurns((t) => [...t, { id: uid(), role: 'assistant', text: msg }]);
    } finally {
      setLoading(false);
    }
  };

  const approve = (turnId: string, preview: ChatPreview) => {
    if (!preview.resolvedDelays.length) return;
    onApprove(preview.resolvedDelays, preview.summary);
    setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, approved: true } : x)));
  };

  const discard = (turnId: string) => {
    setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, discarded: true } : x)));
  };

  return (
    <div className="chat-layout">
      {/* THE HISTORY COLUMN. Threads are per project, because a question about
          one job's flooring means nothing filed under another's. */}
      <aside className="chat-side">
        <button className="primary chat-new" onClick={() => onNewChat?.()}>+ New chat</button>
        <div className="chat-list">
          {history.length === 0 && <p className="muted chat-side-empty">No past chats for this project.</p>}
          {history.map((h) => (
            <div key={h.id} className={`chat-item ${h.id === activeId ? 'on' : ''}`}>
              <button className="chat-item-open" onClick={() => onSelectChat?.(h.id)} title={h.title}>
                <span className="chat-item-title">{h.title}</span>
                <span className="chat-item-meta">
                  {h.turnCount} message{h.turnCount === 1 ? '' : 's'}
                  {h.updatedAt ? ` · ${h.updatedAt.slice(0, 10)}` : ''}
                </span>
              </button>
              <span className="chat-item-tools">
                <button title="Rename this chat" aria-label={`Rename ${h.title}`}
                  onClick={() => {
                    const next = prompt('Name this chat', h.title);
                    if (next && next.trim()) onRenameChat?.(h.id, next.trim());
                  }}>✎</button>
                <button title="Delete this chat" aria-label={`Delete ${h.title}`}
                  onClick={() => {
                    // Asked, because a thread can carry an approved replan and the
                    // reasoning behind it, and there is nowhere to get it back from.
                    if (confirm(`Delete “${h.title}”?\n\nThe whole thread goes, including any revised plans reviewed in it. This cannot be undone.`))
                      onDeleteChat?.(h.id);
                  }}>🗑</button>
              </span>
            </div>
          ))}
        </div>
        {storeError && <p className="chat-side-err" title={storeError}>History is not being saved — {storeError}</p>}
      </aside>

      <div className="chat-main">
      <h2>AI Assistant</h2>
      <p className="muted" style={{ marginTop: -4, maxWidth: 780 }}>
        Ask a question about this project — status, dates, what's outstanding — or describe a delay or change,
        e.g. "flooring is delayed by 10 days", and review the revised plan before anything is applied. Nothing
        here overwrites your source documents; approving adds a replanning constraint on top, and the
        deterministic engine still computes every date.
      </p>

      <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border, #e2e2e2)', borderRadius: 10, padding: 14, marginTop: 10 }}>
        {turns.length === 0 && !loading && (
          <p className="muted" style={{ margin: 0 }}>No messages yet — ask about the project's status or a delay to get started.</p>
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

                    {(preview.kind === 'question' || preview.kind === 'unclear') && (
                      <p style={{ marginTop: 8, marginBottom: 0, whiteSpace: 'pre-wrap' }}>{preview.answer}</p>
                    )}

                    {preview.kind === 'delay' && preview.clarifyingQuestion && (
                      <p style={{ marginTop: 8, marginBottom: 0 }}>{preview.clarifyingQuestion}</p>
                    )}

                    {preview.kind === 'delay' && !preview.clarifyingQuestion && preview.hasRevised && (
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
          placeholder={pendingOriginal ? 'e.g. "5 days"' : 'e.g. "what\'s the project status" or "gypsum board delivery is delayed by 5 days"'}
          style={{ flex: 1, minWidth: 420 }}
          autoFocus
        />
        <button className="primary" disabled={loading || !input.trim()} onClick={() => void send()}>
          {loading ? 'Thinking…' : 'Send'}
        </button>
      </div>
      </div>
    </div>
  );
}