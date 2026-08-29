// ===================================================================
// DnB-OS . platform/ingest/facts.js . WHAT THE ENGINE KNOWS
// The new engine's foundation. Every previous version displayed a
// project pack a person had written by hand after reading the documents.
// This one holds FACTS, and a fact is never just a value . it is a value
// with the document, sheet and cell it came out of.
//
//   fact(spec)                 make one, or refuse it with the reason
//   store()                    the collection, with conflict detection
//   materiality(f, opts)       assume it, or ask . the rule, as code
//   conflicts(store)           two documents disagreeing about one thing
//   ask(store)                 what a human has to answer, ranked
//
// THE LAWS
//   . NO PROVENANCE, NO FACT. A number with no document behind it cannot
//     be checked, cannot be argued from, and cannot be corrected when the
//     document is revised. It is refused at the door.
//   . TWO DOCUMENTS DISAGREEING IS NOT AN ERROR, IT IS A FINDING. The
//     engine does not pick the newer one, the bigger one, or the one it
//     read first. It reports both, with both sources, and asks.
//   . THE MATERIALITY GATE IS THE WHOLE PRODUCT RULE. An unknown may be
//     settled by the engine only if settling it wrongly would move no
//     milestone more than two working days, change no cost head, drop no
//     scope item and rename no owner. Anything else is a question. This
//     is not a heuristic . it is four computable tests.
//   . AN ASSUMPTION IS STILL RECORDED. Where the engine does settle
//     something, it writes down what it assumed and why it was allowed
//     to, so a wrong small call can be found later.
//   . A FACT IS NEVER OVERWRITTEN. A revised document adds a new fact
//     that supersedes the old one, and the old one stays readable. That
//     is how you answer "when did this change, and who changed it".
//
// Pure: specs in, a store out. No clock, no filesystem, no DOM.
// ===================================================================

