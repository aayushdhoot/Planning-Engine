#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/ingest.js . READ A PROJECT FOLDER INTO FACTS
//   node tools/ingest.js <folder> [--out facts.json]
//
// Walks a folder of real project documents, reads what it can, and emits
// a fact file. Every fact carries the document, sheet and cell it came
// from. Everything it could NOT read is emitted too, by name, because a
// reader that quietly returns less than the document holds is the most
// dangerous thing in a pipeline like this.
//
// This is the layer that was missing from every previous version: the
// engine now reads the project rather than displaying a pack somebody
// wrote by hand after reading it.
// ===================================================================
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const R = require(path.join(__dirname, "../platform/ingest/readers.js"));
const F = require(path.join(__dirname, "../platform/ingest/facts.js"));
// CL is used only for its list of what a model would have to open — this
// tool no longer calls one. See the note beside needsAReader.
const CL = require(path.join(__dirname, "../platform/ingest/claude.js"));
const KINDS = require(path.join(__dirname, "../platform/ingest/kinds.js"));
const SHEETS = require(path.join(__dirname, "../platform/ingest/sheets.js"));
const LOG = require(path.join(__dirname, "../platform/core/log.js"));

const args = process.argv.slice(2);
const FOLDER = args[0];
// --only <regex> reads just the matching documents and MERGES the result
// into the existing fact file. Reading a folder in one go is the wrong
// shape when one document in it is 59 MB: a person should be able to say
// "read the programme again" without waiting on the drawing.
const NO_CLAUDE = args.indexOf("--no-claude") >= 0;
const ONLY = (args.indexOf("--only") >= 0) ? new RegExp(args[args.indexOf("--only") + 1], "i") : null;
const OUT = (args.indexOf("--out") >= 0) ? args[args.indexOf("--out") + 1]
  : path.join(__dirname, "../engines/skf/facts.json");
if (!FOLDER) { console.error("usage: node tools/ingest.js <folder> [--out facts.json]"); process.exit(2); }

// ---- unzip an xlsx without a dependency -------------------------------
// The platform has `unzip`; using it keeps this file free of node_modules
// and keeps the reader itself pure.
function unzipXlsx(file) {
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "dnbxlsx-"));
  try { execFileSync("unzip", ["-o", "-q", file, "-d", tmp], { stdio: "ignore" }); }
  catch (e) { return { entries: null, why: "unzip failed: " + (e.message || e) }; }
  const entries = {};
  const walk = (d, base) => {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n), rel = base ? base + "/" + n : n;
      if (fs.statSync(p).isDirectory()) walk(p, rel);
      else if (/\.(xml|rels)$/.test(n)) entries[rel] = fs.readFileSync(p, "utf8");
    }
  };
  walk(tmp, "");
  fs.rmSync(tmp, { recursive: true, force: true });
  return { entries, why: null };
}

// ---- walk the folder ---------------------------------------------------
// A DEPTH LIMIT IS A SILENT LOSS. Real project folders nest — a detail
// drawing sits six levels down inside an extracted archive — and a walk that
// stops at four reports a clean read of a folder it never entered. The limit
// exists to stop a runaway symlink, so it is set where no real folder reaches
// and the files it does skip are NAMED.
function walkFiles(dir, out, depth) {
  if ((depth || 0) > 12) { out.tooDeep = (out.tooDeep || []); out.tooDeep.push(dir); return out; }
  for (const n of fs.readdirSync(dir)) {
    if (n.startsWith(".") || n === "node_modules") continue;
    const p = path.join(dir, n);
    let st; try { st = fs.statSync(p); } catch (e) { continue; }
    if (st.isDirectory()) walkFiles(p, out, (depth || 0) + 1);
    else out.push({ path: p, name: n, size: st.size, kind: R.sniff(n) });
  }
  return out;
}

// COLUMNS A PERSON HAS ALREADY SETTLED. Kept beside the engine, keyed by
// document and sheet, and applied on top of what the header claims — so a
// decision made once is not made again on every read.
const COLMAP_FILE = path.join(__dirname, "../engines/skf/column_map.json");
let COLMAP = {};
if (fs.existsSync(COLMAP_FILE)) { try { COLMAP = JSON.parse(fs.readFileSync(COLMAP_FILE, "utf8")); } catch (e) {} }
const mappingFor = (doc, sheet) => (COLMAP[doc] && COLMAP[doc][sheet]) || null;

