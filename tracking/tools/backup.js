#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/backup.js . THE ONLY THINGS THAT CANNOT BE REBUILT
//   node tools/backup.js [--keep 7] [--force]
//
// Every JSON file in engines/skf is a view. Delete the lot and one run of
// build-all.sh puts them back. Two things are not views:
//
//   THE EVENT LOG      events.jsonl and every shard in events.d. 92,628
//                      events, append-only, and the thing every number in
//                      the engine folds out of. It is reproducible from
//                      nothing.
//   THE ANSWER STORES  snags-raised, minutes-held, billing-raised,
//                      dossier-filed and orders. Small, easy to overlook,
//                      and the only record of what a person told the
//                      engine. Losing those loses every human judgement
//                      on the project.
//
// Until the stale pre-repair copies were cleared there was accidental
// redundancy. Now there is none, so this makes some on purpose.
//
// THE LAWS
//   . A BACKUP NOBODY READ BACK IS A WISH. Every archive is opened again
//     after writing and its event count checked against the source. An
//     archive that does not verify is deleted and the run says so loudly.
//   . NOTHING IS ROTATED AWAY UNTIL THE NEW ONE VERIFIES. The old copies
//     are the only protection while the new one is being written.
//   . AN UNCHANGED LOG IS NOT BACKED UP TWICE. Thirty megabytes per build
//     would fill a disk and hide the copy that matters.
//   . A FAILED BACKUP NEVER FAILS THE BUILD, but it is never quiet either.
// ===================================================================
const fs = require("fs"), path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
// The two paths are overridable so the test suite can drive this against a
// fixture and actually break things. A BACKUP TOOL NOBODY CAN TEST DESTRUCTIVELY
// is a backup tool nobody has tested.
const ENGINE = process.env.DNB_ENGINE || path.join(ROOT, "engines/skf");
// OUTSIDE THE ENGINE DIRECTORY, so a mistake in there cannot take the
// copies with it.
const STORE = process.env.DNB_BACKUPS || path.join(ROOT, "backups/skf");

const arg = (n, d) => { const i = process.argv.indexOf("--" + n);
  return i > 0 ? process.argv[i + 1] : d; };
const KEEP = Math.max(2, Number(arg("keep", 7)) || 7);
const FORCE = process.argv.indexOf("--force") >= 0;

const STORES = ["snags-raised.json", "minutes-held.json", "billing-raised.json",
                "dossier-filed.json", "orders.json", "confirmed.json", "dpr.json",
                "settled.json", "column_map.json", "area_names.json"];

// ---- what we are protecting ---------------------------------------------
const parts = [];
if (fs.existsSync(path.join(ENGINE, "events.jsonl"))) parts.push("events.jsonl");
if (fs.existsSync(path.join(ENGINE, "events.d")))
  fs.readdirSync(path.join(ENGINE, "events.d")).filter(n => n.endsWith(".jsonl"))
    .sort().forEach(n => parts.push("events.d/" + n));
STORES.forEach(f => { if (fs.existsSync(path.join(ENGINE, f))) parts.push(f); });

if (!parts.length) { console.log("\n  BACKUP: nothing to protect — no log and no answer stores\n");
  process.exit(0); }

// count the events, so the archive can be checked against a number
const eventLines = parts.filter(p => p.indexOf("events") === 0)
  .reduce((t, p) => t + fs.readFileSync(path.join(ENGINE, p), "utf8")
    .split("\n").filter(l => l.trim()).length, 0);

// ---- has anything actually changed? -------------------------------------
// AN UNCHANGED LOG IS NOT BACKED UP TWICE.
const fingerprint = (() => { const h = crypto.createHash("sha256");
  parts.forEach(p => { const st = fs.statSync(path.join(ENGINE, p));
    h.update(p + ":" + st.size + ":" + st.mtimeMs + ";"); });
  return h.digest("hex").slice(0, 16); })();

fs.mkdirSync(STORE, { recursive: true });
const marker = path.join(STORE, "LATEST.json");
const last = (() => { try { return JSON.parse(fs.readFileSync(marker, "utf8")); }
                      catch (e) { return null; } })();
if (last && last.fingerprint === fingerprint && !FORCE &&
    fs.existsSync(path.join(STORE, last.file))) {
  console.log("\n  BACKUP: nothing has changed since " + last.at.slice(0, 16).replace("T", " ") +
    " — " + last.file + " still stands (" + last.events.toLocaleString("en-IN") + " events)\n");
  process.exit(0);
}

// ---- write it ------------------------------------------------------------
// A NAME STAMPED TO THE SECOND IS NOT A UNIQUE NAME. Two runs inside the same
// second wrote to the same file, and the failure path's own cleanup then
// deleted a copy that was perfectly good. Milliseconds, and a counter behind
// them, so a new backup can never land on an existing one.
let name, dest;
for (let n = 0; ; n++) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
  name = "skf-" + stamp + (n ? "-" + n : "") + ".tar.gz";
  dest = path.join(STORE, name);
  if (!fs.existsSync(dest)) break;
}
// AND NOTHING IS CALLED A BACKUP UNTIL IT HAS VERIFIED. It is written under a
// .part name, checked there, and only then renamed into place — so a failed
// run has nothing to clean up but its own scratch file, and can never reach
// a copy that already exists.
const part = dest + ".part";
try { fs.readdirSync(STORE).filter(f => f.endsWith(".part"))
  .forEach(f => fs.unlinkSync(path.join(STORE, f))); } catch (e) {}

