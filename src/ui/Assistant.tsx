import { useEffect, useMemo, useRef, useState } from 'react';
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

/* ---- Asking out loud ------------------------------------------------------
 *
 * The browser's own speech recognition, not a transcription service. Site work
 * is where these questions come from and a phone on a noisy floor is a bad place
 * to type "gypsum board delivery is delayed by five days" — but recording audio
 * and posting it somewhere to be transcribed would mean another key to hold,
 * another allowance to spend, and site conversation leaving the machine. The
 * browser already does this, so it costs nothing and adds no dependency.
 *
 * Typed by hand because the API is not in TypeScript's DOM library: it is still
 * a draft, and Chrome and Edge ship it under a `webkit` prefix. Only the handful
 * of members actually used are declared, rather than casting the lot to `any`
 * and losing the checking everywhere it is touched.
 */
interface SpeechAlternative { readonly transcript: string }
interface SpeechResult { readonly isFinal: boolean; readonly length: number; readonly [i: number]: SpeechAlternative }
interface SpeechResultList { readonly length: number; readonly [i: number]: SpeechResult }
interface SpeechEvent { readonly resultIndex: number; readonly results: SpeechResultList }
interface SpeechRecogniser {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecogniserCtor = new () => SpeechRecogniser;

/** The constructor, or null where the browser has none (Firefox, older Safari). */
function speechRecogniser(): SpeechRecogniserCtor | null {
  if (typeof window === 'undefined') return null;   // the app is also rendered to a string in tests
  const w = window as unknown as { SpeechRecognition?: SpeechRecogniserCtor; webkitSpeechRecognition?: SpeechRecogniserCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** What went wrong, said in terms of what to do about it. */
const VOICE_ERROR: Record<string, string> = {
  'not-allowed': 'The microphone is blocked for this site. Allow it in the browser’s address bar, then try again.',
  'service-not-allowed': 'The microphone is blocked for this site. Allow it in the browser’s address bar, then try again.',
  'no-speech': 'Nothing was heard. Try again, closer to the microphone.',
  'audio-capture': 'No microphone was found on this machine.',
  network: 'Speech recognition could not reach the network. Type the question instead.',
};
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

  // ---- dictation --------------------------------------------------------
  const [listening, setListening] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const recogniser = useRef<SpeechRecogniser | null>(null);
  /**
   * What was already in the box when dictation started.
   *
   * Speech arrives as a transcript that GROWS and is revised — the same phrase
   * comes back several times as it is re-heard. Appending each event would stack
   * up "flooring is flooring is delayed flooring is delayed by five days", so
   * every event rewrites the field as {what was typed before} + {transcript so
   * far}. That is also what lets someone type half the question and speak the
   * rest.
   */
  const dictationBase = useRef('');
  const voiceSupported = useMemo(() => speechRecogniser() !== null, []);

  // Stop listening if the tab is left mid-sentence: the recogniser holds the
  // microphone open, and an indicator that stays lit after the screen is gone is
  // alarming in a way the feature does not warrant.
  useEffect(() => () => recogniser.current?.abort(), []);

  const toggleVoice = () => {
    if (listening) { recogniser.current?.stop(); return; }
    const Ctor = speechRecogniser();
    if (!Ctor) return;
    setVoiceErr(null);
    dictationBase.current = input ? `${input.trimEnd()} ` : '';
    const r = new Ctor();
    // en-IN: every project in here is an Indian fit-out, and the trade words —
    // gypsum, chajja, Vadodara — are recognised far better against that voice
    // model than against the en-US default.
    r.lang = 'en-IN';
    r.continuous = false;      // one question, then stop; it ends on its own after a pause
    r.interimResults = true;   // show the words as they are heard, so it is visibly working
    r.onresult = (e) => {
      let heard = '';
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      setInput(dictationBase.current + heard.trimStart());
    };
    r.onerror = (e) => {
      // "aborted" is what a deliberate stop reports; it is not a failure.
      if (e.error !== 'aborted') setVoiceErr(VOICE_ERROR[e.error] ?? `Speech recognition failed (${e.error}).`);
    };
    r.onend = () => setListening(false);
    recogniser.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setVoiceErr('Speech recognition could not start. Try again.');
    }
  };

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

      {listening && (
        <p className="chat-listening" aria-live="polite">
          <span className="chat-mic-dot" /> Listening — speak the question. It stops on its own when you finish.
        </p>
      )}
      {voiceErr && <p className="chat-voice-err" aria-live="polite">{voiceErr}</p>}

      <div className="row" style={{ marginTop: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !loading) void send(); }}
          placeholder={pendingOriginal ? 'e.g. "5 days"' : 'e.g. "what\'s the project status" or "gypsum board delivery is delayed by 5 days"'}
          style={{ flex: 1, minWidth: 420 }}
          autoFocus
        />
        {/* Dictation fills the box; it does NOT send. A misheard "fifteen" for
            "fifty" in a delay is a different programme, so the words get read
            before they are acted on — the same reason a replan is previewed and
            approved rather than applied. Hidden outright where the browser has no
            recogniser: a permanently dead control invites clicking. */}
        {voiceSupported && (
          <button
            type="button"
            className={`chat-mic ${listening ? 'on' : ''}`}
            onClick={toggleVoice}
            disabled={loading}
            aria-pressed={listening}
            title={listening ? 'Stop listening' : 'Ask by voice'}
            aria-label={listening ? 'Stop listening' : 'Ask by voice'}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="2" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v3" />
            </svg>
          </button>
        )}
        <button className="primary" disabled={loading || !input.trim()} onClick={() => void send()}>
          {loading ? 'Thinking…' : 'Send'}
        </button>
      </div>
      </div>
    </div>
  );
}