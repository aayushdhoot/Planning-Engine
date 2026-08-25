// ===================================================================
// DnB-OS . platform/core/spine.js . THE PROJECT SPINE
// One store behind Plan, Track and Site. Two engines used to keep two
// localStorage islands, so a published plan never reached the site and
// the site's truth never reached the plan. This law holds the shared
// record, under the same discipline as everything else in the engine.
//
// The shape:
//   . writes APPEND. Every change is an event on a log, never an edit
//     in place. Two people writing at once cannot clobber each other,
//     and the audit trail is a free consequence, not a feature.
//   . reads FOLD. The log folds into one snapshot, deterministically.
//   . the fold is PURE. Events in, snapshot out. No clock, no storage,
//     no network, no randomness, so the guards break it offline.
//
// The laws:
//   . an event without ts, actor and kind is REFUSED and collected. It
//     is never silently dropped and never silently accepted.
//   . the fold is IDEMPOTENT by event id. The transport retries and the
//     offline queue replays, so folding the same event twice must
//     change nothing. This is the law that makes the log safe to resend.
//   . an UNKNOWN kind is carried through untouched, never dropped. An
//     older tab must not delete what a newer tab wrote.
//   . order is ts, ties broken by seq. Deterministic on every machine.
//   . a removal is a tombstone event. Nothing ever leaves the log.
//   . a tombstone is not undone by an EARLIER write. Only a later one
//     re-adds, and that is an explicit act.
//   . a patch that lands before its record CREATES it, flagged orphan.
//     Out of order delivery must never lose a fact.
//
// Transport is injectable and lives outside the fold, so the law can be
// tested with no Google account and no browser.
// ===================================================================

;(function (root) {

const SCHEMA_VERSION = 1;

// ---- the kinds ----------------------------------------------------
// into: which collection in the snapshot
// mode: how the event lands
//   merge   one singleton object, shallow merged, last field wins
//   keyed   a map by key, the whole record replaced by the latest
//   patch   a map by key, shallow merged into what is already there
//   drop    a tombstone by key
//   version an ordered list, appended, never replaced
const KINDS = {
  "project.set":        { into: "project",      mode: "merge"   },
  "conditions.set":     { into: "conditions",   mode: "merge"   },
  "zone.set":           { into: "zones",        mode: "keyed"   },
  "zone.remove":        { into: "zones",        mode: "drop"    },
  "fact.record":        { into: "facts",        mode: "keyed"   },
  "query.raise":        { into: "queries",      mode: "keyed"   },
  "query.answer":       { into: "queries",      mode: "patch"   },
  "person.set":         { into: "people",       mode: "keyed"   },
  "person.remove":      { into: "people",       mode: "drop"    },
  "allocation.set":     { into: "allocation",   mode: "keyed"   },
  "plan.publish":       { into: "plan",         mode: "version" },
  "manpower.set":       { into: "manpowerPlan", mode: "keyed"   },
  "material.set":       { into: "materialPlan", mode: "keyed"   },
  "material.confirm":   { into: "materialPlan", mode: "patch"   },
  "expectation.set":    { into: "expectations", mode: "keyed"   },
  "observation.record": { into: "observations", mode: "keyed"   },
  "taskStatus.set":     { into: "taskStatus",   mode: "keyed"   },
  "action.propose":     { into: "actions",      mode: "keyed"   },
  "action.decide":      { into: "actions",      mode: "patch"   },
  "revision.record":    { into: "revisions",    mode: "version" },
};

const SINGLETONS = ["project", "conditions"];
const LISTS      = ["plan", "revisions"];
const MAPS       = ["zones", "facts", "queries", "people", "allocation", "manpowerPlan",
                    "materialPlan", "expectations", "observations", "taskStatus", "actions"];

function emptySnapshot(projectId) {
  const s = { schema: SCHEMA_VERSION, project: { id: projectId || null },
    unknown: [], refused: [], tombstones: {}, seen: {}, events: 0 };
  SINGLETONS.forEach(k => { if (!s[k]) s[k] = {}; });
  LISTS.forEach(k => s[k] = []);
  MAPS.forEach(k => s[k] = {});
  return s;
}

// ---- validation ---------------------------------------------------
// An event is a claim about the project. A claim with no author, no
// time or no subject is not a claim, so it is refused by name.
function validate(ev) {
  if (!ev || typeof ev !== "object") return "event is not an object";
  if (!ev.kind) return "event has no kind";
  if (!ev.ts) return "event has no ts";
  if (!ev.actor) return "event has no actor";
  if (!/^\d{4}-\d{2}-\d{2}T/.test(String(ev.ts))) return "ts is not an ISO timestamp";
  const spec = KINDS[ev.kind];
  if (spec && spec.mode !== "merge" && spec.mode !== "version" && !ev.key)
    return "kind " + ev.kind + " needs a key";
  return null;
}

// key-sorted stringify, so two clients that build the same value with
// their fields in a different order still derive the same id.
function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}

// stable id when the writer did not supply one, so a resend of the same
// change folds once. Derived from content, never from a clock.
//
// The VALUE and the seq are part of the id on purpose. Without them two
// genuinely different writes, by one actor, on one key, inside the same
// millisecond, derive one id and the second is silently swallowed as a
// duplicate. Guard S8 caught exactly that: the dedupe that protects the
// log from retries was quietly eating real edits.
function eventId(ev) {
  if (ev && ev.id) return String(ev.id);
  return [ev.kind, ev.key || "", ev.ts, ev.actor,
    ev.seq == null ? "" : ev.seq, stableStringify(ev.value)].join("|");
}

// ---- ordering -----------------------------------------------------
// ts first, then seq (the order the log received it). Both are carried
// on the event, so the sort is identical on every machine.
function ordered(events) {
  return (events || []).map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const at = String(a.e && a.e.ts || ""), bt = String(b.e && b.e.ts || "");
      if (at !== bt) return at < bt ? -1 : 1;
      const as = Number(a.e && a.e.seq), bs = Number(b.e && b.e.seq);
      if (isFinite(as) && isFinite(bs) && as !== bs) return as - bs;
      return a.i - b.i;
    })
    .map(x => x.e);
}

