// ===================================================================
// DnB-OS . platform/track/driveindex.js . THE DRIVE DAY INDEX
// What is in Drive, and whether the engine has read it. One table, one
// truth: a walk day is shot, and separately it is read. The two are not
// the same thing and this law refuses to blur them.
//
// The laws:
//   . the index is what Drive answered, never a guess. A day the link
//     did not name is absent, it is not an empty day.
//   . a day is read only when the readings spine covers it. Photos in
//     Drive are not a reading and never count as one.
//   . coverage is arithmetic over the frozen register, never a feeling.
//   . the scan goes stale after 24 hours. Stale is shown, never hidden,
//     and the shown numbers stay the ones that were actually fetched.
//   . every pure function here runs offline so the guards can break it.
//
// The states a day can be in:
//   full     every pin in the frozen register was shot
//   partial  some pins shot, not all
//   empty    the folder exists but holds no photo
// ===================================================================

;(function (root) {

const KEY = "dnbos-track:skf:driveindex";
const STALE_HOURS = 24;
const STATES = ["full", "partial", "empty"];

// ---- the shape law: what Drive answered, cleaned, never invented ----
// A row the scanner cannot trust is dropped into `refused` with a
// reason, it is never quietly repaired into a good looking row.
function normalise(raw) {
  const rows = [], refused = [];
  for (const d of (raw || [])) {
    const day = String((d && d.day) || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      refused.push({ day: day || "(unnamed)", why: "the folder name is not a YYYY-MM-DD day" });
      continue;
    }
    // a count law of its own: null and undefined are missing, not zero.
    // Number(null) is 0, so a plain >= 0 test would quietly turn "the
    // link said nothing" into "the day was empty", which is a guess.
    const count = v => (v === null || v === undefined || v === "" || isNaN(Number(v))) ? null : Number(v);
    const pins = count(d.pins);
    const files = count(d.files);
    if (pins === null || files === null || pins < 0 || files < 0) {
      refused.push({ day: day, why: "the link answered without a usable photo count" });
      continue;
    }
    rows.push({
      day: day,
      pins: pins,
      files: files,
      blocked: count(d.blocked) > 0 ? count(d.blocked) : 0,
      first: d.first || null,
      last: d.last || null,
      by: Array.isArray(d.by) ? d.by.slice() : []
    });
  }
  rows.sort((a, b) => a.day < b.day ? 1 : -1);   // newest first
  return { rows, refused };
}

// ---- the state law ----
function stateOf(pins, total) {
  if (!pins) return "empty";
  return pins >= total ? "full" : "partial";
}

// share of the frozen register that was shot, 0..100, arithmetic only
function coverage(pins, total) {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round(100 * pins / total)));
}

// ---- the read law ----
// A day is read when the readings spine covers it. Nothing else counts:
// not photos sitting in Drive, not a note, not a person's word.
function isRead(day, readDays) {
  return (readDays || []).indexOf(day) !== -1;
}

// ---- the join: the index plus what the engine has actually read ------
// total is the frozen register size. readDays comes from the spine.
function build(raw, readDays, total) {
  const n = normalise(raw);
  const rows = n.rows.map(r => {
    const st = stateOf(r.pins, total);
    const read = isRead(r.day, readDays);
    return Object.assign({}, r, {
      total: total,
      state: st,
      coverage: coverage(r.pins, total),
      dark: Math.max(0, total - r.pins),
      read: read,
      // the one row that matters operationally: shot but never read
      unread: r.pins > 0 && !read,
      window: r.first && r.last ? { first: r.first, last: r.last } : null
    });
  });
  // a day the spine covers that Drive never showed: a reading with no
  // photos behind it. Surfaced, never dropped, because it means the
  // index and the spine disagree and a human should know.
  const inDrive = {};
  rows.forEach(r => { inDrive[r.day] = 1; });
  const orphans = (readDays || []).filter(d => !inDrive[d]);
  return { rows, refused: n.refused, orphans };
}