let ok = false, why = null;
try {
  execFileSync("tar", ["-czf", part, "-C", ENGINE, ...parts], { stdio: "pipe" });

  // ---- A BACKUP NOBODY READ BACK IS A WISH ------------------------------
  // Open it again and count what is actually inside.
  const listed = String(execFileSync("tar", ["-tzf", part], { stdio: "pipe" }))
    .split("\n").map(s => s.trim()).filter(Boolean);
  const missing = parts.filter(p => listed.indexOf(p) < 0 && listed.indexOf("./" + p) < 0);
  if (missing.length) throw new Error("the archive is missing " + missing.length +
    " file(s): " + missing.slice(0, 3).join(", "));

  const back = String(execFileSync("sh",
    ["-c", "tar -xzOf " + JSON.stringify(part) + " " +
      parts.filter(p => p.indexOf("events") === 0).map(x => JSON.stringify(x)).join(" ") +
      " | grep -c ."], { stdio: "pipe" })).trim();
  if (Number(back) !== eventLines) throw new Error("read back " + back +
    " event lines, the source has " + eventLines);

  fs.renameSync(part, dest);   // only now is it a backup
  ok = true;
} catch (e) {
  // A FAILURE MESSAGE THAT PRINTS THE WHOLE COMMAND is twenty one filenames
  // of noise wrapped round the one sentence that matters.
  why = String(e.message || e).split("\n")[0].replace(/^Command failed: tar [^\n]*/,
    "tar could not write the archive (exit " + (e.status == null ? "?" : e.status) + ")");
  try { fs.unlinkSync(part); } catch (x) {} }

if (!ok) {
  // A FAILED BACKUP NEVER FAILS THE BUILD, but it is never quiet either.
  console.log("\n  ***  BACKUP FAILED  ***");
  console.log("  " + why);
  console.log("  the archive was deleted rather than left half written. Older copies still stand.");
  console.log("  the engine is rebuilt and usable; nothing new is protected.\n");
  process.exit(0);
}

const size = fs.statSync(dest).size;
fs.writeFileSync(marker, JSON.stringify({ file: name, at: new Date().toISOString(),
  fingerprint, events: eventLines, files: parts.length, bytes: size,
  restore: "tar -xzf backups/skf/" + name + " -C engines/skf" }, null, 1));

// ---- rotate, and only now -----------------------------------------------
// NOTHING IS ROTATED AWAY UNTIL THE NEW ONE VERIFIES.
const all = fs.readdirSync(STORE).filter(f => /^skf-.*\.tar\.gz$/.test(f)).sort();
const drop = all.slice(0, Math.max(0, all.length - KEEP));
drop.forEach(f => { try { fs.unlinkSync(path.join(STORE, f)); } catch (e) {} });

// ---- a second copy, somewhere that is not this disk ----------------------
// ONE DISK IS NOT A BACKUP. --copy-to takes the archive that just verified
// somewhere else entirely — a Drive mount, an external disk, a NAS. The copy
// is checked by hashing both ends: same bytes, or it does not count.
const COPY = arg("copy-to", process.env.DNB_BACKUP_COPY || null);
let copied = null, copyWhy = null;
if (COPY) {
  try {
    fs.mkdirSync(COPY, { recursive: true });
    // Same discipline as above: land it under .part, verify, then rename. A
    // half written file in a syncing folder is worse than no file, because
    // the sync will faithfully carry the damage.
    const cpart = path.join(COPY, name + ".part"), cdest = path.join(COPY, name);
    fs.copyFileSync(dest, cpart);
    const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    const a = sha(dest), b = sha(cpart);
    if (a !== b) throw new Error("the copy does not hash the same as the original");
    fs.renameSync(cpart, cdest);
    copied = cdest;
    // rotate the far end on its own terms — it may hold more or fewer
    fs.readdirSync(COPY).filter(f => /^skf-.*\.tar\.gz$/.test(f)).sort()
      .slice(0, -KEEP).forEach(f => { try { fs.unlinkSync(path.join(COPY, f)); } catch (e) {} });
  } catch (e) { copyWhy = String(e.message || e).split("\n")[0];
    try { fs.unlinkSync(path.join(COPY, name + ".part")); } catch (x) {} }
}

const mb = (n) => (n / 1048576).toFixed(1) + " MB";
console.log("\n  BACKED UP  " + name);
console.log("    " + eventLines.toLocaleString("en-IN") + " events and " +
  parts.filter(p => p.indexOf("events") !== 0).length + " answer stores · " +
  parts.length + " files · " + mb(size) + " compressed");
console.log("    verified by reading the archive back and counting what came out");
if (drop.length) console.log("    rotated away " + drop.length + " older cop" +
  (drop.length === 1 ? "y" : "ies") + ", " + Math.min(all.length, KEEP) + " kept");
console.log("    restore:  tar -xzf backups/skf/" + name + " -C engines/skf");

if (copied) {
  console.log("\n  SECOND COPY  " + copied);
  console.log("    hashed at both ends — the same bytes, not just the same size");
} else if (COPY) {
  console.log("\n  ***  THE SECOND COPY FAILED  ***");
  console.log("  " + copyWhy);
  console.log("  " + COPY + " — is the drive mounted? The local copy above is fine.");
} else {
  console.log("\n  NOTE: this sits on the same disk as the engine. It protects against a bad");
  console.log("  command, not against losing the machine. For a second copy:");
  console.log("    node tools/backup.js --copy-to <a Drive mount or external disk>");
}
console.log("");