// ---- the fold, pure ------------------------------------------------
// fold(events, base) -> snapshot. Feeding the same events twice, in any
// order, yields the same answer. base lets a client fold new events on
// top of a snapshot it already holds, which is what makes the cache work.
function fold(events, base) {
  const s = base ? JSON.parse(JSON.stringify(base)) : emptySnapshot();
  if (!s.seen) s.seen = {};
  if (!s.tombstones) s.tombstones = {};
  if (!s.unknown) s.unknown = [];
  if (!s.refused) s.refused = [];

  for (const ev of ordered(events)) {
    const bad = validate(ev);
    if (bad) { s.refused.push({ why: bad, event: ev }); continue; }

    const id = eventId(ev);
    if (s.seen[id]) continue;                     // idempotent by id
    s.seen[id] = ev.ts;
    s.events++;

    const spec = KINDS[ev.kind];
    if (!spec) {                                  // carried, never dropped
      s.unknown.push(ev);
      continue;
    }

    const into = spec.into;
    const stamp = { _by: ev.actor, _at: ev.ts, _source: ev.source || null };

    if (spec.mode === "merge") {
      s[into] = Object.assign({}, s[into], ev.value || {}, stamp);
      continue;
    }

    if (spec.mode === "version") {
      if (!Array.isArray(s[into])) s[into] = [];
      s[into].push(Object.assign({}, ev.value || {}, { _key: ev.key || null }, stamp));
      continue;
    }

    const tkey = into + "/" + ev.key;

    if (spec.mode === "drop") {
      s.tombstones[tkey] = ev.ts;
      if (s[into]) delete s[into][ev.key];
      continue;
    }

    // a tombstone stands until something LATER re-adds the record
    const dead = s.tombstones[tkey];
    if (dead && ev.ts <= dead) continue;
    if (dead) delete s.tombstones[tkey];

    if (!s[into]) s[into] = {};

    if (spec.mode === "keyed") {
      s[into][ev.key] = Object.assign({}, ev.value || {}, { key: ev.key }, stamp);
      continue;
    }

    if (spec.mode === "patch") {
      const had = s[into][ev.key];
      s[into][ev.key] = Object.assign({}, had || { key: ev.key, _orphan: true },
        ev.value || {}, { key: ev.key }, stamp);
      continue;
    }
  }
  return s;
}

// ---- writing ------------------------------------------------------
// Build an event. The caller supplies what it knows; the clock is the
// caller's, never this module's, so the fold stays pure and the guards
// can drive time by hand.
function makeEvent(kind, key, value, opts) {
  const o = opts || {};
  const ev = { kind: kind, key: key == null ? null : String(key),
    value: value == null ? {} : value,
    ts: o.ts || new Date().toISOString(), actor: o.actor || null,
    source: o.source || null, project: o.project || null };
  if (o.seq != null) ev.seq = o.seq;
  ev.id = o.id || eventId(ev);
  return ev;
}