// ---- the roll up, built from the rows so it can never drift ----------
function summary(rows) {
  const s = { days: 0, full: 0, partial: 0, empty: 0, read: 0, unread: 0,
              photos: 0, latest: null, latestRead: null };
  for (const r of (rows || [])) {
    s.days++;
    s[r.state]++;
    s.photos += r.files;
    if (r.read) { s.read++; if (!s.latestRead || r.day > s.latestRead) s.latestRead = r.day; }
    if (r.unread) s.unread++;
    if (r.pins > 0 && (!s.latest || r.day > s.latest)) s.latest = r.day;
  }
  return s;
}

// ---- the staleness law ----
// scannedAt and now are ISO strings or Date. A scan with no timestamp is
// stale by definition: never seen is never fresh.
function ageHours(scannedAt, now) {
  if (!scannedAt) return null;
  const a = new Date(scannedAt), b = new Date(now || Date.now());
  if (isNaN(a) || isNaN(b)) return null;
  return (b - a) / 3600000;
}

function isStale(scannedAt, now, hours) {
  const age = ageHours(scannedAt, now);
  if (age == null) return true;
  return age >= (hours == null ? STALE_HOURS : hours);
}

// the one line the tab head carries. Built from the rows every time, so
// a number here can never disagree with the table under it.
function headline(rows, scannedAt, now) {
  const s = summary(rows);
  if (!s.days) return "Drive has not been scanned yet";
  const parts = [s.days + " day" + (s.days === 1 ? "" : "s") + " in Drive",
                 s.read + " read"];
  if (s.unread) parts.push(s.unread + " shot but not read");
  const age = ageHours(scannedAt, now);
  if (age != null) {
    parts.push(age < 1 ? "scanned just now"
      : "scanned " + Math.round(age) + " hour" + (Math.round(age) === 1 ? "" : "s") + " ago");
  }
  return parts.join(" · ");
}

// ---- the cache. The rows are what the link said, kept whole so a
// reopened tab shows the same numbers without hitting the network.
function save(payload) {
  try { localStorage.setItem(KEY, JSON.stringify(payload)); } catch (e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.scannedAt ? d : null;
  } catch (e) { return null; }
}
function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

// ---- network. Browser only, and it never throws into the view. -------
function fetchIndex(exec, timeoutMs) {
  if (typeof fetch === "undefined") return Promise.resolve({ ok: false, error: "no fetch in this runtime" });
  const ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs || 30000) : null;
  return fetch(exec + "?days=1", ctl ? { signal: ctl.signal } : {})
    .then(r => r.json())
    .catch(e => ({ ok: false, error: String(e && e.name === "AbortError" ? "timed out" : e) }))
    .finally(() => { if (t) clearTimeout(t); });
}

