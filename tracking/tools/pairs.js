#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/pairs.js . THE RENDER BESIDE THE PHOTOGRAPH
//   node tools/pairs.js
//
// Builds pairs.json.
//
// Every judgement this engine makes about site progress comes from one
// comparison: what the approved render says a room will look like, against
// what the camera found standing there. Fifty one thousand of those
// judgements are on the log and the two pictures have never once been shown
// side by side — the reasoning was visible and the evidence was not.
//
// Both have been on disk the whole time. 76 renders in 13 Site Tracking/3d,
// 22 walk days of photographs in 13 Site Tracking/pins. The report was
// locked because nothing paired them, and nothing paired them because the
// render filenames carry a room name — "P15 8 PAX MR.png" — so a plain
// P15.png lookup found 46 of 76 and quietly lost the rest.
//
// THE LAWS
//   . A PAIR NEEDS BOTH PICTURES. A pin with no render is listed and named
//     unscorable, never shown against a blank and never scored at nought.
//   . THE COMPARISON IS THE ONE THE ENGINE ALREADY PUBLISHED. This does not
//     re-read anything; it points at the assessment the progress figure was
//     built from, so the picture and the percentage cannot drift apart.
//   . WHAT THE RENDER HIDES IS NOT A DIVERGENCE. A finished room shows no
//     duct above its ceiling; that is the ceiling doing its job, and it is
//     separated from the things genuinely not built.
// ===================================================================
const fs = require("fs"), path = require("path");

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const A = read("assess.json"), L = read("layout.json");
const facts = read("facts.json") || {};
const PROJ = facts.folder || null;

const RENDER_DIR = "13 Site Tracking/3d";
const PIN_DIR = "13 Site Tracking/pins";

// ---- find every render, whatever the room is called in its filename -----
// "P15 8 PAX MR.png" is pin 15. A plain P15.png lookup finds 46 of the 76.
const renders = {};
if (PROJ) {
  try {
    fs.readdirSync(path.join(PROJ, RENDER_DIR)).forEach(f => {
      const m = /^P\s?0*(\d{1,2})(?:[ ._-]|\.png$|\.jpg$)/i.exec(f);
      if (!m) return;
      const n = Number(m[1]);
      // first one wins, so a stray duplicate cannot silently replace a pin
      if (!renders[n]) renders[n] = { file: f, rel: RENDER_DIR + "/" + f,
        room: (f.replace(/^P\s?0*\d{1,2}[ ._-]*/i, "").replace(/\.(png|jpg|jpeg)$/i, "") || null) };
    });
  } catch (e) {}
}

