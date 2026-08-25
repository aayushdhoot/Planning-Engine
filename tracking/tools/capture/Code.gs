// ===================================================================
// SKF Pin Walk . Apps Script backend
// Receives photos and blocked reports from the capture app, files them
// in Drive under: 13 Site Tracking / pins / YYYY-MM-DD /
// The engine reads this folder, the phone never talks to the engine.
//
// Deploy (one time, with Sourabh's Google account):
//   1. script.google.com > New project > paste this file as Code.gs
//   2. Add an HTML file named "app", paste the built capture page in it
//   3. Deploy > New deployment > type: Web app
//        Execute as: Me
//        Who has access: Anyone with the link
//   4. First deploy asks for Drive permission, allow it
//   5. The /exec URL IS the app: open it on the phone, it serves the
//      pin walk page with the upload link already baked in
//
// Contract with the app (POST body, JSON as text/plain):
//   photo:   { kind:"photo", pin, day, name:"P07_2026-07-17.jpg", who, data:"data:image/jpeg;base64,..." }
//   blocked: { kind:"blocked", pin, day, name, who, reason }
// Response: { ok:true, saved:name } or { ok:false, error }
//
// Status check (GET ?day=YYYY-MM-DD): which pins have a photo for that
// day. The engine's dark list at 1 pm reads this.
//
// v3 additions (engine reads photos through the same link):
//   GET ?day=YYYY-MM-DD&files=1  ->  { ok, day, files:[{no,id,name,by,time,size}],
//                                      blocked:[{no,reason,by}] }
//   GET ?img=FILE_ID             ->  { ok, id, name, b64 } (jpeg as base64)
//   img only serves files inside the pins folder, the approved renders
//   folder, or a folder named in READ_FOLDER_IDS. Nothing else in the
//   drive, and never anything writable.
//
// v4 addition (the engine's Drive tab reads this):
//   GET ?days=1                  ->  { ok, days:[{day,pins,files,blocked,
//                                      first,last,by}], count }
//   The day index: every day folder that really exists, with how much is
//   in it. Read only on purpose. It must never call folderFor_, which
//   makes a folder when one is missing, so a scan can never write into
//   Drive the way probing ?day= for an empty date does.
// ===================================================================

// The pins folder inside the SKF SSOT: 13 Site Tracking / pins
// Made 17 Jul 2026, do not recreate by name, go straight to the id.
var PINS_FOLDER_ID = "1gHPIBkynXzHRmR1tkWZv59WN6tLBpkYR";

// The design team's approved 3D renders, one per pin. The engine pairs a
// render beside the site photo, so ?img= must be allowed to serve from
// here too. Read only: nothing is ever written into this folder.
var RENDERS_FOLDER_ID = "1nPponiA51lqVccL9jpr1KdLGC36-yVCz";

// Every other folder ?img= may read from. Read only, always. Adding a
// folder here is the only change needed when the engine has to see a new
// set of drawings, so this stops being a code change every time.
//   1YLGg...  MEP layouts, the 19 numbered sheets issued 01 Jul 2026
//   1cC5W...  architectural layouts, the R1 and R2 sheets
var READ_FOLDER_IDS = [
  "1YLGgCPCnkFk4wZSlPEOle2EjSChoTj-S",
  "1cC5Ws-9cqkHNeRhaP1jqNF21QxkMQ0Up"
];

function folderFor_(day) {
  var pins = DriveApp.getFolderById(PINS_FOLDER_ID);
  return getOrMake_(pins, day);
}

function getOrMake_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var r = JSON.parse(e.postData.contents);

    // the spine writes come through the same door, and are routed first
    // because they carry no day and no pin
    if (r && r.kind === "spine.append")   return spineAppend_(r);
    if (r && r.kind === "spine.snapshot") return spineSnapshotWrite_(r);

    if (!r || !r.day || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) return json_({ ok: false, error: "needs a day (YYYY-MM-DD)" });
    if (r.pin == null) return json_({ ok: false, error: "needs a pin number" });
    var folder = folderFor_(r.day);

    if (r.kind === "photo") {
      if (!r.data || r.data.indexOf("base64,") < 0) return json_({ ok: false, error: "photo needs image data" });
      var b64 = r.data.substring(r.data.indexOf("base64,") + 7);
      var name = r.name || ("P" + ("0" + r.pin).slice(-2) + "_" + r.day + ".jpg");
      // same pin re shot on the same day: keep both, suffix the redo
      var n = name, i = 1;
      while (folder.getFilesByName(n).hasNext()) { n = name.replace(/\.jpg$/, "_r" + i + ".jpg"); i++; }
      var blob = Utilities.newBlob(Utilities.base64Decode(b64), "image/jpeg", n);
      var file = folder.createFile(blob);
      file.setDescription("pin " + r.pin + " . " + r.day + " . by " + (r.who || "unknown"));
      return json_({ ok: true, saved: n });
    }

    if (r.kind === "blocked") {
      if (!r.reason) return json_({ ok: false, error: "a blocked pin needs a reason" });
      var logName = "blocked.txt";
      var line = r.day + " . pin " + r.pin + " . " + r.reason + " . by " + (r.who || "unknown") + "\n";
      var it = folder.getFilesByName(logName);
      if (it.hasNext()) { var f = it.next(); f.setContent(f.getBlob().getDataAsString() + line); }
      else folder.createFile(logName, line, "text/plain");
      return json_({ ok: true, saved: "blocked pin " + r.pin });
    }

    return json_({ ok: false, error: "unknown kind: " + r.kind });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// true when the file sits in a day folder under the pins folder, in the
