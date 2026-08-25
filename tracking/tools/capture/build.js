// Capture app builder. Injects the frozen pin protocol into the mobile
// page so the field phone carries the exact same 81 pins the engine
// expects. Re-run after any pins.json regeneration:
//   node build.js
const fs = require("fs");
const pinsPath = __dirname + "/../data/skf/cad/pins.json";
const data = JSON.parse(fs.readFileSync(pinsPath, "utf8"));

// the phone carries: no, space, type, plan bearing, and the raw plan
// position (x, y, aim) so the shoot screen can draw the same map
// snippet the camera brief shows. deg: 0 = plan right, clockwise on
// screen, so the app can draw a direction arrow matching the brief.
const spaceType = {};
for (const s of data.spaces) spaceType[s.name] = s.type;
const pins = data.pins
  .slice()
  .sort((a, b) => a.no - b.no)
  .map(p => {
    let deg = null;
    if (Array.isArray(p.aim) && p.aim.length === 2) {
      deg = Math.round(Math.atan2(-(p.aim[1] - p.y), p.aim[0] - p.x) * 180 / Math.PI);
      if (deg < 0) deg += 360;
    }
    return { no: p.no, space: p.space, type: spaceType[p.space] || "open", deg,
      x: Math.round(p.x), y: Math.round(p.y),
      aim: Array.isArray(p.aim) ? [Math.round(p.aim[0]), Math.round(p.aim[1])] : null };
  });

// space outlines for the in app map guide, coordinates rounded to mm
const spaces = data.spaces.map(s => ({
  n: s.name, t: s.type,
  pts: s.pts.map(pt => [Math.round(pt[0]), Math.round(pt[1])])
}));

let t = fs.readFileSync(__dirname + "/_template.html", "utf8");
t = t.replace("/*__PINS__*/[]", JSON.stringify(pins));
t = t.replace("/*__SPACES__*/[]", JSON.stringify(spaces));
t = t.replace("/*__FOV__*/68", String(data.fov || 68));
fs.writeFileSync(__dirname + "/index.html", t);
console.log("built capture/index.html:", t.length, "bytes | pins:", pins.length,
  "| spaces:", spaces.length, "| fov:", data.fov || 68, "| frozen:", data.frozen);