// ---- the read brief -------------------------------------------------
// The engine cannot read a photograph. It can hand over everything the
// reader needs so no step is assembled by hand: the day, the pins that
// were shot, each pin's space and where the camera stood, and the exact
// shape the answer must come back in. The reading law itself lives in
// data/skf/site_readings/READING_LAW.md and is quoted here so the brief
// travels on its own.
function readBrief(day, files, blocked, pinsReg, exec) {
  const shot = {};
  for (const f of (files || [])) {
    if (!shot[f.no] || (f.time || "") > (shot[f.no].time || "")) shot[f.no] = f;
  }
  const byNo = {};
  for (const p of pinsReg.pins) byNo[p.no] = p;
  const blockedBy = {};
  for (const b of (blocked || [])) blockedBy[b.no] = b;

  const rows = [];
  const darkPins = [];
  for (const p of pinsReg.pins) {
    const f = shot[p.no];
    if (!f) { if (!blockedBy[p.no]) darkPins.push(p.no); continue; }
    rows.push({
      pin: p.no,
      space: p.space,
      type: p.type,
      stand: { x: p.x, y: p.y },
      aim: p.aim,
      fov: pinsReg.fov,
      photo: { name: f.name, id: f.id, by: f.by || "", time: f.time || "" },
      url: exec + "?img=" + encodeURIComponent(f.id)
    });
  }
  rows.sort((a, b) => a.pin - b.pin);

  return {
    dnbos: "read-brief",
    project: "SKF Pune",
    day: day,
    builtBy: "the tracking engine Drive tab",
    register: { frozen: pinsReg.frozen, pins: pinsReg.pins.length, fov: pinsReg.fov },
    counts: { shot: rows.length, blocked: (blocked || []).length, dark: darkPins.length },
    dark: darkPins,
    blocked: (blocked || []).map(b => ({ pin: b.no, reason: b.reason || "", by: b.by || "" })),
    pins: rows,
    ask: "read this walk",
    law: [
      "Log only what is visible. One record per pin, work named per line.",
      "States allowed: started, ongoing, done, blocked, material_present, no_change.",
      "Tags allowed for the reader: seen, claimed, measured. Never write inferred, the engine applies its own named rules on absorb.",
      "A measured tag must carry {done, of, unit}. Confidence per line: high, medium, low. When unsure say so, never guess upward.",
      "A blocked pin is carried as its reason, not read.",
      "Work families: civil and blockwork, partitions and ceiling, flooring, paint and finishes, services (electrical, HVAC, plumbing, fire), materials lying on site.",
      "Also report safety. Any hazard visible in a photo goes in the safety list: work at height with no harness, missing helmets, open trenches or shafts without covers, live boards near water, blocked exits, fire load, damaged access. Give each one a severity of high, med or low and name the pin.",
      "Report good practice too, in the good list: barricades in place, signage up, helmets worn, tape on glass. A client report needs evidence of the standard being kept, not only an absence of flags."
    ],
    returns: {
      dnbos: "readings",
      project: "SKF Pune",
      day: day,
      readBy: "Claude walk read",
      readings: [{ day: day, source: "pin_photo", pin: 1,
        items: [{ work: "example work", state: "ongoing", tag: "seen", confidence: "high", note: "what the photo shows" }] }],
      safety: [{ day: day, sev: "high", cat: "Height", pins: [12], text: "what the hazard is and where" }],
      good: [{ day: day, pins: [38], text: "what is being done right" }]
    }
  };
}

// the human sheet that travels beside the json
function briefMarkdown(brief) {
  const L = [];
  L.push("# Read the walk . " + brief.day);
  L.push("");
  L.push("SKF Pune, " + brief.counts.shot + " pins shot, " + brief.counts.blocked +
         " blocked, " + brief.counts.dark + " dark against a frozen register of " +
         brief.register.pins + ".");
  L.push("");
  L.push("## The ask");
  L.push("");
  L.push("Read every pin photo listed below and answer with one readings json in the");
  L.push("shape at the end of the brief json. Drop that json on the engine's Drive tab");
  L.push("or the admin Inputs panel and the spine takes it from there.");
  L.push("");
  L.push("## The law");
  L.push("");
  brief.law.forEach(l => L.push("- " + l));
  L.push("");
  L.push("## The pins");
  L.push("");
  L.push("| Pin | Space | Photo | Shot by | Pull the image |");
  L.push("| --- | --- | --- | --- | --- |");
  brief.pins.forEach(p => {
    L.push("| " + p.pin + " | " + p.space + " | " + p.photo.name + " | " +
           (p.photo.by || "not captured") + " | " + p.url + " |");
  });
  if (brief.blocked.length) {
    L.push("");
    L.push("## Blocked, carried as the reason, not read");
    L.push("");
    brief.blocked.forEach(b => L.push("- pin " + b.pin + " . " + b.reason + " . by " + (b.by || "not captured")));
  }
  if (brief.dark.length) {
    L.push("");
    L.push("## Dark, nothing came");
    L.push("");
    L.push(brief.dark.join(", "));
  }
  return L.join("\n");
}

root.TRACK_DRIVEINDEX = {
  KEY, STALE_HOURS, STATES,
  normalise, stateOf, coverage, isRead, build, summary,
  ageHours, isStale, headline,
  save, load, clear, fetchIndex,
  readBrief, briefMarkdown
};
if (typeof module !== "undefined") module.exports = root.TRACK_DRIVEINDEX;

})(typeof window !== "undefined" ? window : globalThis);