// ---- migration from the two localStorage islands -------------------
// The old keys, named once so the migration and the guards agree. If a
// key is ever renamed, it is renamed here and nowhere else.
const LEGACY = {
  planning:  pid => "dnbos-plan-" + pid,
  pmnote:    "dnbos-track:skf:pmnote",
  delayreg:  "dnbos-track:skf:delayreg",
  walkroute: "dnbos-track:skf:walkroute",
  infer:     "dnbos-track:skf:infer",
};

// Gather what the old engines left in a browser. Pure apart from the
// reads, and it never deletes: the old keys stay exactly where they are
// until a human is satisfied the spine holds everything. A migration
// that destroys its own source cannot be re-run when it goes wrong.
function collectLegacy(store, projectId) {
  const read = k => { try { const r = store && store.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } };
  return {
    planning: projectId ? read(LEGACY.planning(projectId)) : null,
    tracking: {
      pmnote:    read(LEGACY.pmnote),
      delayreg:  read(LEGACY.delayreg),
      walkroute: read(LEGACY.walkroute),
      infer:     read(LEGACY.infer),
    },
  };
}

// Reads what the old engines wrote and turns it into events. Stable ids
// derived from the legacy key mean running it twice folds once, so a
// half finished migration is safe to repeat.
function migrateLegacy(blobs, opts) {
  const o = opts || {};
  const actor = o.actor || "migration";
  const ts = o.ts || "2026-07-31T00:00:00.000Z";
  const project = o.project || null;
  const out = [];
  const push = (kind, key, value, idSuffix) =>
    out.push(makeEvent(kind, key, value,
      { actor, ts, project, source: "legacy:" + idSuffix, id: "legacy|" + idSuffix }));

  // ---- planning: dnbos-plan-<pid> ----
  const p = blobs && blobs.planning;
  if (p) {
    if (p.win) push("project.set", null, { win: p.win }, "plan.win");
    if (p.cal) push("conditions.set", null, { cal: p.cal }, "plan.cal");
    if (p.fronts != null) push("project.set", null, { fronts: p.fronts }, "plan.fronts");
    (p.versions || []).forEach((v, i) =>
      push("plan.publish", null, v, "plan.version." + (v && v.v != null ? v.v : i)));
    (p.ilog || []).forEach((l, i) =>
      push("revision.record", null, l, "plan.ilog." + i));
    if (p.answers) {
      const a = p.answers;
      if (a.areaBasis) push("fact.record", "areaBasis", { value: a.areaBasis }, "plan.areaBasis");
      if (a.datesConfirmed) push("fact.record", "datesConfirmed", { value: true }, "plan.datesConfirmed");
      Object.keys(a.resolved || {}).forEach(k =>
        push("query.answer", k, { answer: a.resolved[k], status: "answered" }, "plan.resolved." + k));
      Object.keys(a.qtyOverride || {}).forEach(k =>
        push("fact.record", "qty:" + k, { value: a.qtyOverride[k], why: "user override" }, "plan.qty." + k));
      (a.progress || []).forEach((r, i) =>
        push("observation.record", "legacy-progress-" + i, r, "plan.progress." + i));
    }
  }

  // ---- tracking: dnbos-track:skf:* ----
  const t = blobs && blobs.tracking;
  if (t) {
    if (t.pmnote) push("fact.record", "pmnote", t.pmnote, "track.pmnote");
    if (t.walkroute) push("fact.record", "walkroute", t.walkroute, "track.walkroute");
    const dov = (t.delayreg && t.delayreg.byName) || {};
    Object.keys(dov).forEach(k =>
      push("fact.record", "delay:" + k, dov[k], "track.delay." + k));
    // the inference answers are human judgements. They are the most
    // valuable thing in the old store and they migrate as answers.
    Object.keys(t.infer || {}).forEach(k =>
      push("query.answer", k, t.infer[k], "track.infer." + k));
  }

  return out;
}