const allFiles = walkFiles(FOLDER, [], 0);
const files = ONLY ? allFiles.filter(f => ONLY.test(f.name)) : allFiles;
const skipped = ONLY ? allFiles.length - files.length : 0;

// WALKED PAST IS NOT READ. These are the kinds a deterministic reader here
// actually opens. Everything else is stepped over and handed to readall.js,
// and a file this tool never opened is a file it has no standing to retract
// a fact about — see the tombstone scope below.
const OPENED_HERE = { xlsx: 1, dxf: 1, csv: 1 };
const opened = (f) => !!OPENED_HERE[f.kind];
const facts = [];
const unread = [];
const notes = [];
// columns the engine will not name on a header's word alone. Carried out
// of the read so a person settles them once, together, not read by read.
const confirm = [];
// documents no deterministic reader opens. Named, counted, and handed to
// tools/readall.js — which knows what KIND each one is and asks it the
// questions that kind can answer. Never read here with a general prompt.
const needsAReader = [];

// ---- WHAT WAS READ, PER DOCUMENT, SAID BY THE ENGINE ITSELF ------------
// The readiness board used to work this out for itself by pattern-matching
// the TEXT of the ingest's notes. It could not: it never saw the thousand
// documents the reader agents opened, because those are on the log and not
// in these notes, and it read every reported observation — "this column
// holds text", "this cell says RO" — as a failure to read the document. A
// fully-read BOQ went amber for saying something true about itself.
//
// So the engine states it, once, per document, and the board displays it:
//   full            everything in it was read
//   partial         read, and some of it could not be used — with what
//   pending         waiting on tools/readall.js
//   notADocument    a lock file, an archive whose contents are already
//                   read, or something this engine itself wrote
const documents = [];
const seenDoc = {};
const sheetSeen = {}, sheetMiss = {};
const docRead = (doc, read, why) => { if (seenDoc[doc]) return; seenDoc[doc] = 1;
  documents.push({ doc, read, why }); };

// A CONTAINER IS NOT A DOCUMENT, AND A LOCK FILE IS NOT EVEN A CONTAINER.
// AutoCAD leaves .dwl beside every drawing it opens; they hold a username.
// A .zip whose contents are sitting extracted next to it has already been
// read, file by file. And the engine's own output is not an input to itself
// — reading camera_brief.pdf back in would be marking its own homework.
const OURS = /(^|\/)(_mirror\.json|spine_snapshot_.*\.json|camera_brief\.(html|pdf))$/i;
const LOCKFILE = /\.(dwl2?|bak|tmp|ds_store)$/i;
function isArchiveAlreadyRead(abs) {
  if (!/\.zip$/i.test(abs)) return false;
  try {
    const list = execFileSync("unzip", ["-Z1", abs], { encoding: "utf8" })
      .split("\n").map(s => s.trim()).filter(s => s && !s.endsWith("/"));
    if (!list.length) return false;
    // every entry has to exist somewhere under the project, by name
    const names = {}; files.forEach(f => names[f.name] = 1);
    return list.every(e => names[e.split("/").pop()]);
  } catch (e) { return false; }
}

let geometry = null;   // room outlines, for drawing the floor
let id = 0;
const nid = (p) => "f" + (++id) + ":" + p;

// what the reader agents have already opened, straight off the log
const readerDone = {};
LOG.read(path.dirname(OUT)).forEach(e => {
  if (/^reader:/.test(e.actor || "") && e.source) readerDone[e.source] = 1; });

console.log("reading " + FOLDER);
console.log(files.length + " files found\n");

