// ===================================================================
// DnB-OS . platform/track/ledger.js . THE EVIDENCE LEDGER
// Append only. A fact once written is frozen; corrections come in as
// NEW facts that supersede, so the trail of who knew what when stays
// whole. Queries live here too: every gap the engine sees becomes a
// question a human can answer.
// ===================================================================

;(function (root) {

const KEY = "dnbos-track:skf";
const CONFIDENCE = ["locked", "high", "medium", "low"];

const state = {
  facts: [],     // frozen fact objects
  queries: [],   // { id, ts, about, question, blocking, status, answer }
  files: [],     // absorbed file records from the intake gate
  seq: 0
};

function nextId(prefix) { state.seq++; return prefix + "-" + String(state.seq).padStart(4, "0"); }

function addFact(f) {
  if (!f || !f.source) throw new Error("fact needs a source");
  if (!CONFIDENCE.includes(f.confidence)) throw new Error("fact needs a confidence level: " + CONFIDENCE.join("/"));
  if (!f.text) throw new Error("fact needs text");
  const fact = Object.freeze(Object.assign({}, f, {
    id: nextId("F"), ts: f.ts || new Date().toISOString(), supersededBy: null
  }));
  state.facts.push(fact);
  return fact;
}

// corrections supersede, they never edit
function supersede(oldId, newFactData) {
  const idx = state.facts.findIndex(f => f.id === oldId);
  if (idx < 0) throw new Error("no fact " + oldId);
  const fresh = addFact(Object.assign({}, newFactData, { supersedes: oldId }));
  const old = state.facts[idx];
  state.facts[idx] = Object.freeze(Object.assign({}, old, { supersededBy: fresh.id }));
  return fresh;
}

// The lifecycle fields an open point may carry: who owns it, when it
// was raised and due, and for a snag its pin, its photos and where it
// sits in the chain. The ledger only carries them, it never judges
// them. The owner law and the snag law live in platform/track/snag.js.
const LIFECYCLE = ["kind", "owner", "raised", "due", "pin", "photo", "proof",
                   "snagState", "wipOn", "closedOn", "actions"];

function addQuery(q) {
  if (!q || !q.question) throw new Error("query needs a question");
  const query = { id: nextId("Q"), ts: new Date().toISOString(),
    about: q.about || "general", question: q.question,
    blocking: !!q.blocking, status: "open", answer: null };
  for (const k of LIFECYCLE) if (q[k] !== undefined) query[k] = q[k];
  state.queries.push(query);
  return query;
}

function answerQuery(id, answer) {
  const q = state.queries.find(x => x.id === id);
  if (!q) throw new Error("no query " + id);
  q.status = "answered"; q.answer = answer; q.answeredTs = new Date().toISOString();
  return q;
}

function addFile(rec) { state.files.push(rec); return rec; }

function summary() {
  const open = state.queries.filter(q => q.status === "open");
  return {
    facts: state.facts.filter(f => !f.supersededBy).length,
    factsAll: state.facts.length,
    files: state.files.length,
    queriesOpen: open.length,
    queriesBlocking: open.filter(q => q.blocking).length,
    bySource: state.facts.reduce((a, f) => { a[f.source] = (a[f.source] || 0) + 1; return a; }, {})
  };
}

// ---- persistence (browser only, no-op under node tests) -------------
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ facts: state.facts, queries: state.queries, files: state.files, seq: state.seq })); } catch (e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    state.facts = (d.facts || []).map(f => Object.freeze(f));
    state.queries = d.queries || [];
    state.files = d.files || [];
    state.seq = d.seq || 0;
    return true;
  } catch (e) { return false; }
}
function reset() { state.facts = []; state.queries = []; state.files = []; state.seq = 0; }

root.TRACK_LEDGER = { state, addFact, supersede, addQuery, answerQuery, addFile, summary, save, load, reset, CONFIDENCE, LIFECYCLE };
if (typeof module !== "undefined") module.exports = root.TRACK_LEDGER;

})(typeof window !== "undefined" ? window : globalThis);