// pins folder itself, or in the approved renders folder. Keeps ?img= from
// serving anything else in the drive.
function inPins_(file) {
  var it = file.getParents();
  while (it.hasNext()) {
    var p = it.next();
    if (p.getId() === PINS_FOLDER_ID) return true;
    if (p.getId() === RENDERS_FOLDER_ID) return true;
    if (READ_FOLDER_IDS.indexOf(p.getId()) !== -1) return true;
    var up = p.getParents();
    while (up.hasNext()) if (up.next().getId() === PINS_FOLDER_ID) return true;
  }
  return false;
}

function doGet(e) {
  // the intake: project folders in Drive (Projects.gs)
  if (e && e.parameter && e.parameter.project) return projectRouter_(e.parameter);

  // the spine reads: events since a cursor, and the cold start snapshot
  if (e && e.parameter && e.parameter.spine === "events")   return spineEvents_(e.parameter);
  if (e && e.parameter && e.parameter.spine === "snapshot") return spineSnapshotRead_(e.parameter);

  // photo fetch for the engine: ?img=FILE_ID, base64 JSON
  if (e && e.parameter && e.parameter.img) {
    try {
      var pf = DriveApp.getFileById(e.parameter.img);
      if (!inPins_(pf)) return json_({ ok: false, error: "not a pin photo" });
      return json_({ ok: true, id: pf.getId(), name: pf.getName(),
        b64: Utilities.base64Encode(pf.getBlob().getBytes()) });
    } catch (err) { return json_({ ok: false, error: String(err) }); }
  }
  // the day index for the engine's Drive tab: ?days=1
  // Walks the day folders that exist and counts what is in each one.
  // Nothing is created here. A date with no folder is simply absent from
  // the answer, which is the honest reading of "no walk that day".
  if (e && e.parameter && e.parameter.days) {
    try {
      var pinsRoot = DriveApp.getFolderById(PINS_FOLDER_ID);
      var dit = pinsRoot.getFolders(), index = [];
      while (dit.hasNext()) {
        var dfo = dit.next(), dnm = dfo.getName();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dnm)) continue;  // only day folders
        var seen = {}, nFiles = 0, nBlocked = 0, first = null, last = null, who = {};
        var dfs = dfo.getFiles();
        while (dfs.hasNext()) {
          var df = dfs.next(), dfn = df.getName();
          var pm = dfn.match(/^P(\d+)_/);
          if (pm && /\.jpg$/i.test(dfn)) {
            seen[parseInt(pm[1], 10)] = 1;
            nFiles++;
            var ts = df.getDateCreated().toISOString();
            if (!first || ts < first) first = ts;
            if (!last || ts > last) last = ts;
            var wm = (df.getDescription() || "").match(/by (.+)$/);
            if (wm) who[wm[1]] = 1;
          }
          if (dfn === "blocked.txt") {
            var btxt = df.getBlob().getDataAsString().replace(/\s+$/, "");
            nBlocked = btxt ? btxt.split("\n").length : 0;
          }
        }
        var nPins = 0;
        for (var sk in seen) nPins++;
        index.push({ day: dnm, pins: nPins, files: nFiles, blocked: nBlocked,
                     first: first, last: last, by: Object.keys(who) });
      }
      index.sort(function (a, b) { return a.day < b.day ? 1 : -1; });  // newest first
      return json_({ ok: true, days: index, count: index.length });
    } catch (err) { return json_({ ok: false, error: String(err) }); }
  }
  // plain GET serves the capture app itself; ?day= gives the JSON status
  if (!e || !e.parameter || (!e.parameter.day && !e.parameter.api)) {
    var html = HtmlService.createHtmlOutputFromFile("app").getContent();
    html = html.split("__EXEC_URL__").join(ScriptApp.getService().getUrl());
    return HtmlService.createHtmlOutput(html)
      .setTitle("SKF Pin Walk")
      .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no");
  }
  try {
    var day = e.parameter.day || Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd");
    var folder = folderFor_(day);
    var wantFiles = e.parameter.files === "1";
    var present = [], blocked = [], out = [];
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next(), nm = f.getName();
      var m = nm.match(/^P(\d+)_/);
      if (m && /\.jpg$/i.test(nm)) {
        present.push(parseInt(m[1], 10));
        if (wantFiles) {
          var who = (f.getDescription() || "").match(/by (.+)$/);
          out.push({ no: parseInt(m[1], 10), id: f.getId(), name: nm,
            by: who ? who[1] : "", time: f.getDateCreated().toISOString(),
            size: f.getSize() });
        }
      }
      if (nm === "blocked.txt") {
        var lines = f.getBlob().getDataAsString().trim().split("\n");
        for (var i = 0; i < lines.length; i++) {
          var bm = lines[i].match(/pin (\d+) \. (.*?) \. by (.+)$/);
          var bn = lines[i].match(/pin (\d+)/);
          if (wantFiles && bm) blocked.push({ no: parseInt(bm[1], 10), reason: bm[2], by: bm[3] });
          else if (!wantFiles && bn) blocked.push(parseInt(bn[1], 10));
        }
      }
    }
    present = present.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    if (wantFiles) {
      out.sort(function (a, b) { return a.no - b.no || (a.time < b.time ? -1 : 1); });
      return json_({ ok: true, day: day, files: out, count: present.length, blocked: blocked });
    }
    return json_({ ok: true, day: day, present: present, count: present.length, blocked: blocked });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ===================================================================
