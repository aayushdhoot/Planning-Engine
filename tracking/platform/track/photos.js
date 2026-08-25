// ===================================================================
// DnB-OS . platform/track/photos.js . THE PHOTO STORE
// Snag proof photos come off a phone or a laptop, not out of Drive, so
// they have to live in the browser. Three rules keep that safe:
//   . every image is downscaled on the way in, never stored raw
//   . they live in their own store, never in the ledger key, so a full
//     photo store can never stop the ledger from saving its facts
//   . if the store will not take one, the attach is refused out loud
//     and nothing is half written
// The ledger and the query rows only ever hold a reference: id, name,
// day and size. The bytes stay here.
// ===================================================================

;(function (root) {

const KEY = "dnbos-track:skf:photos";
const MAX_DIM = 1400;      // longest edge after downscale
const QUALITY = 0.72;      // jpeg quality after downscale
const MAX_STORE = 4 * 1024 * 1024;  // stay well under the browser's own limit

const state = { photos: {}, seq: 0 };

function nextId() { state.seq++; return "P" + String(state.seq).padStart(4, "0"); }

// what the ledger is allowed to hold
function refOf(rec) {
  return rec ? { photoId: rec.id, name: rec.name, day: rec.day, w: rec.w, h: rec.h, bytes: rec.bytes } : null;
}

function totalBytes() {
  let n = 0;
  for (const k in state.photos) n += state.photos[k].bytes || 0;
  return n;
}

// Put an already encoded image (a data URL) into the store. No canvas
// and no DOM in here, so the guards can exercise it under node.
function put(rec) {
  if (!rec || !rec.data) return { ok: false, error: "an attach needs image data" };
  if (!rec.name) return { ok: false, error: "an attach needs a file name" };
  const bytes = rec.bytes || rec.data.length;
  if (totalBytes() + bytes > MAX_STORE) {
    return { ok: false, error: "The photo store is full, about " + Math.round(totalBytes() / 1024)
      + " KB is already held. Nothing was saved. Attach a smaller image, or archive closed snags first." };
  }
  const id = nextId();
  state.photos[id] = { id, name: rec.name, day: rec.day || null, data: rec.data,
    w: rec.w || null, h: rec.h || null, bytes };
  if (!save()) {
    delete state.photos[id]; state.seq--;
    return { ok: false, error: "The browser refused to save this photo, so it was not attached. The ledger was not touched." };
  }
  return { ok: true, ref: refOf(state.photos[id]) };
}

function get(id) { return (id && state.photos[id]) || null; }

function dataOf(refOrId) {
  const id = typeof refOrId === "string" ? refOrId : (refOrId && refOrId.photoId);
  const r = get(id);
  return r ? r.data : null;
}

// Browser only: read a chosen file, downscale it, then put it away.
// Anything that is not an image is refused, because a snag closes on a
// photo and on nothing else.
function fromFile(file, day) {
  return new Promise(resolve => {
    if (typeof FileReader === "undefined" || typeof document === "undefined")
      return resolve({ ok: false, error: "no browser image support in this runtime" });
    if (!file || !/^image\//.test(file.type || ""))
      return resolve({ ok: false, error: "That file is not an image. A snag closes on a photo." });
    const fr = new FileReader();
    fr.onerror = () => resolve({ ok: false, error: "the file could not be read" });
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => resolve({ ok: false, error: "that image could not be decoded" });
      img.onload = () => {
        const k = Math.min(1, MAX_DIM / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width || 1) * k));
        const h = Math.max(1, Math.round((img.height || 1) * k));
        let data;
        try {
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          data = c.toDataURL("image/jpeg", QUALITY);
        } catch (e) { return resolve({ ok: false, error: "that image could not be re encoded" }); }
        resolve(put({ name: file.name, day: day || null, data, w, h, bytes: data.length }));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// ---- persistence. Under node there is no store, and that is not a
// failure: the laws still hold, only the bytes have nowhere to sit.
function save() {
  if (typeof localStorage === "undefined") return true;
  try { localStorage.setItem(KEY, JSON.stringify({ photos: state.photos, seq: state.seq })); return true; }
  catch (e) { return false; }
}
function load() {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    state.photos = d.photos || {}; state.seq = d.seq || 0;
    return true;
  } catch (e) { return false; }
}
function reset() { state.photos = {}; state.seq = 0; save(); }

root.TRACK_PHOTOS = { state, put, get, dataOf, refOf, fromFile, totalBytes,
  save, load, reset, KEY, MAX_DIM, MAX_STORE };
if (typeof module !== "undefined") module.exports = root.TRACK_PHOTOS;

})(typeof window !== "undefined" ? window : globalThis);