for (const f of files) {
  const rel = path.relative(FOLDER, f.path) || f.name;

  // NOT EVERY FILE IN A PROJECT FOLDER IS A PROJECT DOCUMENT, and counting
  // the ones that are not as "could not be opened" put four whole categories
  // of the readiness board into amber on the strength of an AutoCAD lock
  // file and the engine's own camera brief.
  if (OURS.test(rel)) { docRead(rel, "notADocument", "this engine wrote it"); continue; }
  if (LOCKFILE.test(rel)) { docRead(rel, "notADocument",
    "a lock file the drawing software leaves behind — it holds a username, nothing else"); continue; }
  if (isArchiveAlreadyRead(f.path)) { docRead(rel, "notADocument",
    "an archive whose contents are already extracted beside it, and read one by one"); continue; }

  if (f.kind === "xlsx") {
    const { entries, why } = unzipXlsx(f.path);
    if (!entries) { unread.push({ doc: rel, why }); continue; }
    const wbk = R.xlsx(entries);
    if (!wbk.sheetNames.length) { unread.push({ doc: rel, why: (wbk.problems[0] || "no sheets could be read") }); continue; }
    notes.push({ doc: rel, read: wbk.sheetNames.length + " sheets: " + wbk.sheetNames.join(", ") +
      (wbk.hiddenNames.length ? "  (" + wbk.hiddenNames.length + " hidden)" : "") });
    wbk.problems.forEach(p => notes.push({ doc: rel, problem: p }));

    sheetSeen[rel] = wbk.sheetNames.length;
    for (const sName of wbk.sheetNames) {
      const sh = wbk.sheets[sName];
      // THE MAPPING LAYER. Counting cells is a description of a sheet, not
      // knowledge of one. sheets.js decides what the sheet IS, which column
      // means what, and turns rows into signals that carry their cell.
      const settled = mappingFor(rel, sName);
      const got = SHEETS.extract(sh, { doc: rel, idPrefix: "sh" + (facts.length),
        mapping: settled ? Object.keys(settled).reduce((a, c) => (settled[c] !== "ignore" && (a[c] = settled[c]), a), {}) : null });
      if (settled) notes.push({ doc: rel, read: sName + ": " + Object.keys(settled).length +
        " columns read as a person settled them" });
      got.notes.forEach(n => notes.push({ doc: rel, ...(n.problem ? { problem: n.problem } : { read: n.note }) }));

      if (!got.shape) {
        notes.push({ doc: rel, problem: sName + ": " + got.why });
        (sheetMiss[rel] = sheetMiss[rel] || []).push(sName + (got.classify.prose ? " (prose)" : ""));
      } else {
        got.facts.forEach(f => facts.push(f));
        notes.push({ doc: rel, read: sName + ": read as a " + got.classify.name.toLowerCase() +
          " — " + got.facts.length + " facts from " + sh.count + " rows" });
      }
      got.refused.forEach(r => notes.push({ doc: rel, problem: sName + ": " + r.why }));

      // A COLUMN THE ENGINE CANNOT NAME IS ASKED ABOUT, ONCE. Carried out of
      // the ingest so the app can put them in front of a person together,
      // rather than each read guessing again.
      got.confirm.filter(c => !(settled && settled[c.col]))
        .forEach(c => confirm.push({ doc: rel, sheet: sName, col: c.col,
        header: c.header, dataIs: c.is, values: c.sample, why: c.why }));
    }
    // A SHEET THAT MATCHED NO SHAPE IS THE ONLY THING THAT MAKES A WORKBOOK
    // PARTLY READ. A reported column, a refused cell, a note about what a
    // header says — those are the engine describing what it read, not
    // confessing that it could not.
    const miss = sheetMiss[rel] || [];
    docRead(rel, miss.length ? "partial" : "full",
      miss.length
        ? miss.length + " of " + sheetSeen[rel] + " sheets matched no shape: " + miss.join(", ")
        : "all " + sheetSeen[rel] + " sheets read");
    continue;
  }

  if (f.kind === "dxf") {
    let text; try { text = fs.readFileSync(f.path, "latin1"); }
    catch (e) { unread.push({ doc: rel, why: "could not open: " + e.message });
      docRead(rel, "none", "could not open: " + e.message); continue; }
    const d = R.dxf(text);
    d.problems.forEach(p => notes.push({ doc: rel, problem: p }));

    // A LABEL INSIDE A SHAPE IS A MEASURED AREA. One label to one polygon
    // is a fact; two labels sharing a polygon is a CONFLICT, which the
    // fact store will surface rather than the engine resolving.
    // A LAYER WHOSE POLYGONS ARE ALL THE SAME SIZE IS A TABLE, NOT ROOMS.
    // Rooms differ in size; the cells of an area-requirement matrix and a
    // repeated furniture block do not. Structural, so it holds on any
    // drawing . not a guess about what a particular layer means.
    // On this drawing it removes PDF_Text (28 polygons, ONE distinct area .
    // the required-vs-achieved matrix, which lists every room name) and
    // F-FURNITURE FS (121 polygons, two sizes).
    const GRID_RATIO = 0.10, GRID_MIN = 5;
    const perLayer = {};
    d.shapes.forEach(s2 => (perLayer[s2.layer] = perLayer[s2.layer] || []).push(Math.round(s2.sqft)));
    const gridLayers = {};
    for (const L of Object.keys(perLayer)) {
      const v = perLayer[L], u = new Set(v).size;
      if (v.length >= GRID_MIN && (u / v.length) < GRID_RATIO) {
        gridLayers[L] = { polys: v.length, sizes: u };
        notes.push({ doc: rel, problem: "layer \"" + L + "\" has " + v.length +
          " polygons in only " + u + " size" + (u === 1 ? "" : "s") +
          " — read as a table or a repeated block, not as rooms" });
      }
    }
    const cand = d.shapes.filter(s => s.sqft >= 15 && s.sqft <= 20000 && !gridLayers[s.layer]);
    const byShape = {};
    for (const lb of d.labels) {
      if (!/^[A-Za-z]/.test(lb.text) || lb.text.length < 2 || lb.text.length > 60) continue;
      const hit = cand.filter(s => R.inside(lb.x, lb.y, s.pts)).sort((a, b) => a.sqft - b.sqft)[0];
      if (!hit) continue;
      (byShape[hit.i] = byShape[hit.i] || { sqft: hit.sqft, layer: hit.layer, labels: [] }).labels.push(lb.text);
    }
    let placed = 0, ambiguous = 0;
    for (const k of Object.keys(byShape)) {
      const g = byShape[k];
      if (g.labels.length === 1) {
        facts.push({ id: nid("area"), kind: "area", subject: g.labels[0],
          value: Math.round(g.sqft), unit: "sqft", conf: "measured",
          source: { doc: rel, where: "layer " + g.layer + ", polygon " + k, read: "polygon area, shoelace" } });
        placed++;
      } else {
        // both labels get the same measured area, as separate facts . the
        // store will see two subjects claiming one polygon and ask
        ambiguous++;
        for (const nm of g.labels) facts.push({ id: nid("area"), kind: "area", subject: nm,
          value: Math.round(g.sqft), unit: "sqft", conf: "inferred",
          note: "shares one polygon with: " + g.labels.filter(x => x !== nm).join(", "),
          source: { doc: rel, where: "layer " + g.layer + ", polygon " + k, read: "polygon shared by " + g.labels.length + " labels" } });
      }
    }
    // THE GEOMETRY ITSELF, not just the areas. A room schedule is a table;
    // a floor plan is what a person actually recognises. The outlines that
    // became rooms are kept so the engine can draw the floor and stand the
    // pins on it, in the drawing's own coordinates.
    geometry = { units: "mm", bounds: null, rooms: [] };
    for (const k of Object.keys(byShape)) {
      const g = byShape[k];
      const shp = cand.find(c => String(c.i) === String(k));
      if (!shp) continue;
      geometry.rooms.push({ poly: k, layer: g.layer, sqft: Math.round(g.sqft),
        labels: g.labels, pts: shp.pts.map(pt => [Math.round(pt[0]), Math.round(pt[1])]) });
    }
    if (geometry.rooms.length) {
      let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
      geometry.rooms.forEach(r => r.pts.forEach(([x,y]) => {
        if(x<x0)x0=x; if(y<y0)y0=y; if(x>x1)x1=x; if(y>y1)y1=y; }));
      geometry.bounds = { x0, y0, x1, y1, w: x1-x0, h: y1-y0 };
    }

    notes.push({ doc: rel, read: d.labels.length + " labels, " + d.shapes.length + " closed shapes, " +
      Object.keys(d.layers).length + " layers → " + placed + " measured rooms, " + ambiguous + " polygons carrying more than one label" });
    docRead(rel, "full", d.labels.length + " labels and " + d.shapes.length + " closed shapes read");
    continue;
  }

  if (f.kind === "csv") {
    const c = R.csv(fs.readFileSync(f.path, "utf8"));
    notes.push({ doc: rel, read: c.rows.length + " rows, " + c.width + " columns" });
    c.problems.forEach(p => notes.push({ doc: rel, problem: p }));
    docRead(rel, "full", c.rows.length + " rows read");
    continue;
  }

  // ---- prose, drawings-as-PDF, photographs: NOT READ HERE ---------------
  // THIS TOOL DOES NOT CALL A MODEL, AND THE REASON IS BOTH SPEED AND TRUTH.
  //
  // Truth first. What was here spawned one `claude -p` per file with a
  // GENERIC prompt — "extract only what it actually states". That is
  // extract-everything-and-sort-later, the exact thing the signal register
  // exists to replace: a render and a site photo are both a .png of a room,
  // and read the same way a drawing of an intention becomes evidence of
  // progress. tools/readall.js reads them through kinds.js and judgements.js
  // — the right brief for the kind of document each one is.
  //
  // Then speed. It ran synchronously, one file at a time, over 1,032 images
  // and 82 documents. At forty seconds each that is twelve hours per ingest,
  // and it re-ran every file every time because — unlike readall.js — it
  // never asked the log what had already been read. Every one of those
  // photographs was ALREADY on the log, read in parallel and under its own
  // judgement. Not one live ingest fact has ever come from this path.
  //
  // So they are named and handed on. Nothing is skipped in silence.
  if (CL.READABLE.indexOf(path.extname(f.name).toLowerCase()) !== -1) {
    const kind = KINDS.classify(rel).kind || null;
    needsAReader.push({ doc: rel, kind });
    // THE LOG IS WHERE THE ANSWER LIVES. Whether a photograph has been read
    // is not something this tool can know from its own run — a reader agent
    // read it last week and said so on the log, and the board has to see that
    // or it reports a folder of a thousand unread images that were all read.
    docRead(rel, readerDone[rel] ? "full" : "pending",
      readerDone[rel] ? "read by the " + (kind || "document") + " reader"
                      : "waiting on tools/readall.js" + (kind ? "" : " — and no rule places it, so no judgement fits it yet"));
    continue;
  }

  const why3 = f.kind ? "the " + f.kind + " reader is not built yet" : "no reader knows this file type";
  unread.push({ doc: rel, why: why3, size: f.size });
  docRead(rel, "none", why3);
}

