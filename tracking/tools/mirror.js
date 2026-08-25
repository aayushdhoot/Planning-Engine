#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/mirror.js . WHAT THE ENGINE READ, AND WHETHER IT MOVED
//   node tools/mirror.js <folder> [--drive drive_map.json]
//
// The team's door is Drive. The engine's read surface is a local folder.
// This walks that folder and writes a manifest beside it: every file, its
// size, and the sha256 of its bytes.
//
// WHY A HASH AND NOT A TIMESTAMP
//   Every fact the engine holds points at a document. If that document can
//   change under the read without anyone noticing, the provenance is
//   decoration. A hash makes a re-read reproducible: same hash, same facts,
//   guaranteed. A changed hash is the engine's cue to re-read THAT file and
//   supersede the facts it produced . not to quietly carry stale ones.
//
// WHAT IT WILL NOT DO
//   It does not fetch, sync, delete or rename anything. It reads and it
//   reports. A tool that reconciles two stores and also mutates them is one
//   nobody can be sure of at three in the morning.
// ===================================================================
const fs = require("fs"), path = require("path"), crypto = require("crypto");

const FOLDER = process.argv[2];
const DRIVE = (process.argv.indexOf("--drive") >= 0)
  ? process.argv[process.argv.indexOf("--drive") + 1] : null;
if (!FOLDER) { console.error("usage: node tools/mirror.js <folder> [--drive map.json]"); process.exit(2); }

const OUT = path.join(FOLDER, "_mirror.json");
const driveMap = DRIVE && fs.existsSync(DRIVE) ? JSON.parse(fs.readFileSync(DRIVE, "utf8")) : {};

function walk(dir, out) {
  for (const n of fs.readdirSync(dir)) {
    if (n.startsWith(".") || n === "_mirror.json") continue;
    const p = path.join(dir, n), st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push({ path: p, rel: path.relative(FOLDER, p), size: st.size, mtime: st.mtime.toISOString() });
  }
  return out;
}

function sha256(file) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(file));
  return h.digest("hex");
}

const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
const priorBy = {};
((prior && prior.files) || []).forEach(f => priorBy[f.rel] = f);

const files = walk(FOLDER, []).map(f => {
  const hash = sha256(f.path);
  const was = priorBy[f.rel];
  return { rel: f.rel, size: f.size, mtime: f.mtime, sha256: hash,
    drive: driveMap[f.rel] || driveMap[path.basename(f.rel)] || null,
    state: !was ? "new" : (was.sha256 === hash ? "unchanged" : "changed") };
});

const gone = Object.keys(priorBy).filter(r => !files.some(f => f.rel === r));
const bucket = (s) => files.filter(f => f.state === s).length;
const manifest = { folder: FOLDER, walkedAt: new Date().toISOString(),
  files, gone, counts: { total: files.length, new: bucket("new"),
    changed: bucket("changed"), unchanged: bucket("unchanged"), gone: gone.length },
  bytes: files.reduce((t, f) => t + f.size, 0),
  withoutDriveRef: files.filter(f => !f.drive).length };

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 1));
const c = manifest.counts;
console.log(c.total + " files, " + (manifest.bytes / 1048576).toFixed(1) + " MB");
console.log("  new " + c.new + " · changed " + c.changed + " · unchanged " + c.unchanged + " · gone " + c.gone);
if (manifest.withoutDriveRef)
  console.log("  " + manifest.withoutDriveRef + " carry no Drive reference — their provenance stops at this laptop");
files.filter(f => f.state === "changed").forEach(f => console.log("  CHANGED  " + f.rel));
gone.forEach(r => console.log("  GONE     " + r));
console.log("→ " + OUT);
