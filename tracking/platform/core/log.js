// ===================================================================
// DnB-OS . platform/core/log.js . THE RECORD, AND THE VIEW OF IT
// Everything the engine learns is an event on an append-only log. The
// snapshot everything reads — facts.json — is the fold of that log, and
// it is a CACHE. Delete it and it rebuilds; delete the log and the
// project's memory is gone.
//
// This exists because the engine has to answer two different questions:
//   "what do we know"            — the snapshot answers that
//   "what did we know on the 12th, and were we right"
//                                — only the log can answer that
// A tracking engine that cannot answer the second one is a reporting
// tool. Every previous version of this rewrote its state file on each
// read, so the second question had no answer at all.
//
//   append(dir, events)     add to the log, never edit it
//   read(dir, opts)         the events, in order, optionally as of a day
//   snapshot(dir, opts)     the fold — the state as of now, or as of then
//   identity(fact)          the stable key that makes a re-read supersede
//   factEvents(facts, opts) facts -> fact.record events
//
// THE LAWS
//   . THE LOG IS APPEND-ONLY. There is no update and no delete. A wrong
//     fact is corrected by a later event that supersedes it, and both
//     stay readable, because "when did this change and who changed it"
//     is a question somebody always asks eventually.
//   . THE CELL IS THE IDENTITY. A fact is keyed by the document, the
//     place inside it, and what it says about the subject. Reading the
//     same cell again writes a new event with the same key, so the fold
//     supersedes rather than duplicating — and the log shows the change.
//   . AS-OF IS A FILTER, NOT A DIFFERENT STORE. Asking what was known on
//     a day is the same fold over the events up to that day. One law,
//     one code path, no second implementation to drift.
//   . THE SNAPSHOT IS NEVER THE TRUTH. It carries the event count and
//     the day it was folded to, so a stale one is visible rather than
//     quietly wrong.
//
// I/O lives here on purpose: spine.js stays pure so its guards can break
// it offline, and this file is the only thing that touches a disk.
// ===================================================================

const fs = require("fs"), path = require("path");
const SPINE = require("./spine.js");

const LOG = "events.jsonl";
const SHARDS = "events.d";
const SNAP = "facts.json";

function logPath(dir) { return path.join(dir, LOG); }
function shardDir(dir) { return path.join(dir, SHARDS); }

// A LOG THAT SEVERAL READERS WRITE AT ONCE IS A DIRECTORY, NOT A FILE.
// Appending an 8 MB batch is one write(), and two processes doing that to
// one file can interleave mid-line — which corrupts the record silently,
// the single worst failure this store can have. Each writer gets its own
// shard; reading is the union, in timestamp order, exactly as before.
function shardPath(dir, who) {
  fs.mkdirSync(shardDir(dir), { recursive: true });
  return path.join(shardDir(dir), String(who || process.pid) + ".jsonl");
}

// ---- append ------------------------------------------------------------
// One event per line. A line is written whole or not at all, so a crash
// mid-write costs the last event and never the log.
function append(dir, events, opts) {
  const list = (events || []).filter(Boolean);
  if (!list.length) return { appended: 0 };
  fs.mkdirSync(dir, { recursive: true });
  const lines = list.map(e => JSON.stringify(e)).join("\n") + "\n";
  const target = (opts && opts.single) ? logPath(dir) : shardPath(dir, opts && opts.who);
  fs.appendFileSync(target, lines);
  return { appended: list.length, to: path.basename(target) };
}

// ---- read --------------------------------------------------------------
// opts.asOf: an ISO day. Events after it are not read, so the fold gives
// the state as it stood then.
// READING IS THE UNION OF EVERY SHARD, IN ORDER. One writer or twenty, the
// caller sees one log; the sharding is a concurrency detail and never a
// thing the rest of the engine has to know about.
function read(dir, opts) {
  const o = opts || {};
  const parts = [];
  if (fs.existsSync(logPath(dir))) parts.push(logPath(dir));
  if (fs.existsSync(shardDir(dir)))
    fs.readdirSync(shardDir(dir)).filter(n => n.endsWith(".jsonl")).sort()
      .forEach(n => parts.push(path.join(shardDir(dir), n)));
  const out = [], broken = [];
  for (const p of parts) {
    const lines = fs.readFileSync(p, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      let ev; try { ev = JSON.parse(line); }
      // A LINE THAT WILL NOT PARSE IS REPORTED, NOT SKIPPED IN SILENCE.
      catch (e) { broken.push({ file: path.basename(p), line: i + 1, why: "not JSON: " + e.message }); continue; }
      if (o.asOf && String(ev.ts || "") > o.asOf + "￿") continue;
      out.push(ev);
    }
  }
  // the fold orders by ts then seq anyway; sorting here keeps read() honest
  out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)) || (a.seq || 0) - (b.seq || 0));
  if (broken.length) out.broken = broken;
  return out;
}

function snapshot(dir, opts) {
  const events = read(dir, opts);
  const s = SPINE.fold(events);
  s.foldedAt = new Date().toISOString();
  s.asOf = (opts && opts.asOf) || null;
  s.eventsRead = events.length;
  if (events.broken) s.brokenLines = events.broken;
  return s;
}