// THE SPINE . v6, added 31 Jul 2026
// The shared project record behind Plan, Track and Site.
//
// This script DELIBERATELY DOES NOT FOLD. It stores events and hands
// them back. The fold law lives once, in platform/core/spine.js, where
// 30 guards break it offline. A second fold written here, in another
// language, could drift from that law and no guard would ever catch it
// . the exact disease the mutation harness exists to prevent.
//
// So the contract is small on purpose:
//   POST { kind:"spine.append", project, events:[...] }
//        -> { ok, appended, seq }   appends rows, returns the new head
//   GET  ?spine=events&project=X&since=N
//        -> { ok, events:[...], seq, more }   rows after cursor N
//   POST { kind:"spine.snapshot", project, seq, snapshot }
//        -> { ok }   a client caches its folded snapshot for cold starts
//   GET  ?spine=snapshot&project=X
//        -> { ok, seq, snapshot }  or { ok, seq:0, snapshot:null }
//
// The snapshot is only ever a CACHE. Any client can rebuild it from the
// events, so a stale or missing one costs a slower first paint and
// nothing else. It is never the source of truth.
//
// Storage: one spreadsheet, one tab per project, columns
//   seq | ts | actor | kind | key | value(JSON) | source | id
// One tab per project keeps each log short and keeps one busy project
// from crowding the others toward the 10M cell ceiling.
// ===================================================================

// Made once, then read by id. Leave blank on first run and call
// spineSetup() from the editor: it creates the file and logs the id.
// No trailing underscore on purpose: Apps Script only lists functions
// without one in the Run dropdown, and this is the one you must run.
var SPINE_SHEET_ID = "1Rg-0ULzMwpwtHeGh6_a5AzDYedBu39mFIb4PEGtaaik";   // the DnB-OS Spine sheet, made 31 Jul 2026
var SPINE_FOLDER_ID = PINS_FOLDER_ID;   // snapshots live beside the walk
var SPINE_HEAD = ["seq", "ts", "actor", "kind", "key", "value", "source", "id"];
var SPINE_MAX_ROWS = 2000;              // per read, so one call never times out

function spineSetup() {
  var ss = SpreadsheetApp.create("DnB-OS Spine");
  Logger.log("Set SPINE_SHEET_ID to: " + ss.getId());
  return ss.getId();
}

function spineBook_() {
  if (!SPINE_SHEET_ID) throw new Error("SPINE_SHEET_ID is not set. Run spineSetup() once and paste the id.");
  return SpreadsheetApp.openById(SPINE_SHEET_ID);
}