// ---- and every photograph, by pin and by day ---------------------------
const photos = {};
const walkDays = [];
if (PROJ) {
  try {
    fs.readdirSync(path.join(PROJ, PIN_DIR)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort().forEach(day => {
        let files = []; try { files = fs.readdirSync(path.join(PROJ, PIN_DIR, "/" + day)); } catch (e) {}
        let any = false;
        files.forEach(f => {
          const m = /^P0*(\d{1,2})_/.exec(f); if (!m) return;
          const n = Number(m[1]);
          (photos[n] = photos[n] || {})[day] = PIN_DIR + "/" + day + "/" + f;
          any = true;
        });
        if (any) walkDays.push(day);
      });
  } catch (e) {}
}

// ---- one row per pin ----------------------------------------------------
const latest = A ? A.latest : null;
const unframed = new Set(((A && A.counts && A.counts.unframed) || []).map(Number));
const areaOf = {}; ((L && L.pins) || []).forEach(p => areaOf[p.no] = p.area || p.space);
const pctOf = {}; ((L && L.pins) || []).forEach(p => pctOf[p.no] = p.pct);

const pins = Object.keys((A && A.pins) || {}).map(k => (A.pins[k])).map(P => {
  const n = P.pin;
  const r = renders[n] || null;
  const shots = photos[n] || {};
  const days = Object.keys(shots).sort();
  const shownDay = shots[latest] ? latest : days[days.length - 1] || null;

  // THE COMPARISON IS THE ONE THE ENGINE ALREADY PUBLISHED.
  const rows = (P.rows || []).filter(x => x.expected || x.saw);
  const agree = rows.filter(x => x.expected && x.saw &&
    x.expected.answer === x.saw.answer);
  // WHAT THE RENDER HIDES IS NOT A DIVERGENCE
  const hidden = rows.filter(x => x.expected && x.expected.answer === "no" && x.concealed);
  const missing = rows.filter(x => x.expected && x.expected.answer === "yes" &&
    x.saw && x.saw.answer === "no" && !x.concealed);
  const extra = rows.filter(x => x.expected && x.expected.answer === "no" &&
    x.saw && x.saw.answer === "yes" && !x.concealed);

  return {
    pin: n, area: areaOf[n] || P.space || null, pct: pctOf[n] == null ? null : pctOf[n],
    render: r ? { file: r.file, rel: r.rel, room: r.room } : null,
    photo: shownDay ? { day: shownDay, rel: shots[shownDay] } : null,
    photoDays: days,
    // THE PATH FOR EACH DAY, NOT A PATTERN TO REBUILD IT FROM. The digest used
    // to take the latest photo's name and swap the date into it, which holds
    // only while every frame of a pin is named the same way. A retake is not:
    // pin 1 is P01_2026-08-10_r1.jpg on 10 Aug and P01_2026-08-03.jpg on 3 Aug,
    // and the substitution published a file that does not exist.
    shots,
    scorable: !unframed.has(n) && !!r,
    counts: { judged: rows.length, agree: agree.length,
      missing: missing.length, extra: extra.length, hidden: hidden.length },
    // the words, not just the counts
    notBuilt: missing.slice(0, 8).map(x => ({ what: x.name, why: x.why || null })),
    unexpected: extra.slice(0, 6).map(x => ({ what: x.name, why: x.why || null })),
    behindTheCeiling: hidden.slice(0, 6).map(x => x.name),
  };
}).sort((a, b) => a.pin - b.pin);

const withBoth = pins.filter(p => p.render && p.photo);
const counts = {
  pins: pins.length,
  renders: Object.keys(renders).length,
  photographed: pins.filter(p => p.photo).length,
  paired: withBoth.length,
  noRender: pins.filter(p => !p.render).map(p => p.pin),
  noPhoto: pins.filter(p => !p.photo).map(p => p.pin),
  walkDays: walkDays.length,
};

// the pins where the render asks for most that is not there
const worst = withBoth.slice().sort((a, b) => b.counts.missing - a.counts.missing);

const out = {
  builtAt: new Date().toISOString(), latest, walkDays,
  counts, pins,
  worst: worst.slice(0, 12).map(p => ({ pin: p.pin, area: p.area,
    missing: p.counts.missing, pct: p.pct,
    what: p.notBuilt.map(x => x.what) })),
  imgBase: "/img?p=",
  why: "the render is what the room was approved to become and the photograph is what stood there " +
       "on the day. Every progress figure this engine publishes comes from comparing the two, and " +
       "this puts them beside each other. A pin with no render is named and never scored — the " +
       "five without one can never be settled by a camera",
};
fs.writeFileSync(path.join(ENGINE, "pairs.json"), JSON.stringify(out));

console.log("\n  RENDER AGAINST PHOTOGRAPH");
console.log("    " + counts.paired + " of " + counts.pins + " pins have both · " +
  counts.renders + " renders · " + counts.photographed + " photographed across " +
  counts.walkDays + " walk days");
if (counts.noRender.length) console.log("    no render: pins " + counts.noRender.join(", ") +
  " — these can never be scored");
if (counts.noPhoto.length) console.log("    no photograph: pins " + counts.noPhoto.join(", "));
console.log("\n  WHERE THE RENDER ASKS FOR MOST THAT IS NOT THERE");
worst.slice(0, 10).forEach(p => console.log("    pin " + String(p.pin).padStart(2) + "  " +
  String(p.area || "").slice(0, 26).padEnd(28) + String(p.counts.missing).padStart(2) + " not built · " +
  p.notBuilt.slice(0, 4).map(x => x.what).join(", ")));
console.log("\n→ engines/skf/pairs.json\n");