// ---- the identity that makes a re-read supersede ----------------------
// THE CELL IS THE IDENTITY. Not the value, not a running number — the
// document, the place in it, and what it says. Read Milestones!C6 again
// and you write the same key, so the fold replaces and the log remembers.
function identity(f) {
  const src = f.source || {};
  // THE SUBJECT IS PART OF THE IDENTITY. A fact is a statement ABOUT
  // something, and one place in a document can carry statements about two
  // different things: a CAD polygon labelled both LADIES RESTROOM and GENTS
  // RESTROOM, a contract clause naming both the Company and the Contractor.
  // Keying on the place alone silently collapses them into one — which
  // destroys the very shared-polygon conflict this engine exists to raise.
  return [src.doc || "?", src.where || "?", f.subject || "?", f.role || f.kind || "?"].join("||");
}

// AN EVENT RECORDS A CHANGE, NOT A RE-RUN. Reading the same folder twice
// with nothing altered must add nothing to the log: a log that doubles on
// every read is a log nobody can read, and "when did this change" drowns in
// ten thousand restatements of the same number. opts.against is the fold of
// what is already there.
function factEvents(facts, opts) {
  const o = opts || {};
  const ts = o.ts || new Date().toISOString();
  const known = (o.against && o.against.facts) || null;
  const out = [];
  let unchanged = 0, revived = 0;
  for (const f of (facts || [])) {
    const key = identity(f);
    if (known) {
      const prior = known[key];
      // A TOMBSTONED FACT IS NEVER "UNCHANGED". The tombstone carries the
      // old VALUE (goneEvents spreads the fact it is burying), so a key that
      // stopped being read and is now read again — same cell, same number —
      // matches on value and gets skipped as a re-run. The tombstone then
      // stands for ever and the fact stays buried, with nothing on the log
      // to say why. This is not hypothetical: a shape-selection fix made one
      // ingest stop producing 1,373 R5 BOQ keys and the next ingest produce
      // them again identically, and the fold lost every one of them.
      // Believing something again IS a change, and it has to be said out
      // loud, exactly once.
      if (prior && prior.__gone) revived++;
      else if (prior && String(prior.value) === String(f.value) &&
          String(prior.conf) === String(f.conf) && String(prior.unit) === String(f.unit)) {
        unchanged++; continue;
      }
    }
    out.push(SPINE.makeEvent("fact.record", key,
      { ...f, day: o.day || ts.slice(0, 10) },
      { ts, actor: o.actor || "ingest", seq: out.length,
        source: o.source || (f.source && f.source.doc) || null, project: o.project || null }));
  }
  out.unchanged = unchanged;
  out.revived = revived;
  return out;
}

// FACTS THAT WERE ON THE LOG AND ARE NO LONGER READ. A document deleted, a
// sheet whose columns were re-settled, a rule that stopped matching — the
// facts it used to produce do not vanish, they are tombstoned, so the log
// says the engine stopped believing them and when.
function goneEvents(facts, opts) {
  const o = opts || {};
  const known = (o.against && o.against.facts) || {};
  const nowKeys = {}; (facts || []).forEach(f => nowKeys[identity(f)] = 1);
  const ts = o.ts || new Date().toISOString();
  const scope = o.scope || null;      // only tombstone within what was re-read
  return Object.keys(known)
    .filter(k => !nowKeys[k] && !known[k].__gone)
    .filter(k => !scope || scope(known[k]))
    .map((k, i) => SPINE.makeEvent("fact.record", k,
      { ...known[k], __gone: true, day: ts.slice(0, 10),
        note: "no longer read out of this document" },
      { ts, actor: o.actor || "ingest", seq: 100000 + i, project: o.project || null }));
}

// ---- what changed between two readings of the same thing --------------
// The reason the log exists. A re-read that moves a number is a revision,
// and a revision is a thing somebody has to be told about.
function supersessions(dir) {
  const events = read(dir).filter(e => e.kind === "fact.record");
  const byKey = {};
  events.forEach(e => (byKey[e.key] = byKey[e.key] || []).push(e));
  const out = [];
  for (const k of Object.keys(byKey)) {
    const list = byKey[k].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    for (let i = 1; i < list.length; i++) {
      const was = list[i - 1].value, now = list[i].value;
      if (now.__gone) { out.push({ key: k, subject: now.subject, role: now.role,
        was: was.value, now: "(no longer read)", wasOn: list[i-1].ts.slice(0,10),
        nowOn: list[i].ts.slice(0,10), gone: true,
        where: (now.source || {}).doc + " " + (now.source || {}).where }); continue; }
      if (String(was.value) === String(now.value)) continue;
      out.push({ key: k, subject: now.subject, role: now.role,
        was: was.value, now: now.value, wasOn: list[i - 1].ts.slice(0, 10), nowOn: list[i].ts.slice(0, 10),
        where: (now.source || {}).doc + " " + (now.source || {}).where });
    }
  }
  return out;
}

module.exports = { LOG, SHARDS, SNAP, logPath, shardDir, shardPath, append, read, snapshot, identity, factEvents, goneEvents, supersessions };
