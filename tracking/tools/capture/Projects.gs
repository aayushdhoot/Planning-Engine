// ===================================================================
// DnB-OS . Projects.gs . THE INTAKE, IN DRIVE
// Paste this alongside Code.gs in the same Apps Script project, then
// Deploy > Manage deployments > edit > New version.
//
// What it gives the engine:
//   ?project=root                  the projects root folder, made if absent
//   ?project=new&name=NAME         create a project folder + its subfolders
//   ?project=list                  every project the engine can see
//   ?project=files&id=FOLDER_ID    what the team has actually put in it
//   ?project=file&id=FILE_ID       one file, base64, so the engine can read it
//
// THE SHAPE OF A PROJECT FOLDER
//   DnB-OS Projects/
//     <Project name>/
//       01 Contract & Commercial      contract, PO, payment terms, KT
//       02 Design                     layouts, GFC, 3D, DBR, brand guide
//       03 BOQ & Commercial           priced BOQ, make list, tender, RFP
//       04 Site                       DPRs, pin photos, minutes
//       05 Correspondence             mail threads, WhatsApp exports
//   The subfolders are a suggestion the engine makes so a team knows where
//   to drop things. It reads the WHOLE tree regardless of where a file
//   lands, because telling somebody their file was ignored for being in
//   the wrong folder is not a thing software should do.
// ===================================================================

var PROJECTS_ROOT_NAME = "DnB-OS Projects";

var PROJECT_SUBFOLDERS = [
  "01 Contract & Commercial",
  "02 Design",
  "03 BOQ & Commercial",
  "04 Site",
  "05 Correspondence"
];

function projectsRoot_() {
  var root = DriveApp.getRootFolder();
  return getOrMake_(root, PROJECTS_ROOT_NAME);
}

function projectRouter_(p) {
  try {
    if (p.project === "root")  return json_(projRoot_());
    if (p.project === "new")   return json_(projNew_(p.name));
    if (p.project === "list")  return json_(projList_());
    if (p.project === "files") return json_(projFiles_(p.id));
    if (p.project === "file")  return json_(projFile_(p.id));
    return json_({ ok: false, error: "unknown project action: " + p.project });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function projRoot_() {
  var f = projectsRoot_();
  return { ok: true, id: f.getId(), name: f.getName(), url: f.getUrl() };
}

function projNew_(name) {
  var nm = String(name || "").trim();
  if (!nm) return { ok: false, error: "a project needs a name" };
  var root = projectsRoot_();
  // getOrMake_, not create: asking twice for the same project must not
  // leave two folders with one name and the team split across them.
  var existed = root.getFoldersByName(nm).hasNext();
  var f = getOrMake_(root, nm);
  var made = [];
  for (var i = 0; i < PROJECT_SUBFOLDERS.length; i++) {
    var sub = PROJECT_SUBFOLDERS[i];
    if (!f.getFoldersByName(sub).hasNext()) made.push(sub);
    getOrMake_(f, sub);
  }
  return { ok: true, id: f.getId(), name: f.getName(), url: f.getUrl(),
           existed: existed, subfoldersMade: made };
}

function projList_() {
  var root = projectsRoot_(), out = [], it = root.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    out.push({ id: f.getId(), name: f.getName(), url: f.getUrl(),
               updated: f.getLastUpdated() ? f.getLastUpdated().toISOString() : null });
  }
  out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  return { ok: true, root: root.getId(), projects: out };
}

// Everything in the tree, with the subfolder it sat in. The engine shows
// this as "what we can see" BEFORE it reads anything, so a team can tell
// at a glance whether their upload landed.
function projFiles_(id) {
  if (!id) return { ok: false, error: "which project folder?" };
  var f = DriveApp.getFolderById(id);
  var out = [];
  walkProj_(f, "", out, 0);
  return { ok: true, id: id, name: f.getName(), url: f.getUrl(),
           files: out, count: out.length };
}

function walkProj_(folder, prefix, out, depth) {
  if (depth > 4) return;
  var fi = folder.getFiles();
  while (fi.hasNext()) {
    var x = fi.next();
    out.push({
      id: x.getId(), name: x.getName(), folder: prefix || "(top level)",
      mime: x.getMimeType(), size: x.getSize(),
      updated: x.getLastUpdated() ? x.getLastUpdated().toISOString() : null,
      by: (function () { try { return x.getOwner() ? x.getOwner().getEmail() : null; } catch (e) { return null; } })(),
      url: x.getUrl()
    });
  }
  var fo = folder.getFolders();
  while (fo.hasNext()) {
    var s = fo.next();
    walkProj_(s, prefix ? prefix + "/" + s.getName() : s.getName(), out, depth + 1);
  }
}

// One file, base64. Google-native files are exported first, because a
// Doc or a Sheet has no bytes of its own to hand over.
var EXPORT_AS = {
  "application/vnd.google-apps.spreadsheet": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.google-apps.document":    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.google-apps.presentation":"application/pdf"
};

function projFile_(id) {
  if (!id) return { ok: false, error: "which file?" };
  var f = DriveApp.getFileById(id);
  var mime = f.getMimeType();
  var blob;
  if (EXPORT_AS[mime]) {
    // a Google-native file is exported to something with bytes
    var url = "https://www.googleapis.com/drive/v3/files/" + id +
              "/export?mimeType=" + encodeURIComponent(EXPORT_AS[mime]);
    var res = UrlFetchApp.fetch(url, {
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200)
      return { ok: false, error: "could not export this " + mime + ": " + res.getResponseCode() };
    blob = res.getBlob();
    mime = EXPORT_AS[mime];
  } else {
    blob = f.getBlob();
  }
  var bytes = blob.getBytes();
  // A FILE TOO BIG TO HAND OVER IS SAID SO, NOT TRUNCATED. A half-read
  // drawing is worse than an unread one, because it looks complete.
  if (bytes.length > 40 * 1024 * 1024)
    return { ok: false, tooBig: true, size: bytes.length, name: f.getName(),
             error: "this file is " + Math.round(bytes.length / 1048576) +
                    " MB — too large to pass through Apps Script. Read it with the local ingest instead." };
  return { ok: true, id: id, name: f.getName(), mime: mime,
           size: bytes.length, b64: Utilities.base64Encode(bytes) };
}
