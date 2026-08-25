// ===================================================================
// DnB-OS . platform/track/camera.js . WHERE THE CAMERA LOOKS
// One job: turn a frozen pin (x, y, aim) into the three things every
// surface needs to draw the same camera the same way — the bearing in
// words, the facing arrow, and the cone the lens actually covers.
//
// Why this is a module and not four copies of atan2: the camera brief
// PDF handed to the design team, the phone capture app, and the walk
// views inside the app were each doing their own trigonometry. Three
// copies of a wedge is three chances for the app to show a cone the
// render was never shot to. The renders are compared against site
// photos pin by pin, so the cone in the app has to be the identical
// cone that was printed on the brief, not a lookalike.
//
// Rules:
//   . pure. No DOM, no state, no styling — it returns SVG path data
//     and a number, callers own colour, width and opacity
//   . the register's fov is the law (68 deg for SKF Pune). A pin may
//     carry its own fov for a wider lens; nothing else may invent one
//   . every plan view here is north up, i.e. the caller's ty() flips
//     world y. The arc sweep is fixed at 1 on that assumption
//   . works in world mm (the brief, the capture app) and in screen px
//     (the walk map) — the caller passes its own tx/ty, the arc radius
//     is derived from the transform so it scales without being told
// ===================================================================

;(function (root) {

var DEFAULT_FOV = 68;                       // horizontal, degrees

// The angle the camera looks along, in world radians, y up.
function aimAngle(p) {
  return Math.atan2(p.aim[1] - p.y, p.aim[0] - p.x);
}

// Degrees clockwise from plan right, 0..359. This is the number
// printed on every camera brief card ("148 deg clockwise from plan
// right"), so the site team can check a pin in words, not pixels.
function bearing(p) {
  var d = Math.round(Math.atan2(-(p.aim[1] - p.y), p.aim[0] - p.x) * 180 / Math.PI);
  if (d < 0) d += 360;
  return d;
}

// The fov that governs this pin: its own, else the register's, else 68.
function fovFor(p, reg) {
  var f = (p && p.fov) || (reg && reg.fov) || DEFAULT_FOV;
  return f;
}

// Identity transform, so a caller drawing in world mm passes nothing.
function ident(v) { return v; }

// Round like the brief does unless the caller wants decimals.
function rnd(v) { return Math.round(v); }

// ---- the cone: apex at the pin, opening fov degrees about the aim,
// r long in world units. Returns the "d" of a closed wedge.
//
// The arc radius is measured on the transformed points rather than
// scaled by a factor the caller has to remember to pass. Every
// transform here is uniform scale + y flip, so the distance apex->edge
// after transform IS the screen radius.
function conePathD(p, r, opt) {
  opt = opt || {};
  var tx = opt.tx || ident, ty = opt.ty || ident, fmt = opt.fmt || rnd;
  var a = aimAngle(p);
  var h = fovFor(p, opt.reg) * Math.PI / 360;   // half angle, radians
  var x1 = p.x + r * Math.cos(a - h), y1 = p.y + r * Math.sin(a - h);
  var x2 = p.x + r * Math.cos(a + h), y2 = p.y + r * Math.sin(a + h);
  var ax = tx(p.x), ay = ty(p.y);
  var e1x = tx(x1), e1y = ty(y1);
  var e2x = tx(x2), e2y = ty(y2);
  var rr = Math.sqrt((e1x - ax) * (e1x - ax) + (e1y - ay) * (e1y - ay));
  return "M" + fmt(ax) + "," + fmt(ay) +
    " L" + fmt(e1x) + "," + fmt(e1y) +
    " A" + fmt(rr) + "," + fmt(rr) + " 0 0 1 " + fmt(e2x) + "," + fmt(e2y) +
    " Z";
}

// ---- the facing arrow: shaft from the pin along the aim, plus a two
// stroke head at the tip. One path, so one stroke colour covers it.
function arrowPathD(p, len, opt) {
  opt = opt || {};
  var tx = opt.tx || ident, ty = opt.ty || ident, fmt = opt.fmt || rnd;
  var a = aimAngle(p);
  var hb = len * (opt.head || 0.22);           // head barb length
  var px = p.x + len * Math.cos(a), py = p.y + len * Math.sin(a);
  var h1 = a + Math.PI - 0.5, h2 = a + Math.PI + 0.5;
  var P = function (x, y) { return fmt(tx(x)) + "," + fmt(ty(y)); };
  return "M" + P(p.x, p.y) + " L" + P(px, py) +
    " M" + P(px + hb * Math.cos(h1), py + hb * Math.sin(h1)) +
    " L" + P(px, py) +
    " L" + P(px + hb * Math.cos(h2), py + hb * Math.sin(h2));
}

// ---- the words. Same sentence on the brief card and in the app, so a
// supervisor holding the printout and a planner on the screen are
// reading one fact.
function facingLine(p, reg) {
  return bearing(p) + "° clockwise from plan right · " +
    fovFor(p, reg) + "° lens";
}

// A compass style eighth, for readers who think in "looks north east"
// rather than degrees. Plan right is 0 and the plan is drawn north up,
// so 90 clockwise from plan right is plan down = south.
var EIGHTHS = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
function compass(p) {
  return EIGHTHS[Math.round(bearing(p) / 45) % 8];
}

root.TRACK_CAMERA = {
  DEFAULT_FOV: DEFAULT_FOV,
  aimAngle: aimAngle,
  bearing: bearing,
  fovFor: fovFor,
  conePathD: conePathD,
  arrowPathD: arrowPathD,
  facingLine: facingLine,
  compass: compass
};
if (typeof module !== "undefined") module.exports = root.TRACK_CAMERA;

})(typeof window !== "undefined" ? window : globalThis);