// MERGING, NOT REPLACING. A partial read must not delete what a previous
// read established . it replaces only the facts that came from the same
// documents, so re-reading the programme cannot silently drop the drawing.
let prior = null;
if (ONLY) { try { prior = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) { prior = null; } }
let mergedFacts = facts, mergedUnread = unread, mergedNotes = notes, mergedConfirm = confirm, fileCount = files.length;
if (prior) {
  const touched = {}; files.filter(opened).forEach(f => touched[path.relative(FOLDER, f.path) || f.name] = 1);
  const keep = (arr, k) => (arr || []).filter(x => !touched[x[k]]);
  mergedFacts  = keep(prior.facts, "doc").concat(facts);
  // facts key their doc inside source, so filter on that instead
  mergedFacts  = (prior.facts || []).filter(f => !touched[f.source && f.source.doc]).concat(facts);
  mergedUnread = keep(prior.unread, "doc").concat(unread);
  mergedNotes  = keep(prior.notes,  "doc").concat(notes);
  mergedConfirm = keep(prior.confirm, "doc").concat(confirm);
  fileCount    = new Set(mergedNotes.concat(mergedUnread).map(x => x.doc)).size;
}

// ---- THE LOG IS THE RECORD; THIS FILE IS A VIEW OF IT ------------------
// Every fact this read produced becomes an event keyed by the cell it came
// out of. Reading the same cell again writes another event with the same
// key, so the fold supersedes it and the log keeps both — which is the only
// way to answer "when did this change" three months from now.
const ENGDIR = path.dirname(OUT);
const READ_TS = new Date().toISOString();
const before = LOG.snapshot(ENGDIR);
const touched = {}; files.filter(opened).forEach(f => touched[path.relative(FOLDER, f.path) || f.name] = 1);
const evs = LOG.factEvents(facts, { ts: READ_TS, actor: "ingest", project: "skf-pune-7f", against: before });
// A READER ONLY TOMBSTONES ITS OWN WORK. The scope was "any fact whose
// document I walked past", and the walk covers every file in the project —
// so a deterministic re-read declared 2,012 findings by the agents "no
// longer read" and buried them. What this read can retract is what THIS
// reader previously wrote, and nothing else.
const mineByKey = {};
LOG.read(ENGDIR).forEach(e => { if (e.kind === "fact.record") mineByKey[e.key] = e.actor; });
const gone = LOG.goneEvents(facts, { ts: READ_TS, actor: "ingest", project: "skf-pune-7f", against: before,
  scope: (f) => touched[(f.source || {}).doc] && mineByKey[LOG.identity(f)] === "ingest" });