function spineTab_(project) {
  var name = String(project || "default").replace(/[^A-Za-z0-9_\-]/g, "_").slice(0, 90);
  var ss = spineBook_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(SPINE_HEAD);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Append is the only write. A lock serialises concurrent writers so two
// people saving at once cannot land on the same row, and seq stays
// strictly increasing . the tie breaker the fold law sorts on.
function spineAppend_(r) {
  if (!r.project) return json_({ ok: false, error: "spine.append needs a project" });
  var evs = r.events || [];
  if (!evs.length) return json_({ ok: true, appended: 0, seq: spineHead_(r.project) });
  if (evs.length > 500) return json_({ ok: false, error: "batch too large, send 500 events or fewer" });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); }
  catch (err) { return json_({ ok: false, error: "spine busy, retry" }); }

  try {
    var sh = spineTab_(r.project);
    var last = sh.getLastRow();
    var seq = last > 1 ? Number(sh.getRange(last, 1).getValue()) || (last - 1) : 0;
    var rows = [];
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (!ev || !ev.kind || !ev.ts || !ev.actor) continue;   // refused at the door, same law as the fold
      seq++;
      rows.push([seq, ev.ts, ev.actor, ev.kind, ev.key == null ? "" : ev.key,
        JSON.stringify(ev.value == null ? {} : ev.value),
        ev.source == null ? "" : ev.source, ev.id || ""]);
    }
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, SPINE_HEAD.length).setValues(rows);
    return json_({ ok: true, appended: rows.length, refused: evs.length - rows.length, seq: seq });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function spineHead_(project) {
  try {
    var sh = spineTab_(project), last = sh.getLastRow();
    return last > 1 ? Number(sh.getRange(last, 1).getValue()) || (last - 1) : 0;
  } catch (err) { return 0; }
}

// Rows after a cursor. Paged, so a long log is pulled in slices and no
// single call runs past the six minute ceiling.
function spineEvents_(p) {
  try {
    if (!p.project) return json_({ ok: false, error: "needs a project" });
    var since = Number(p.since || 0) || 0;
    var sh = spineTab_(p.project), last = sh.getLastRow();
    if (last < 2) return json_({ ok: true, events: [], seq: 0, more: false });

    var startRow = since + 2;                       // row 1 is the header, seq 1 is row 2
    if (startRow > last) return json_({ ok: true, events: [], seq: since, more: false });
    var n = Math.min(last - startRow + 1, SPINE_MAX_ROWS);
    var vals = sh.getRange(startRow, 1, n, SPINE_HEAD.length).getValues();

    var out = [], head = since;
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i];
      var value = {};
      try { value = JSON.parse(v[5] || "{}"); } catch (e) { value = { _unparsed: String(v[5]) }; }
      head = Number(v[0]) || head;
      out.push({ seq: Number(v[0]), ts: String(v[1]), actor: String(v[2]), kind: String(v[3]),
        key: v[4] === "" ? null : String(v[4]), value: value,
        source: v[6] === "" ? null : String(v[6]), id: v[7] === "" ? null : String(v[7]) });
    }
    return json_({ ok: true, events: out, seq: head, more: (startRow + n - 1) < last });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ---- the snapshot cache -------------------------------------------
// Written by a client that has just folded, read by a client that is
// starting cold. Carries the seq it was folded at, so the reader knows
// exactly which events it still has to pull on top.
function spineSnapName_(project) {
  return "spine_snapshot_" + String(project || "default").replace(/[^A-Za-z0-9_\-]/g, "_") + ".json";
}

function spineSnapshotWrite_(r) {
  try {
    if (!r.project) return json_({ ok: false, error: "needs a project" });
    if (!r.snapshot) return json_({ ok: false, error: "needs a snapshot" });
    var folder = DriveApp.getFolderById(SPINE_FOLDER_ID);
    var name = spineSnapName_(r.project);
    var body = JSON.stringify({ seq: Number(r.seq || 0) || 0, snapshot: r.snapshot });
    var it = folder.getFilesByName(name);
    if (it.hasNext()) it.next().setContent(body);
    else folder.createFile(name, body, "application/json");
    return json_({ ok: true, seq: Number(r.seq || 0) || 0 });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

function spineSnapshotRead_(p) {
  try {
    if (!p.project) return json_({ ok: false, error: "needs a project" });
    var folder = DriveApp.getFolderById(SPINE_FOLDER_ID);
    var it = folder.getFilesByName(spineSnapName_(p.project));
    if (!it.hasNext()) return json_({ ok: true, seq: 0, snapshot: null });
    var body = JSON.parse(it.next().getBlob().getDataAsString());
    return json_({ ok: true, seq: body.seq || 0, snapshot: body.snapshot || null });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}