// ---- transport, injectable ----------------------------------------
// Everything above is pure. Everything below talks to the outside and
// is handed its io, so a test can drive it with a fake and the browser
// hands it fetch. The queue survives a reload: an append that cannot
// reach the log is kept and resent, so a write is never lost to a
// dropped connection on a site with two bars of signal.
function createClient(cfg) {
  const c = cfg || {};
  const io = c.io || {};
  const store = c.store || null;                 // localStorage-alike, optional
  const project = c.project || null;
  const qKey = "dnbos-spine:queue:" + (project || "default");
  const sKey = "dnbos-spine:snap:" + (project || "default");

  const readJSON = (k, d) => {
    try { const r = store && store.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; }
  };
  const writeJSON = (k, v) => {
    try { store && store.setItem(k, JSON.stringify(v)); } catch (e) {}
  };

  let queue = readJSON(qKey, []);
  let snap = readJSON(sKey, null);

  return {
    // what the app renders from: the cached snapshot with anything still
    // queued folded on top, so a write shows immediately and stays shown
    // even before the log has acknowledged it.
    current() { return fold(queue, snap || emptySnapshot(project)); },
    cached() { return snap; },
    pending() { return queue.slice(); },

    append(kind, key, value, opts) {
      const ev = makeEvent(kind, key, value,
        Object.assign({ project: project, actor: c.actor }, opts || {}));
      const bad = validate(ev);
      if (bad) throw new Error("spine refuses this event: " + bad);
      queue.push(ev); writeJSON(qKey, queue);
      return ev;
    },

    // send what is queued. Nothing leaves the queue until the log has
    // confirmed it, and a resend is safe because the fold dedupes by id.
    async flush() {
      if (!queue.length || !io.appendEvents) return { sent: 0, pending: queue.length };
      const batch = queue.slice();
      const res = await io.appendEvents(batch);
      if (!res || res.ok !== true) return { sent: 0, pending: queue.length, error: (res && res.error) || "append failed" };
      queue = queue.slice(batch.length); writeJSON(qKey, queue);
      return { sent: batch.length, pending: queue.length };
    },

    // Pull is a fold, done HERE. The script stores events and hands them
    // back; it never folds. One fold law, in one language, under the
    // guards . a second one written in Apps Script could drift from this
    // one and nothing would ever catch it.
    //
    // Cold start takes the cached snapshot for its base, then pulls only
    // the events written after it. A missing or stale cache costs a
    // slower first paint and nothing else, because the events are the
    // truth and the snapshot never is.
    async pull() {
      if (!io.fetchEvents) return snap;
      let base = snap, since = (snap && snap._seq) || 0;

      if (!base && io.fetchSnapshot) {
        const cold = await io.fetchSnapshot();
        if (cold && cold.ok === true && cold.snapshot) { base = cold.snapshot; since = cold.seq || 0; }
      }
      if (!base) { base = emptySnapshot(project); since = 0; }

      let guard = 0;
      while (guard++ < 200) {
        const res = await io.fetchEvents(since);
        if (!res || res.ok !== true) return snap || base;      // a bad read never damages the cache
        const evs = res.events || [];
        if (evs.length) { base = fold(evs, base); since = res.seq || since; }
        else { since = res.seq || since; }
        if (!res.more) break;
      }

      base._seq = since;
      snap = base; writeJSON(sKey, snap);
      return snap;
    },

    // hand the folded snapshot back for the next cold start. Best effort
    // on purpose: a failed cache write is not an error anyone should see.
    async putSnapshot() {
      if (!io.putSnapshot || !snap) return { ok: false };
      try { return await io.putSnapshot(snap, snap._seq || 0); } catch (e) { return { ok: false, error: String(e) }; }
    },

    async sync(opts) {
      const f = await this.flush();
      const s = await this.pull();
      if (opts && opts.cache) await this.putSnapshot();
      return { flush: f, snapshot: s };
    },
  };
}

// ---- the capture link adapter --------------------------------------
// The spine rides the Apps Script that already serves the pin walk, so
// there is one deployment, one permission grant and one URL to keep.
// POSTs go as text/plain because that is what keeps Apps Script out of a
// CORS preflight it cannot answer . the same trick the capture app uses.
function createCaptureIO(exec, project, fetchImpl) {
  const F = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  const post = async (body) => {
    if (!F) return { ok: false, error: "no fetch available" };
    try {
      const r = await F(exec, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body) });
      return await r.json();
    } catch (e) { return { ok: false, error: String(e) }; }
  };
  const get = async (qs) => {
    if (!F) return { ok: false, error: "no fetch available" };
    try { const r = await F(exec + qs); return await r.json(); }
    catch (e) { return { ok: false, error: String(e) }; }
  };
  const P = encodeURIComponent(project);
  return {
    appendEvents: (events) => post({ kind: "spine.append", project, events }),
    fetchEvents:  (since)  => get("?spine=events&project=" + P + "&since=" + (Number(since) || 0)),
    fetchSnapshot: ()      => get("?spine=snapshot&project=" + P),
    putSnapshot: (snapshot, seq) => post({ kind: "spine.snapshot", project, seq, snapshot }),
  };
}

const SPINE = { SCHEMA_VERSION, KINDS, SINGLETONS, LISTS, MAPS, LEGACY,
  emptySnapshot, validate, eventId, stableStringify, ordered, fold,
  makeEvent, collectLegacy, migrateLegacy, createClient, createCaptureIO };

root.CORE_SPINE = SPINE;
if (typeof module !== "undefined" && module.exports) module.exports = SPINE;

})(typeof window !== "undefined" ? window : globalThis);