const unchanged = evs.unchanged;
const appended = LOG.append(ENGDIR, evs.concat(gone)).appended;
const changed = LOG.supersessions(ENGDIR);

// THE INGEST DOES NOT OWN THE SNAPSHOT. It reads documents and appends what
// it learns to the log; the snapshot is the fold of everything on that log,
// including every finding an agent produced. Writing facts.json from this
// read alone is exactly how 1,341 reader findings became invisible once
// already — it silently replaces a view of the whole record with a view of
// one afternoon's spreadsheet parsing.
const st = F.store(mergedFacts);
// what every document has actually produced, asked three ways
const producedSomething = {};
facts.forEach(f => { if (f.source && f.source.doc) producedSomething[f.source.doc] = "facts"; });
LOG.read(ENGDIR).forEach(e => {
  if (/^reader:/.test(e.actor || "") && e.source) producedSomething[e.source] = "a reader said so";
  if (e.kind === "observation.record" && e.value && e.value.doc)
    producedSomething[e.value.doc] = "observations from the walk";
});
const stillWaiting = needsAReader.filter(n => !producedSomething[n.doc]);

const out = {
  folder: FOLDER,
  files: fileCount,
  facts: st.all(),
  rejected: st.rejected,
  conflicts: F.conflicts(st),
  unread: mergedUnread, notes: mergedNotes, confirm: mergedConfirm,
  // the documents this tool hands on rather than opens, so the app can show
  // the queue and nobody has to guess whether a photograph was ever read
  // ---- WHAT STILL NEEDS A READER, AND ONLY THAT --------------------------
  // This list reported 1,113 documents waiting. Every one of them had been
  // read. 81 produced facts that are in this very file — the signed
  // agreement contributed 43 — and the other 1,032 are pin photographs the
  // walk path reads and writes to the log as observations, which is a
  // different kind of answer, not a missing one.
  //
  // A board that shows a thousand problems where there are none is worse
  // than a board that shows nothing, because it teaches the person reading
  // it to look away. So the question is asked the only way that cannot go
  // stale: did this document ACTUALLY produce anything? Facts, or
  // observations on the log, or a reader that said it was done. Any of the
  // three and it is read.
  needsAReader: needsAReader.filter(n => !producedSomething[n.doc]),
  // what was read, per document, said by the engine rather than guessed
  // by the board from the wording of a note
  documents,
  // the vocabulary a person picks from, so the app never invents a role
  roles: Object.keys(SHEETS.ROLES),
  geometry: geometry || (prior && prior.geometry) || null,
  readAt: READ_TS,
  // the snapshot says what it is a view OF, so a stale one is visible
  log: { file: LOG.LOG, appendedThisRead: appended, events: LOG.read(ENGDIR).length,
         supersessions: changed.length },
  lastRead: ONLY ? { pattern: String(ONLY), documents: files.map(f => f.name), skipped } : null,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
// the read-metadata is this read's to own — which documents were opened,
// what could not be read, which columns are unsettled, the floor geometry
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

// ...and then the facts come back from the fold, never from here alone
try {
  const r = require("child_process").execFileSync(process.execPath,
    [path.join(__dirname, "snapshot.js")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const line = String(r).split("\n").find(l => /^FOLDED/.test(l));
  if (line) console.log("\n" + line);
} catch (e) {
  console.error("\nTHE SNAPSHOT DID NOT REBUILD: " + String(e.message).slice(0, 200) +
    "\n  facts.json currently holds only what this read produced — run tools/snapshot.js");
}

console.log("READ");
notes.filter(n => n.read).forEach(n => console.log("  " + n.doc + "  ·  " + n.read));
if (notes.some(n => n.problem)) {
  console.log("\nPROBLEMS INSIDE DOCUMENTS IT DID READ");
  notes.filter(n => n.problem).forEach(n => console.log("  " + n.doc + "  ·  " + n.problem));
}
if (unread.length) {
  console.log("\nCOULD NOT READ  (named, never silently skipped)");
  unread.forEach(u => console.log("  " + u.doc + "  ·  " + u.why));
}
if (needsAReader.length) {
  const byKind = {};
  stillWaiting.forEach(n => (byKind[n.kind || "(no rule places it)"] =
    (byKind[n.kind || "(no rule places it)"] || 0) + 1));
  const waiting = stillWaiting.length;
  console.log("\nNEEDS A READER, NOT A PARSER  (" + waiting + " documents still waiting of " +
    needsAReader.length + " that no parser opens)");
  console.log("  No deterministic reader opens a photograph, a contract or a drawing-as-PDF. They are");
  console.log("  read by tools/readall.js, which asks each KIND the questions that kind can answer —");
  console.log("  not one general prompt over everything.");
  Object.keys(byKind).sort((a, b) => byKind[b] - byKind[a]).forEach(k =>
    console.log("    " + String(k).padEnd(22) + String(byKind[k]).padStart(5)));
  const done = needsAReader.length - waiting;
  console.log("  " + done + " already answered · " + waiting + " still waiting" +
    (waiting ? "   →  node tools/readall.js" : "   nothing outstanding"));
  if (!waiting) console.log("  (of the " + done + ": facts from the documents, observations from the walk)");
}
if (out.confirm.length) {
  console.log("\nCOLUMNS THE ENGINE WILL NOT NAME ON A HEADER'S WORD  (settle once, then remembered)");
  out.confirm.forEach(c => console.log("  " + c.doc + " · " + c.sheet + "!" + c.col +
    "  [" + (c.header || "no header") + "]  holds " + c.dataIs + ":  " + (c.values||[]).slice(0,3).join(" | ")));
}
if (changed.length) {
  console.log("\nWHAT A RE-READ CHANGED  (the log remembers both; the snapshot shows the later)");
  changed.slice(-8).forEach(c => console.log("  " + String(c.subject).slice(0, 44).padEnd(46) +
    "[" + c.role + "]  " + c.was + " → " + c.now + "   " + c.wasOn + " → " + c.nowOn));
  if (changed.length > 8) console.log("  and " + (changed.length - 8) + " more");
}
console.log("\nTHE LOG  " + out.log.events + " events · " + appended + " appended by this read (" +
  evs.length + " new or changed, " + gone.length + " no longer read), " + unchanged + " unchanged and not restated");
// BELIEVING SOMETHING AGAIN IS WORTH SAYING OUT LOUD. A fact this reader
// once retracted and now reads again is not a quiet re-run; somebody wants
// to know the engine changed its mind back, and when.
if (evs.revived) console.log("  " + evs.revived +
  " facts this reader had retracted are read again and believed — the tombstones are lifted");
console.log("\n" + out.facts.length + " facts, " + out.conflicts.length + " conflicts, " +
  out.rejected.length + " refused at the door" + (out.confirm.length ? ", " + out.confirm.length + " columns to settle" : ""));
console.log("→ " + OUT);