;(function (root) {

// what a fact can be about . the engine's whole vocabulary of knowledge
const KINDS = {
  area:       { unit: "sqft",  moves: ["quantity", "duration", "cost"] },
  quantity:   { unit: "varies", moves: ["duration", "cost"] },
  money:      { unit: "INR",   moves: ["cost"] },
  date:       { unit: "iso",   moves: ["milestone"] },
  duration:   { unit: "days",  moves: ["milestone"] },
  person:     { unit: "name",  moves: ["owner"] },
  scope:      { unit: "item",  moves: ["scope"] },
  term:       { unit: "text",  moves: ["cost", "milestone"] },
  rate:       { unit: "INR/unit", moves: ["cost"] },
  count:      { unit: "n",     moves: ["quantity"] },
};

// how sure the reader was. Not a feeling: each has a test.
const CONF = {
  measured:  3,   // computed off geometry or read from a numeric cell
  stated:    2,   // written in words in a document, unambiguously
  derived:   1,   // arithmetic on other facts, each of which is present
  inferred:  0,   // pattern-matched from prose . always material
};

function fact(spec) {
  const s = spec || {};
  if (!s.id)                    return { ok: false, why: "a fact needs an id, or it cannot be superseded later" };
  if (!KINDS[s.kind])           return { ok: false, why: "unknown kind: " + s.kind };
  if (s.value == null || s.value === "")
    return { ok: false, why: "a fact with no value is not a fact" };
  // THE DOOR. No provenance, no entry.
  const src = s.source || {};
  if (!src.doc)                 return { ok: false, why: "a fact needs the document it came from" };
  if (!src.where)               return { ok: false, why: "a fact needs where in that document — a sheet and cell, a layer, a page, a line" };
  if (CONF[s.conf] == null)     return { ok: false, why: "say how it was known: " + Object.keys(CONF).join(", ") };

  return { ok: true, fact: {
    id: String(s.id), kind: s.kind, subject: s.subject || null,
    // WHAT THIS FACT SAYS ABOUT THE SUBJECT. A milestone's planned start and
    // its planned finish are both dates about one subject, and they are not
    // competing claims. Without a role the store read them as a conflict and
    // asked a person to choose between a start and a finish.
    role: s.role || null,
    value: s.value, unit: s.unit || KINDS[s.kind].unit,
    conf: s.conf,
    source: { doc: String(src.doc), where: String(src.where), read: src.read || null },
    note: s.note || null,
    supersedes: s.supersedes || null,
  } };
}

// ---- the store --------------------------------------------------------
function store(facts) {
  const byId = {}, bySubject = {}, rejected = [];
  const add = (spec) => {
    const r = fact(spec);
    if (!r.ok) { rejected.push({ spec, why: r.why }); return null; }
    const f = r.fact;
    // A FACT IS NEVER OVERWRITTEN. A later reading of the same subject is a
    // new fact that supersedes; both stay readable.
    byId[f.id] = f;
    const k = (f.subject || "") + "|" + f.kind + "|" + (f.role || "");
    (bySubject[k] = bySubject[k] || []).push(f);
    return f;
  };
  (facts || []).forEach(add);
  return { byId, bySubject, rejected, add,
    all: () => Object.keys(byId).sort().map(k => byId[k]),
    of: (subject, kind, role) => (bySubject[(subject || "") + "|" + kind + "|" + (role || "")] || []).slice() };
}

// ---- two documents disagreeing ----------------------------------------
// Not an error. A finding, with both sides named.
function conflicts(st) {
  const out = [];
  for (const key of Object.keys(st.bySubject || {})) {
    const list = st.bySubject[key].filter(f => !f.supersedes);
    if (list.length < 2) continue;
    // TWO NUMBERS THAT ARE THE SAME NUMBER ARE NOT A DISAGREEMENT. A rate
    // that comes back 3069.36 from one sheet and 3069.3599999999997 from
    // another is one rate and a floating point remainder. Raising it wastes
    // the one thing a conflict list has: a person's attention.
    const same = (a, b) => {
      if (String(a) === String(b)) return true;
      const x = Number(a), y = Number(b);
      if (!isFinite(x) || !isFinite(y)) return false;
      return Math.abs(x - y) <= Math.max(1e-6, Math.abs(x) * 1e-9);
    };
    const distinct = [];
    for (const f of list) {
      const same_ = distinct.find(d => same(d.value, f.value));
      if (same_) same_.also.push(f.source); else distinct.push({ value: f.value, unit: f.unit, source: f.source, conf: f.conf, also: [] });
    }
    if (distinct.length < 2) continue;
    const [subject, kind, role] = key.split("|");
    out.push({ subject, kind, role: role || null, options: distinct,
      // the engine does NOT pick. Not the newest, not the biggest, not the
      // one it read first . every one of those is a rule somebody would be
      // surprised by when it turned out wrong.
      why: distinct.length + " sources give a different " + (role || kind) + " for " + (subject || "this") + ", and the engine will not choose between them",
      moves: KINDS[kind] ? KINDS[kind].moves : [] });
  }
  return out.sort((a, b) => (a.subject < b.subject ? -1 : 1));
}

// ---- THE MATERIALITY GATE ---------------------------------------------
// The rule the whole product turns on, written as four computable tests.
// An unknown may be settled by the engine ONLY if getting it wrong would:
//   move no milestone by more than `dayBand` working days,
//   change no cost head,
//   drop or add no scope item,
//   and rename no owner.
const DAY_BAND = 2;

function materiality(u, opts) {
  const o = opts || {};
  const band = o.dayBand == null ? DAY_BAND : o.dayBand;
  const tests = [];

  const days = Math.abs(Number(u.movesDaysBy || 0));
  tests.push({ test: "milestone", fails: days > band,
    say: days > band ? "getting it wrong moves a milestone by " + days + " working days"
                     : "getting it wrong moves no milestone more than " + band + " days" });

  tests.push({ test: "cost", fails: !!u.movesCost,
    say: u.movesCost ? "it changes what a cost head carries" : "no cost head moves" });

  tests.push({ test: "scope", fails: !!u.movesScope,
    say: u.movesScope ? "it adds or drops scope" : "no scope item changes" });

  tests.push({ test: "owner", fails: !!u.movesOwner,
    say: u.movesOwner ? "it changes whose work this is" : "nobody's name changes" });

  const failed = tests.filter(t => t.fails);
  return {
    material: failed.length > 0,
    verdict: failed.length ? "ask" : "assume",
    tests, failed: failed.map(t => t.test),
    // an ASSUMPTION IS STILL RECORDED . a small wrong call has to be findable
    why: failed.length
      ? "a human decides this: " + failed.map(t => t.say).join("; ")
      : "the engine may settle this: " + tests.map(t => t.say).join("; "),
  };
}

// ---- what a human has to answer ---------------------------------------
function ask(st, unknowns, opts) {
  const out = [];
  for (const c of conflicts(st)) {
    out.push({ kind: "conflict", subject: c.subject, about: c.kind,
      question: "Which is right for " + (c.subject || "this") + "? " +
        c.options.map(o => o.value + " " + (o.unit || "") + " (" + o.source.doc + ")").join("  vs  "),
      options: c.options, moves: c.moves, why: c.why });
  }
  for (const u of (unknowns || [])) {
    const m = materiality(u, opts);
    if (!m.material) continue;
    out.push({ kind: "unknown", subject: u.subject || null, about: u.about || null,
      question: u.question, moves: m.failed, why: m.why });
  }
  // what moves a date first, then money, then scope, then a name
  const rank = { milestone: 0, cost: 1, scope: 2, owner: 3 };
  return out.sort((a, b) =>
    ((rank[(a.moves || [])[0]] == null ? 9 : rank[a.moves[0]]) -
     (rank[(b.moves || [])[0]] == null ? 9 : rank[b.moves[0]])) ||
    (String(a.subject) < String(b.subject) ? -1 : 1));
}

// what the engine settled on its own, and was allowed to
function assumed(unknowns, opts) {
  return (unknowns || []).map(u => ({ u, m: materiality(u, opts) }))
    .filter(x => !x.m.material)
    .map(x => ({ subject: x.u.subject || null, about: x.u.about || null,
      took: x.u.engineTakes, question: x.u.question, why: x.m.why }));
}

function line(st, unknowns, opts) {
  const q = ask(st, unknowns, opts), a = assumed(unknowns, opts);
  const n = st.all().length;
  return n + " fact" + (n === 1 ? "" : "s") + " read, every one with its document. " +
    (q.length ? q.length + " thing" + (q.length === 1 ? "" : "s") + " a person has to decide"
              : "nothing material is unresolved") +
    (a.length ? ", " + a.length + " settled by the engine and written down" : "") + ".";
}

const FACTS = { KINDS, CONF, DAY_BAND, fact, store, conflicts, materiality, ask, assumed, line };
root.INGEST_FACTS = FACTS;
if (typeof module !== "undefined" && module.exports) module.exports = FACTS;

})(typeof window !== "undefined" ? window : globalThis);
