// ===================================================================
// DnB-OS . platform/report/design.js . THE REPORT DESIGN LANGUAGE
//
// One place that owns the whole look of everything this engine publishes,
// so a new report inherits the finished look instead of inventing one.
// The visual language is the one the tracking engine's reference PDFs
// carry and which people already recognise: cream paper, white cards,
// five pastel pairs, Poppins headings, Lato body, typography over colour,
// low noise. A page is 1280 x 720 — the 16:9 those PDFs print at — and one
// report page prints as exactly one PDF page.
//
// WHAT THIS ONE DOES THAT THE TRACKING KIT DOES NOT
//   Every number on this engine folds out of an append-only log, and that
//   is the whole reason to trust it. So the design carries it:
//
//   . A FIGURE CAN NAME ITS SOURCE. stat() and row() take a `from`, and it
//     prints under the number in the same small grey as the caption. A
//     report where nobody can ask "where did 18% come from" is a deck.
//   . A SECTION CARRIES ITS READING. Coverage and confidence sit in the
//     section foot — 81 of 81 pins, high confidence — because a figure off
//     a half walked round is a different figure.
//   . WHAT COULD NOT BE SAID IS A COMPONENT, not an omission. couldNotSay()
//     is styled like everything else and sits in the flow, so a missing
//     input is published rather than quietly leaving a heading empty.
//   . A NUMBER THAT IS NOT KNOWN PRINTS AS "not read", never as nought.
//
// Pure. CSS is a string injected once; every builder takes data and returns
// markup, so the guards drive it with no DOM and the view drops the strings
// straight in.
// ===================================================================
;(function (root) {

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// the five pastel pairs, named so a tone is never a raw hex
var TONES = ["sage", "sky", "sand", "lilac", "rose"];
var TONE_WORD = {
  ok: "sage", done: "sage", ahead: "sage", "on plan": "sage", "on track": "sage", good: "sage",
  bad: "rose", behind: "rose", late: "rose", risk: "rose", "at risk": "rose", blocking: "rose",
  warn: "sand", watch: "sand", expedite: "sand", open: "sand",
  info: "sky", planned: "sky",
  unknown: "neutral", "not read": "neutral", "no reading": "neutral", locked: "neutral"
};

// THE PALETTE WAS RENAMED WHEN THE DESIGN CHANGED AND THE BUILDERS WERE NOT.
// Every one of them still emitted var(--rp-sky) and friends, which resolve to
// nothing — so a chart of bars drew as six empty tracks with no fill at all,
// and a chip drew with no background. One place now maps a tone name onto a
// variable that exists, and nothing outside it names a colour.
var TONEVAR = { sky:"n3", sage:"ok", ok:"ok", good:"ok", rose:"bad", bad:"bad",
  behind:"bad", late:"bad", risk:"bad", blocking:"bad", sand:"warn", warn:"warn",
  watch:"warn", open:"warn", lilac:"n3", info:"n3", neutral:"muted", plain:"muted" };
function cvar(t) { return "var(--" + (TONEVAR[String(t || "").toLowerCase()] || "n") + ")"; }
function cbg(t) { var v = TONEVAR[String(t || "").toLowerCase()];
  return v === "ok" || v === "bad" || v === "warn" ? cvar(t) : "var(--cream)"; }

function toneOf(w) { return TONE_WORD[String(w || "").toLowerCase()] || "neutral"; }

// ONE DATE FORMAT IN A DOCUMENT. A page carrying 2026-08-01 in its header and
// "24 Jul 26" in its rows reads as two documents stapled together, and it is
// the sort of thing a reader notices before they notice the numbers.
var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDay(d) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ""));
  return m ? (Number(m[3]) + " " + MON[Number(m[2]) - 1] + " " + m[1]) : String(d == null ? "" : d);
}
// every ISO date anywhere in a run of text, set the same way
function dates(t) {
  return String(t == null ? "" : t).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,
    function (_, y, mo, d) { return Number(d) + " " + MON[Number(mo) - 1] + " " + y; });
}

// A NUMBER THAT IS NOT KNOWN IS NOT NOUGHT.
function val(v, unit) {
  if (v == null || v === "") return '<span class="rp-nr">not read</span>';
  return esc(String(v)) + (unit ? '<span class="rp-u">' + esc(unit) + "</span>" : "");
}

var CSS = [
"@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');",
// ---- the palette ----------------------------------------------------
// Navy and gold on white, the way the reference deck does it. Navy carries
// every headline and every filled block; gold marks the one thing on a page
// that matters most and nothing else. Cream is for cards. The pastels are
// gone: five tints of equal weight across a page is confetti.
".rwrap{--n:#12314B;--n2:#0E2438;--n3:#1D4666;--ink:#12314B;--body:#55606E;",
"  --muted:#7A838F;--faint:#9AA2AC;--gold:#C8952F;--gold2:#E0B45A;",
"  --cream:#F5F2EC;--hair:#E4E7EB;--rule:#D8DCE1;--ok:#1F6B4A;--bad:#A33B28;--warn:#9A7420;",
"  font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1;}",
// ---- the stage ------------------------------------------------------
".rstage{background:#E9EBEE;padding:24px;display:flex;flex-direction:column;align-items:center;",
"  gap:24px;min-height:100%;overflow-x:auto;}",
".rstage .rpage{transform:scale(var(--rp-scale,1));transform-origin:top center;",
"  margin-bottom:calc((var(--rp-scale,1) - 1) * 720px);}",
".rtoolbar{width:1280px;max-width:100%;display:flex;align-items:center;gap:10px;flex-wrap:wrap;",
"  font-family:'Inter',sans-serif;}",
".rbtn{font-family:'Inter',sans-serif;font-size:12.5px;border-radius:6px;padding:7px 13px;",
"  cursor:pointer;border:1px solid var(--rule);background:#fff;color:var(--body);}",
".rbtn.primary{background:var(--n);color:#fff;border-color:var(--n);}",
".rbtn.back{background:transparent;border-color:transparent;color:var(--muted);padding-left:0;}",
".rtip{font-size:12px;color:var(--faint);}",
// ---- the page -------------------------------------------------------
".rpage{width:1280px;height:720px;background:#fff;color:var(--ink);position:relative;",
"  overflow:hidden;box-shadow:0 8px 30px rgba(18,49,75,.10);flex:none;",
"  font-family:'Inter','Helvetica Neue',Arial,sans-serif;}",
".rp-in{position:absolute;left:72px;right:72px;top:52px;bottom:78px;}",
// the numbered section marker with its gold rule
".rp-eyebrow{display:flex;align-items:baseline;gap:14px;margin:0 0 4px;}",
".rp-eyebrow .no{font-size:12px;font-weight:700;letter-spacing:2px;color:var(--gold);}",
".rp-eyebrow .lb{font-size:12px;font-weight:600;letter-spacing:2.4px;text-transform:uppercase;",
"  color:var(--n3);}",
".rp-erule{width:56px;height:3px;background:var(--gold);margin:10px 0 20px;}",
".rp-h1{font-size:35px;font-weight:800;line-height:1.14;margin:0 0 10px;letter-spacing:-.6px;",
"  color:var(--n);}",
".rp-h1 em{font-style:normal;color:var(--gold);}",
".rp-sub{font-size:15.5px;color:var(--body);margin:0 0 22px;line-height:1.55;max-width:1000px;}",
".rp-body{}",
".rp-foot{position:absolute;left:72px;right:72px;bottom:30px;display:flex;",
"  justify-content:space-between;align-items:center;font-size:11px;letter-spacing:1.4px;",
"  text-transform:uppercase;color:var(--faint);border-top:1px solid var(--hair);padding-top:11px;}",
".rp-foot .pg{font-weight:700;color:var(--muted);letter-spacing:1px;}",
// ---- the cover ------------------------------------------------------
".rpage.rp-cover{background:var(--n2);color:#fff;}",
".rp-grid{position:absolute;inset:0;opacity:.5;",
"  background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),",
"    linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);",
"  background-size:96px 96px;}",
".rp-glow{position:absolute;right:-160px;top:-120px;width:620px;height:520px;border-radius:50%;",
"  background:radial-gradient(closest-side,rgba(200,149,47,.20),transparent);}",
".rp-cover .rp-in{top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;z-index:2;}",
".rp-cover .rp-kick{font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;",
"  color:var(--gold2);margin:0 0 16px;}",
".rp-cover h1{font-size:58px;font-weight:800;line-height:1.06;letter-spacing:-1.4px;margin:0;color:#fff;}",
".rp-cover h1 .thin{display:block;font-weight:400;color:#9FB0C0;}",
".rp-covrule{width:68px;height:4px;background:var(--gold);margin:26px 0 24px;}",
".rp-cover p{font-size:16px;line-height:1.7;color:#B9C6D2;max-width:760px;margin:0;}",
".rp-covtop{position:absolute;left:72px;right:72px;top:52px;display:flex;align-items:center;",
"  justify-content:space-between;z-index:3;font-size:12px;font-weight:700;letter-spacing:3px;color:#fff;}",
".rp-covtop .r{color:#8FA3B5;font-weight:600;letter-spacing:2.4px;}",
".rp-cover .rp-foot{color:#7C8B99;border-top-color:rgba(255,255,255,.12);z-index:3;}",
".rp-cover .rp-foot .gold{color:var(--gold2);}",
// a cover that leads with a photograph instead of the grid
".rp-hero{position:absolute;inset:0;overflow:hidden;}",
".rp-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}",
".rp-hero .scrim{position:absolute;inset:0;",
"  background:linear-gradient(100deg,rgba(14,36,56,.96) 0%,rgba(14,36,56,.88) 46%,rgba(14,36,56,.45) 100%);}",
// ---- stat cards -----------------------------------------------------
".rp-stats{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:16px;margin:0 0 18px;}",
".rp-stat{background:var(--cream);border:1px solid var(--hair);border-radius:8px;",
"  padding:18px 18px 16px;}",
".rp-stat b{display:block;font-size:33px;font-weight:800;line-height:1;letter-spacing:-1px;",
"  color:var(--n);white-space:nowrap;}",
".rp-stat b.word{font-size:21px;letter-spacing:-.2px;}",
".rp-stat .u{font-size:14px;font-weight:600;margin-left:3px;color:var(--n3);letter-spacing:0;}",
".rp-stat .cap{display:block;font-size:12px;line-height:1.45;color:var(--body);margin-top:12px;}",
".rp-srcline{font-size:10.6px;letter-spacing:1.2px;text-transform:uppercase;color:var(--faint);",
"  margin:-8px 0 20px;}",
// ---- chips ----------------------------------------------------------
".r-chip{display:inline-block;font-size:11.5px;font-weight:600;padding:4px 11px;border-radius:5px;",
"  background:var(--n);color:#fff;letter-spacing:.2px;}",
".r-chip.ok{background:var(--ok);} .r-chip.bad{background:var(--bad);}",
".r-chip.warn{background:var(--warn);} .r-chip.plain{background:var(--cream);color:var(--n);",
"  border:1px solid var(--hair);}",
// ---- the spec list: label left, value right, hairlines ---------------
".rp-specs{width:100%;}",
".rp-spec{display:flex;align-items:baseline;justify-content:space-between;gap:20px;",
"  padding:11px 0;border-bottom:1px solid var(--hair);}",
".rp-spec:first-child{border-top:1px solid var(--hair);}",
".rp-spec .k{font-size:13.5px;color:var(--body);}",
".rp-spec .k i{display:block;font-style:normal;font-size:11.4px;color:var(--faint);margin-top:2px;}",
".rp-spec .v{font-size:14px;font-weight:700;color:var(--n);text-align:right;}",
".rp-spec .v.ok{color:var(--ok);} .rp-spec .v.bad{color:var(--bad);} .rp-spec .v.warn{color:var(--warn);}",
// ---- two columns ----------------------------------------------------
".rp-two{display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:start;}",
".rp-two.wide-l{grid-template-columns:1.15fr 1fr;}",
".rp-panel{background:var(--cream);border:1px solid var(--hair);border-radius:8px;padding:20px;}",
// ---- tables ---------------------------------------------------------
".rp-tbl{width:100%;border-collapse:collapse;font-size:13px;}",
".rp-tbl th{font-size:10.6px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;",
"  color:var(--muted);text-align:left;padding:0 14px 9px 0;border-bottom:1px solid var(--n);}",
".rp-tbl td{padding:10px 14px 10px 0;border-bottom:1px solid var(--hair);color:var(--body);",
"  vertical-align:middle;}",
".rp-tbl td b{font-weight:600;color:var(--n);}",
".rp-tbl td.n,.rp-tbl th.n{text-align:right;padding-right:0;}",
".rp-bar{display:flex;align-items:center;gap:10px;justify-content:flex-end;}",
".rp-bar .tr{height:6px;border-radius:3px;background:var(--cream);width:180px;overflow:hidden;flex:none;}",
".rp-bar .tr i{display:block;height:100%;border-radius:3px;background:var(--n3);}",
".rp-bar .n{min-width:38px;text-align:right;font-weight:700;color:var(--n);}",
// ---- bars -----------------------------------------------------------
".rp-duals{margin:0 0 4px;}",
".rp-dual{display:grid;grid-template-columns:210px 1fr 76px;gap:16px;align-items:center;padding:8px 0;}",
".rp-dual .nm{font-size:13px;color:var(--n);font-weight:600;}",
".rp-dual .nm i{display:block;font-style:normal;font-size:11.2px;color:var(--muted);font-weight:400;",
"  margin-top:2px;}",
".rp-lanes{display:flex;flex-direction:column;gap:5px;}",
".rp-lane{height:9px;border-radius:3px;background:var(--cream);overflow:hidden;}",
".rp-lane i{display:block;height:100%;border-radius:3px;}",
".rp-lane.plan i{background:var(--rule);}",
".rp-dual.solo .rp-lane{height:12px;}",
".rp-dual .rt{text-align:right;font-size:14px;font-weight:700;}",
".rp-legend{display:flex;gap:20px;font-size:11.4px;color:var(--muted);margin-top:10px;}",
".rp-legend i{display:inline-block;width:18px;height:6px;border-radius:3px;vertical-align:middle;",
"  margin-right:7px;}",
".rp-legend i.plan{background:var(--rule);}",
// ---- cards ----------------------------------------------------------
".rp-cards{display:grid;gap:14px;margin:0 0 16px;}",
".rp-cards.c1{grid-template-columns:1fr;} .rp-cards.c2{grid-template-columns:1fr 1fr;}",
".rp-cards.c3{grid-template-columns:repeat(3,1fr);} .rp-cards.c4{grid-template-columns:repeat(4,1fr);}",
".rp-card{background:var(--cream);border:1px solid var(--hair);border-radius:8px;padding:16px 18px;}",
".rp-card.dark{background:var(--n);border-color:var(--n);}",
".rp-card.dark h3,.rp-card.dark p,.rp-card.dark .foot{color:#fff;}",
".rp-card.dark p{color:#B9C6D2;}",
".rp-card h3{font-size:14px;font-weight:700;margin:0 0 7px;color:var(--n);}",
".rp-card p{font-size:12.6px;line-height:1.6;color:var(--body);margin:0;}",
".rp-card .foot{font-size:11px;color:var(--faint);margin-top:9px;}",
// ---- rows -----------------------------------------------------------
".rp-rows{margin:0 0 8px;}",
".rp-row{display:flex;gap:20px;align-items:baseline;padding:10px 0;border-bottom:1px solid var(--hair);}",
".rp-row:first-child{border-top:1px solid var(--hair);}",
".rp-row .k{font-size:13.2px;color:var(--body);flex:1;}",
".rp-row .k i{display:block;font-style:normal;font-size:11.3px;color:var(--faint);margin-top:3px;",
"  line-height:1.45;}",
".rp-row .v{font-size:13.6px;font-weight:700;color:var(--n);text-align:right;max-width:54%;}",
".rp-row.ok .v{color:var(--ok);} .rp-row.bad .v{color:var(--bad);} .rp-row.warn .v{color:var(--warn);}",
".rp-row .v .src{display:block;font-size:10.6px;font-weight:400;letter-spacing:1px;",
"  text-transform:uppercase;color:var(--faint);margin-top:4px;}",
".rp-nr{font-weight:400;color:var(--faint);font-style:italic;font-size:14px;}",
// ---- photographs ----------------------------------------------------
".rp-shots{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:0;}",
".rp-shots.one{grid-template-columns:minmax(0,556px);justify-content:center;}",
".rp-shot{border-radius:8px;overflow:hidden;background:var(--cream);border:1px solid var(--hair);}",
// SIZED SO A PAIR FITS THE PAGE. At 404 the band measured 537 against a 528
// page and every band was cut back to a single frame — which is the layout
// this was meant to replace. The frames give way, never the pairing.
".rp-shot img{display:block;width:100%;height:362px;object-fit:cover;}",
".rp-shot .cap{padding:13px 16px 15px;}",
".rp-shot .cap b{display:block;font-size:14px;font-weight:700;color:var(--n);}",
".rp-shot .cap span{display:block;font-size:12px;color:var(--muted);margin-top:3px;line-height:1.45;}",
// ---- the reading foot and the gap block ------------------------------
".rp-read{display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:11px;",
"  letter-spacing:1.1px;text-transform:uppercase;color:var(--faint);margin-top:12px;}",
".rp-read b{font-weight:700;color:var(--muted);}",
".rp-gap{border-left:3px solid var(--gold);background:var(--cream);border-radius:0 8px 8px 0;",
"  padding:15px 18px;margin:0 0 14px;}",
".rp-gap h4{font-size:11.4px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;",
"  color:var(--warn);margin:0 0 8px;}",
".rp-gap ul{margin:0;padding-left:18px;} .rp-gap li{font-size:12.4px;color:var(--body);line-height:1.65;}",
".rp-sh{font-size:17px;font-weight:700;color:var(--n);margin:0 0 8px;letter-spacing:-.2px;}",
".rp-note{font-size:12.6px;color:var(--body);line-height:1.6;margin:0 0 14px;max-width:1010px;}",
".rp-pills{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;}",
".rp-pill{font-size:12px;font-weight:600;padding:6px 13px;border-radius:5px;",
"  background:rgba(255,255,255,.10);color:#C6D2DC;}",

// ---- the floor plate ------------------------------------------------
".rp-plan{background:var(--cream);border:1px solid var(--hair);border-radius:8px;padding:14px 16px;}",
".rp-plan svg{display:block;width:100%;height:auto;}",
".rp-plankey{display:flex;gap:22px;flex-wrap:wrap;margin-top:14px;font-size:11.6px;color:var(--body);}",
".rp-plankey i{display:inline-block;width:10px;height:10px;border-radius:10px;margin-right:7px;",
"  vertical-align:middle;}",
".rp-plannote{font-size:11px;color:var(--faint);margin-top:9px;line-height:1.5;}",
".rp-planrank{display:grid;grid-template-columns:1fr 1fr;gap:1px 34px;margin-top:13px;",
"  padding-top:12px;border-top:1px solid var(--hair);}",
".rp-planrank .rk{display:grid;grid-template-columns:1fr 88px 44px;gap:12px;align-items:center;",
"  padding:4px 0;}",
".rp-planrank .nm{font-size:12px;font-weight:600;color:var(--n);}",
".rp-planrank .nm i{display:block;font-style:normal;font-size:10.4px;font-weight:400;",
"  color:var(--faint);margin-top:1px;}",
".rp-planrank .tr{height:6px;border-radius:3px;background:var(--cream);overflow:hidden;}",
".rp-planrank .tr i{display:block;height:100%;border-radius:3px;}",
".rp-planrank .pc{font-size:12.5px;font-weight:700;text-align:right;}",

// ---- charts ---------------------------------------------------------
".rp-chart{background:var(--cream);border:1px solid var(--hair);border-radius:8px;padding:16px 18px;}",
".rp-chart svg{display:block;width:100%;height:auto;}",
".rp-chartkey{display:flex;gap:24px;flex-wrap:wrap;margin-top:12px;font-size:11.6px;color:var(--body);}",
".rp-chartkey i{display:inline-block;width:20px;height:3px;border-radius:2px;margin-right:8px;",
"  vertical-align:middle;}",
".rp-chartkey i.dot{width:10px;height:10px;border-radius:10px;}",
".rp-chartnote{font-size:11px;color:var(--faint);margin-top:9px;line-height:1.5;}",
// ---- print ----------------------------------------------------------
"@media print{",
"  @page{size:1280px 720px;margin:0;}",
"  .rstage{background:#fff;padding:0;gap:0;display:block;overflow:visible;}",
"  .rtoolbar,.noprint{display:none !important;}",
"  .rpage{box-shadow:none;margin:0 !important;transform:none !important;",
"    break-inside:avoid;page-break-inside:avoid;}",
"  .rpage + .rpage{break-before:page;page-break-before:always;}",
"  html,body{background:#fff;}",
"  *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}",
"}"
].join("\n");

// ---- builders -------------------------------------------------------

// A page. variant "cover" | "plain". foot carries the page number.
function page(o) {
  o = o || {};
  // THE NUMBERED SECTION MARKER. A gold index, the section name in small caps
  // and a short gold rule beneath — the structure that makes a deck read as
  // one document rather than a stack of unrelated pages.
  var eye = (o.no || o.eyebrow)
    ? '<div class="rp-eyebrow">' + (o.no ? '<span class="no">' + esc(o.no) + "</span>" : "") +
      (o.eyebrow ? '<span class="lb">' + esc(o.eyebrow) + "</span>" : "") + "</div>" +
      '<div class="rp-erule"></div>'
    : "";
  var head = eye +
    (o.title ? '<h1 class="rp-h1">' + headline(o.title) + "</h1>" : "") +
    (o.sub ? '<div class="rp-sub">' + esc(o.sub) + "</div>" : "");
  return '<div class="rpage">' +
    '<div class="rp-in">' + head + '<div class="rp-body">' + (o.body || "") + "</div></div>" +
    '<div class="rp-foot"><span>' + esc(o.footL || (BRAND.name + " · DnB-OS")) + "</span>" +
    '<span class="pg">' + esc(o.footR || "") + "</span></div></div>";
}

function pills(list) {
  return '<div class="rp-pills">' + (list || []).map(function (p) {
    var t = p.tone || "sky";
    return '<div class="rp-pill">' +
      esc(p.t) + "</div>";
  }).join("") + "</div>";
}

// stat cards. [{big, cap, from, tone, unit}]. `from` is the provenance line.
// A LONG VALUE IN A BIG FONT BREAKS MID-VALUE — "2026-08-22" at 31px wrapped
// to "2026-08-" and "22" across two lines, which reads as a broken date rather
// than a long one. The figure gives way, never the meaning.
function stats(cards) {
  var list = (cards || []).filter(Boolean);
  // PROVENANCE ONCE, NOT FIVE TIMES. Four cards reading "the site's daily
  // report" under four figures is the same sentence printed four times; it
  // stops being provenance and becomes noise. The distinct sources are
  // collected and stated once beneath the band, which is both quieter and
  // more honest — it shows at a glance that this band came from two files.
  // ONE SOURCE, ONE MENTION. Two cards naming "hse.json · 2026-08-10" and
  // "hse.json" are naming the same file at two granularities, and printing
  // both gives "hse.json · 2026-08-10 · hse.json". The more specific one wins.
  var srcs = [];
  list.forEach(function (c) {
    if (!c.from) return;
    var i = srcs.findIndex(function (x) {
      return x === c.from || x.indexOf(c.from) === 0 || c.from.indexOf(x) === 0; });
    if (i < 0) srcs.push(c.from);
    else if (c.from.length > srcs[i].length) srcs[i] = c.from;   // keep the specific one
  });
  var band = '<div class="rp-stats">' + list.map(function (c, i) {
    // COLOUR MARKS A STATE, NOTHING ELSE. A figure tinted because a tint was
    // available tells the reader that tints were available.
    var t = c.tone && c.tone !== "neutral" ? c.tone : null;
    var isWord = c.big != null && isNaN(Number(String(c.big).replace(/[+,%]/g, "")));
    return '<div class="rp-stat' + (i === 0 ? " lead" : "") + '">' +
      "<b" + (isWord ? ' class="word"' : "") +
        (t ? ' style="color:' + cvar(t) + '"' : "") + ">" + val(c.big, c.unit) + "</b>" +
      '<span class="cap">' + esc(c.cap) + "</span></div>";
  }).join("") + "</div>";
  return band + (srcs.length
    ? '<div class="rp-srcline">read from ' + esc(srcs.join(" · ")) + "</div>" : "");
}

function cards(items, cols) {
  return '<div class="rp-cards c' + (cols || 2) + '">' + (items || []).map(function (c) {
    return '<div class="rp-card' + (c.tone === "dark" ? " dark" : "") + '">' +
      (c.head ? "<h3>" + esc(c.head) + "</h3>" : "") +
      (c.body ? "<p>" + esc(c.body) + "</p>" : "") +
      (c.foot ? '<div class="foot">' + esc(c.foot) + "</div>" : "") + "</div>";
  }).join("") + "</div>";
}

// key/value rows. [{k, note, v, tone, from}]
function rows(list) {
  return '<div class="rp-rows">' + (list || []).map(function (r) {
    var t = TONEVAR[String(r.tone || "").toLowerCase()];
    // THE SOURCE WAS RUNNING INTO THE VALUE. .rp-src lost its rule when the
    // stylesheet was rebuilt, so it rendered inline and printed
    // "Designer ceiling 1 to 2%read off the walk" as one word.
    return '<div class="rp-row' + (t === "ok" ? " ok" : t === "bad" ? " bad" :
      t === "warn" ? " warn" : "") + '">' +
      '<div class="k">' + esc(r.k) + (r.note ? "<i>" + esc(r.note) + "</i>" : "") + "</div>" +
      '<div class="v">' + val(r.v, r.unit) +
      (r.from ? '<span class="src">' + esc(r.from) + "</span>" : "") + "</div></div>";
  }).join("") + "</div>";
}

function chip(text, tone) {
  var t = tone || toneOf(text);
  return '<span class="r-chip" style="background:' + cbg(t) + '">' +
    esc(text) + "</span>";
}

// plan against what the camera saw. [{name, note, plan, site, tone, right}]
// A CHART NEVER ADVERTISES A SERIES IT DOES NOT DRAW. Every row here used to
// get a pale "plan" lane whether or not there was a plan, and a legend naming
// it — so a manpower trend, which has no plan lane at all, printed six empty
// bars and a key explaining them. The lane and the legend now appear only
// when at least one row actually carries a plan.
function duals(list, legend) {
  var rows = list || [];
  var hasPlan = rows.some(function (r) { return Number(r.plan) > 0; });
  var body = rows.map(function (r) {
    var t = r.tone || "sky";
    var p = Math.max(0, Math.min(100, Number(r.plan) || 0));
    var v = Math.max(0, Math.min(100, Number(r.site) || 0));
    return '<div class="rp-dual' + (hasPlan ? "" : " solo") + '">' +
      '<div class="nm">' + esc(r.name) + (r.note ? "<i>" + esc(r.note) + "</i>" : "") + "</div>" +
      '<div class="rp-lanes">' +
      (hasPlan ? '<div class="rp-lane plan"><i style="width:' + p + '%"></i></div>' : "") +
      '<div class="rp-lane"><i style="width:' + v + '%;background:' + cvar(t) + '"></i></div>' +
      "</div>" +
      '<div class="rt" style="color:' + cvar(t) + '">' +
      (r.right != null ? esc(String(r.right)) : val(r.site, "%")) + "</div></div>";
  }).join("");
  // THE KEY MATCHES THE CHART. The "what was there" swatch was hardcoded blue
  // while the bars beside it were drawn in the tone each row carries — so a
  // chart of gold bars was explained by a blue dot, which is a key that is
  // simply wrong. It takes the colour the rows actually use.
  var tally = {};
  rows.forEach(function (r) { var t = r.tone || "sky"; tally[t] = (tally[t] || 0) + 1; });
  var main = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; })[0] || "sky";
  var leg = (legend === false || !hasPlan) ? "" :
    '<div class="rp-legend"><span><i class="plan"></i>the programme asks for</span>' +
    '<span><i class="site" style="background:' + cvar(main) + '"></i>what was there</span></div>';
  return '<div class="rp-duals">' + body + leg + "</div>";
}

// headers: ["a", {t:"b", n:true}]. rows: array of arrays; a cell may be
// {t, tone, b} for a chip, bold or tinted cell.
function table(headers, list) {
  var th = (headers || []).map(function (h) {
    var o = typeof h === "string" ? { t: h } : h;
    return '<th' + (o.n ? ' class="n"' : "") + ">" + esc(o.t) + "</th>";
  }).join("");
  var tr = (list || []).map(function (r) {
    return "<tr>" + (r || []).map(function (c) {
      var o = (c && typeof c === "object") ? c : { t: c };
      var inner = o.chip ? chip(String(o.t), o.tone)
        // {bar: 0..100} draws the figure as a proportion as well as a number
        : o.bar != null ? '<div class="rp-bar"><div class="tr"><i style="width:' +
            Math.max(0, Math.min(100, Number(o.bar) || 0)) + '%"></i></div>' +
            '<span class="n">' + val(o.t, o.unit) + "</span></div>"
        : o.b ? "<b>" + val(o.t, o.unit) + "</b>" : val(o.t, o.unit);
      return '<td' + (o.n ? ' class="n"' : "") +
        (o.tone && !o.chip ? ' style="color:' + cvar(o.tone) + '"' : "") + ">" +
        inner + (o.note ? '<div style="font-size:10.6px;color:var(--faint)">' + esc(o.note) + "</div>" : "") +
        "</td>";
    }).join("") + "</tr>";
  }).join("");
  return "<table class=\"rp-tbl\"><tr>" + th + "</tr>" + tr + "</table>";
}

// photographs. [{src, head, note}] — nothing is published that nobody shot.
// Two per band. More than two is a contact sheet, not a report page.
function shots(list) {
  var n = (list || []).slice(0, 2);
  return '<div class="rp-shots' + (n.length === 1 ? " one" : "") + '">' + n.map(function (s) {
    return '<div class="rp-shot">' +
      (s.src ? '<img src="' + esc(s.src) + '" alt="">' : '<div style="height:186px;background:#EFEDE7"></div>') +
      '<div class="cap"><b>' + esc(s.head || "") + "</b>" +
      (s.note ? "<span>" + esc(s.note) + "</span>" : "") + "</div></div>";
  }).join("") + "</div>";
}

// THE READING BEHIND A SECTION. A figure off a half walked round is a
// different figure, and the report says so rather than the reader guessing.
function reading(o) {
  o = o || {};
  var bits = [];
  if (o.day) bits.push("<b>read on</b> " + esc(o.day));
  if (o.walked != null && o.total != null)
    bits.push("<b>" + esc(o.walked) + " of " + esc(o.total) + "</b> pins");
  if (o.confidence) bits.push("<b>" + esc(o.confidence) + "</b> confidence");
  if (o.from) bits.push("from " + esc(o.from));
  if (o.note) bits.push(esc(o.note));
  return bits.length ? '<div class="rp-read">' + bits.join("<span>·</span>") + "</div>" : "";
}

// WHAT THIS REPORT COULD NOT SAY. A component, never an omission.
function couldNotSay(list, head) {
  if (!list || !list.length) return "";
  return '<div class="rp-gap"><h4>' + esc(head || "What this report could not say") + "</h4><ul>" +
    list.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
}

function sectionHead(t, note) {
  return (t ? '<div class="rp-sh">' + esc(t) + "</div>" : "") +
    (note ? '<div class="rp-note">' + esc(note) + "</div>" : "");
}


// ---- the brand ------------------------------------------------------
// NO LOGO FILE EXISTS ON THIS PROJECT, so the name is set as a wordmark
// rather than guessed at. Set BRAND.logo to a data URI and every page picks
// up the artwork instead; nothing else changes.
var BRAND = { name: "FLIPSPACES", line: "DESIGN · SUPPLY · BUILD", logo: null };

// A HEADLINE MAY CARRY ONE GOLD PHRASE. Wrap it in *asterisks* in the text
// and it is set in the accent — one emphasis per headline, never two.
function headline(t) {
  return esc(String(t == null ? "" : t)).replace(/\*([^*]+)\*/, "<em>$1</em>");
}

// ---- a content page -------------------------------------------------
// o.no + o.eyebrow give the numbered section marker and its gold rule.

// ---- the cover ------------------------------------------------------
// Dark navy, a faint grid, a gold kicker, a two weight headline and a gold
// rule. o.hero swaps the grid for a photograph under the same scrim.
function cover(o) {
  o = o || {};
  var figs = (o.figures || []).map(function (f) {
    return '<div class="rp-pill">' + esc(f.cap) + " " +
      "<b style=\"color:#fff\">" + val(f.big, f.unit) + "</b></div>"; }).join("");
  return '<div class="rpage rp-cover">' +
    (o.hero ? '<div class="rp-hero"><img src="' + esc(o.hero) + '" alt="">' +
              '<div class="scrim"></div></div>'
            : '<div class="rp-grid"></div><div class="rp-glow"></div>') +
    '<div class="rp-covtop"><span>' + esc(BRAND.name) + "</span>" +
      '<span class="r">' + esc(o.tag || BRAND.line) + "</span></div>" +
    '<div class="rp-in">' +
      (o.kick ? '<div class="rp-kick">' + esc(o.kick) + "</div>" : "") +
      "<h1>" + esc(o.title || "") +
        (o.title2 ? '<span class="thin">' + esc(o.title2) + "</span>" : "") + "</h1>" +
      '<div class="rp-covrule"></div>' +
      (o.intro ? "<p>" + esc(o.intro) + "</p>" : "") +
      (figs ? '<div class="rp-pills">' + figs + "</div>" : "") +
    "</div>" +
    '<div class="rp-foot"><span>' + esc(o.footL || "") + "</span>" +
    '<span class="gold">' + esc(o.footR || "") + "</span></div></div>";
}

// ---- stat cards -----------------------------------------------------
function stats(cards) {
  var list = (cards || []).filter(Boolean);
  // ONE SOURCE, ONE MENTION — the same file named at two granularities is
  // one source, and printing both gives "hse.json · 10 Aug · hse.json".
  var srcs = [];
  list.forEach(function (c) {
    if (!c.from) return;
    var i = -1;
    srcs.forEach(function (x, k) {
      if (x === c.from || x.indexOf(c.from) === 0 || c.from.indexOf(x) === 0) i = k; });
    if (i < 0) srcs.push(c.from);
    else if (c.from.length > srcs[i].length) srcs[i] = c.from;
  });
  var band = '<div class="rp-stats">' + list.map(function (c) {
    var t = c.tone && c.tone !== "neutral" ? c.tone : null;
    var isWord = c.big != null && isNaN(Number(String(c.big).replace(/[+,%]/g, "")));
    return '<div class="rp-stat">' +
      "<b" + (isWord ? ' class="word"' : "") +
      (t ? ' style="color:var(--' + (t === "rose" ? "bad" : t === "sage" ? "ok" :
        t === "sand" ? "warn" : "n") + ')"' : "") + ">" +
      esc(String(c.big == null ? "" : c.big)) +
      (c.unit ? '<span class="u">' + esc(c.unit) + "</span>" : "") + "</b>" +
      '<span class="cap">' + esc(c.cap) + "</span></div>";
  }).join("") + "</div>";
  return band + (srcs.length ? '<div class="rp-srcline">read from ' +
    esc(srcs.join(" · ")) + "</div>" : "");
}

// ---- the spec list: label left, value right --------------------------
// The right hand column of the reference deck. Rows of fact against value,
// separated by hairlines, value in bold navy.
function specs(list) {
  return '<div class="rp-specs">' + (list || []).filter(Boolean).map(function (r) {
    var t = r.tone === "bad" ? " bad" : r.tone === "ok" ? " ok"
          : (r.tone === "warn" || r.tone === "sand") ? " warn" : "";
    return '<div class="rp-spec"><div class="k">' + esc(r.k) +
      (r.note ? "<i>" + esc(r.note) + "</i>" : "") + "</div>" +
      '<div class="v' + t + '">' + val(r.v, r.unit) +
      (r.chip ? " " + chip(r.chip, r.chipTone) : "") + "</div></div>";
  }).join("") + "</div>";
}

// two columns, the reference deck's most used layout
function twoCol(left, right, wideLeft) {
  return '<div class="rp-two' + (wideLeft ? " wide-l" : "") + '"><div>' + (left || "") +
    "</div><div>" + (right || "") + "</div></div>";
}
function panel(inner) { return '<div class="rp-panel">' + (inner || "") + "</div>"; }




// ---- the floor, as the survey placed it -----------------------------
// EIGHTY ONE CAMERA POSITIONS ON A PLATE, coloured by what each one shows.
// This is NOT a floor plan and must never look like one: there is no wall
// data anywhere on this project, so nothing is drawn that would imply a
// room boundary. What it is, honestly, is where the survey put each camera
// and what that camera saw — which is the most a reader can be told.
//
// A pin's size is the floor it answers for. Pin 12 stands in a 23 sqft
// phone booth and pin 1 in 3,187 sqft of open plan; drawing them the same
// size says they carry the same weight, and they do not.
function plan(pins, o) {
  o = o || {};
  var list = (pins || []).filter(function (p) { return p && p.x != null && p.y != null; });
  if (!list.length) return "";
  var W = 1096, aspect = o.aspect || 4.6, H = Math.round(W / aspect);
  var PAD = 18;

  // ---- BANDED AGAINST THIS WALK, NOT AGAINST A FINISHED BUILDING -------
  // Fixed bands at 45 and 70 put all eighty one pins in one bucket on a floor
  // that reads 3 to 24 per cent, and a plate of one colour says nothing at
  // all. The cut points are the quartiles of what was actually read, and the
  // legend prints them — so the top band means FURTHEST ON, never finished.
  var got = list.map(function (p) { return p.pct; })
    .filter(function (v) { return v != null; }).sort(function (a, b) { return a - b; });
  var q = function (f) { return got.length ? got[Math.floor(f * (got.length - 1))] : 0; };
  var c1 = q(0.25), c2 = q(0.5), c3 = q(0.75);
  var col = function (p) { return p.pct == null ? "var(--muted)"
    : p.pct >= c3 ? "var(--ok)" : p.pct >= c2 ? "var(--n3)"
    : p.pct >= c1 ? "var(--warn)" : "var(--bad)"; };

  var sq = list.map(function (p) { return Math.sqrt(Math.max(1, p.sqft || 1)); });
  var loSq = Math.min.apply(null, sq), hiSq = Math.max.apply(null, sq);
  var rOf = function (p) { var v = Math.sqrt(Math.max(1, p.sqft || 1));
    return 4 + (hiSq > loSq ? (v - loSq) / (hiSq - loSq) : 0) * 10; };
  var X = function (p) { return PAD + p.x * (W - PAD * 2); };
  var Y = function (p) { return PAD + p.y * (H - PAD * 2); };

  // the biggest spaces get a name, and a name is dropped rather than printed
  // on top of another one — an unreadable label is worse than none
  var placed = [], labels = [];
  list.slice().sort(function (a, b) { return (b.sqft || 0) - (a.sqft || 0); })
    .forEach(function (p) {
      var n = p.space || p.area;
      // AN UNNAMED SPACE HAS NO NAME TO PRINT. "Unnamed Space 24" on a plate
      // is the engine's placeholder leaking onto a client page.
      if (!n || /^unnamed/i.test(n) || labels.length >= (o.labels || 8)) return;
      if (labels.some(function (l) { return l.n === n; })) return;
      var x = X(p), y = Y(p) - rOf(p) - 9;
      if (placed.some(function (q2) { return Math.abs(q2.x - x) < 130 && Math.abs(q2.y - y) < 16; }))
        return;
      placed.push({ x: x, y: y });
      labels.push({ n: n, x: x, y: y });
    });

  var dots = list.map(function (p) {
    var r = rOf(p), x = X(p), y = Y(p), c = col(p);
    var aim = (p.aim && (p.aim.dx || p.aim.dy))
      ? '<line x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' +
        (x + p.aim.dx * 42).toFixed(1) + '" y2="' + (y + p.aim.dy * 42).toFixed(1) +
        '" stroke="' + c + '" stroke-width="1.1" opacity=".38"/>' : "";
    return aim +
      '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (r + 3.5).toFixed(1) +
        '" fill="' + c + '" opacity=".15"/>' +
      '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) +
        '" fill="' + c + '"/>' +
      (r > 8 ? '<text x="' + x.toFixed(1) + '" y="' + (y + 3).toFixed(1) +
        '" text-anchor="middle" font-size="8" fill="#fff" font-weight="700">' + p.no + "</text>" : "");
  }).join("");

  // a label reads over the dots because it is painted with a halo
  var names = labels.map(function (l) {
    return '<text x="' + l.x.toFixed(1) + '" y="' + l.y.toFixed(1) +
      '" text-anchor="middle" font-size="10" fill="var(--n)" font-weight="600"' +
      ' stroke="#fff" stroke-width="3" paint-order="stroke" opacity=".9">' +
      esc(String(l.n).slice(0, 28)) + "</text>"; }).join("");

  var key = '<div class="rp-plankey">' +
    '<span><i style="background:var(--ok)"></i>furthest on · ' + c3 + "% and above</span>" +
    '<span><i style="background:var(--n3)"></i>' + c2 + " to " + c3 + "%</span>" +
    '<span><i style="background:var(--warn)"></i>' + c1 + " to " + c2 + "%</span>" +
    '<span><i style="background:var(--bad)"></i>furthest behind · under ' + c1 + "%</span>" +
    "</div>";

  // THE PLATE IS SHORT — this floor is four and a half times as wide as it is
  // deep, so it uses a third of the page. The rest goes to the spaces the
  // plate cannot label: the largest rooms, what each reads, and how much floor
  // each answers for.
  var rank = "";
  if ((o.spaces || []).length) {
    var top = o.spaces.slice().sort(function (a, b) { return (b.sqft || 0) - (a.sqft || 0); })
      .slice(0, 6);
    var hi = Math.max.apply(null, top.map(function (x) { return x.pct || 0; })) || 1;
    rank = '<div class="rp-planrank">' + top.map(function (x) {
      var c = x.pct == null ? "var(--muted)" : x.pct >= c3 ? "var(--ok)"
        : x.pct >= c2 ? "var(--n3)" : x.pct >= c1 ? "var(--warn)" : "var(--bad)";
      return '<div class="rk"><div class="nm">' + esc(String(x.name).slice(0, 30)) +
        '<i>' + (x.sqft ? Math.round(x.sqft).toLocaleString("en-IN") + " sqft · " : "") +
        (x.pins ? x.pins + " position" + (x.pins === 1 ? "" : "s") : "") + "</i></div>" +
        '<div class="tr"><i style="width:' + Math.round((x.pct || 0) / hi * 100) +
        '%;background:' + c + '"></i></div>' +
        '<div class="pc" style="color:' + c + '">' + (x.pct == null ? "—" : x.pct + "%") +
        "</div></div>"; }).join("") + "</div>";
  }

  return '<div class="rp-plan"><svg viewBox="0 0 ' + W + " " + H + '" role="img">' +
    '<rect x="1" y="1" width="' + (W - 2) + '" height="' + (H - 2) +
      '" fill="#fff" stroke="var(--rule)" rx="6"/>' + dots + names + "</svg>" + key +
    rank +
    '<div class="rp-plannote">' + esc(o.note ||
      "The coordinates are the survey's own, normalised onto a plate — this places the cameras " +
      "and what each one saw. It is not a floor plan: no wall is drawn because none is recorded. " +
      "A pin is sized by the floor it answers for, and the bands are quarters of this walk's own " +
      "readings, so the top band means furthest on and never finished.") + "</div></div>";
}



// ---- the cash curve -------------------------------------------------
// TWO CURVES AND THE GAP BETWEEN THEM. What the contract said would be
// earned by now, against what the walk says has been. The RA stages sit on
// the same axis as ticks, because a stage that fell due and was never raised
// is the whole point of the chart and belongs where the reader is looking.
function curve(o) {
  o = o || {};
  var pts = (o.points || []).filter(function (p) { return p && p.x != null; });
  if (pts.length < 2) return "";
  var W = 1096, H = 300, L = 74, Rr = 26, Tp = 18, B = 40;
  var vals = [];
  pts.forEach(function (p) { ["a", "b", "lo", "hi"].forEach(function (k) {
    if (p[k] != null) vals.push(Number(p[k]) || 0); }); });
  var hi = Math.max.apply(null, vals) || 1;
  var X = function (i) { return L + i / (pts.length - 1) * (W - L - Rr); };
  var Y = function (v) { return Tp + (1 - (Number(v) || 0) / hi) * (H - Tp - B); };

  // a series is drawn only where it has values, so a forecast starts where
  // the actual stops rather than being invented backwards from nothing
  var seg = function (key) {
    var out = [];
    pts.forEach(function (p, i) { if (p[key] != null) out.push([X(i), Y(p[key])]); });
    return out; };
  var poly = function (key, col, w, dash) {
    var pl = seg(key); if (pl.length < 2) return "";
    return '<polyline fill="none" stroke="' + col + '" stroke-width="' + (w || 2.6) +
      '" stroke-linejoin="round" stroke-linecap="round"' +
      (dash ? ' stroke-dasharray="' + dash + '"' : "") + ' points="' +
      pl.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ") + '"/>'; };

  // ---- THE RANGE BETWEEN TWO FORECASTS --------------------------------
  // A single forecast line claims a precision nobody has. Two do not: the
  // lower is what the rate actually observed would deliver, the upper is what
  // the programme's own remaining shape would, and the truth is somewhere in
  // the band. Both are dashed so neither can be mistaken for a reading.
  var band = "";
  var lo = seg("lo"), hiS = seg("hi");
  if (lo.length > 1 && hiS.length > 1) {
    band = '<polygon fill="var(--warn)" opacity=".10" points="' +
      hiS.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ") + " " +
      lo.slice().reverse().map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); })
        .join(" ") + '"/>';
  }

  var area = (function () { var pl = seg("b"); if (pl.length < 2) return "";
    return '<polygon fill="var(--n3)" opacity=".10" points="' + pl[0][0].toFixed(1) + "," +
      Y(0).toFixed(1) + " " +
      pl.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" ") + " " +
      pl[pl.length - 1][0].toFixed(1) + "," + Y(0).toFixed(1) + '"/>'; })();

  var grid = [0, 0.25, 0.5, 0.75, 1].map(function (f) {
    var y = Y(hi * f);
    return '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - Rr) + '" y2="' +
      y.toFixed(1) + '" stroke="var(--hair)" stroke-width="1"/>' +
      '<text x="' + (L - 10) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end"' +
      ' font-size="10.5" fill="var(--faint)">' + esc(o.fmt ? o.fmt(hi * f) : Math.round(hi * f)) +
      "</text>"; }).join("");
  var every = pts.length > 10 ? Math.ceil(pts.length / 9) : 1;
  var xlab = pts.map(function (p, i) {
    if (i % every && i !== pts.length - 1) return "";
    return '<text x="' + X(i).toFixed(1) + '" y="' + (H - 18) + '" text-anchor="middle"' +
      ' font-size="10.5" fill="var(--muted)">' + esc(p.x) + "</text>"; }).join("");
  var dots = (function () { var pl = seg("b");
    return pl.map(function (q) { return '<circle cx="' + q[0].toFixed(1) + '" cy="' +
      q[1].toFixed(1) + '" r="3.6" fill="var(--n3)"/>'; }).join(""); })();

  var byX = {};
  (o.marks || []).forEach(function (m) {
    var i = pts.findIndex(function (p) { return p.x === m.x; });
    if (i < 0) return;
    if (!byX[i]) byX[i] = { i: i, labels: [], bad: false };
    byX[i].labels.push(m.label);
    if (m.tone === "bad") byX[i].bad = true; });
  var marks = Object.keys(byX).map(function (k) {
    var g = byX[k], m = { label: g.labels.join(" · "), tone: g.bad ? "bad" : null };
    var x = X(g.i), c = m.tone === "bad" ? "var(--bad)" : "var(--gold)";
    return '<line x1="' + x.toFixed(1) + '" y1="' + Tp + '" x2="' + x.toFixed(1) + '" y2="' +
      (H - B + 6) + '" stroke="' + c + '" stroke-width="1.4" stroke-dasharray="4 4" opacity=".85"/>' +
      '<text x="' + (x > W - 120 ? (x - 5).toFixed(1) : (x + 5).toFixed(1)) + '" y="' + (Tp + 12) +
      '" font-size="10.5" text-anchor="' + (x > W - 120 ? "end" : "start") + '"' +
      ' fill="' + c + '" font-weight="700">' + esc(m.label) + "</text>"; }).join("");

  var key = '<div class="rp-chartkey">' +
    '<span><i style="background:var(--rule)"></i>' + esc(o.aLabel || "planned") + "</span>" +
    '<span><i style="background:var(--n3)"></i>' + esc(o.bLabel || "actual") + "</span>" +
    (lo.length > 1 ? '<span><i style="background:var(--warn);opacity:.55"></i>' +
      esc(o.rangeLabel || "where it goes from here — a range, not a prediction") + "</span>" : "") +
    ((o.marks || []).length ? '<span><i class="dot" style="background:var(--gold)"></i>' +
      esc(o.markLabel || "milestone") + "</span>" : "") + "</div>";

  return '<div class="rp-chart"><svg viewBox="0 0 ' + W + " " + H + '" role="img">' +
    grid + band + area + poly("a", "var(--rule)", 2.4) +
    poly("hi", "var(--warn)", 2, "6 5") + poly("lo", "var(--warn)", 2, "6 5") +
    poly("b", "var(--n3)") + dots + marks + xlab + "</svg>" + key +
    (o.note ? '<div class="rp-chartnote">' + esc(o.note) + "</div>" : "") + "</div>";
}

// ---- the programme, as a timeline -----------------------------------
// A BAR IS A WINDOW, AND THE FILL IS WHAT THE CAMERA SAW IN IT. The pale bar
// runs from a package's earliest start to its earliest finish; the solid part
// is how much of it is built. Today, the contract date and the date the
// programme actually lands are drawn as lines, because a bar chart without
// today on it is a picture of a plan rather than of a project.
function timeline(rows, o) {
  o = o || {};
  var list = (rows || []).filter(function (r) { return r && r.from && r.to; });
  if (!list.length) return "";
  var W = 1096, RH = 26, L = 232, Rr = 20, Tp = 26;
  var H = Tp + list.length * RH + 34;
  var t0 = Math.min.apply(null, list.map(function (r) { return Date.parse(r.from); }));
  var t1 = Math.max.apply(null, list.map(function (r) { return Date.parse(r.to); }));
  (o.marks || []).forEach(function (m) { var t = Date.parse(m.on);
    if (t < t0) t0 = t; if (t > t1) t1 = t; });
  var span = (t1 - t0) || 1;
  var X = function (d) { return L + (Date.parse(d) - t0) / span * (W - L - Rr); };

  var bars = list.map(function (r, i) {
    var y = Tp + i * RH, x0 = X(r.from), x1 = X(r.to), w = Math.max(3, x1 - x0);
    var pct = Math.max(0, Math.min(100, Number(r.pct) || 0));
    var c = r.tone === "bad" ? "var(--bad)" : r.tone === "warn" ? "var(--warn)"
          : r.tone === "ok" ? "var(--ok)" : "var(--n3)";
    return '<text x="0" y="' + (y + 13) + '" font-size="11.4" fill="var(--n)"' +
      ' font-weight="600">' + esc(String(r.name).slice(0, 32)) + "</text>" +
      '<rect x="' + x0.toFixed(1) + '" y="' + (y + 4) + '" width="' + w.toFixed(1) +
      '" height="13" rx="3" fill="var(--rule)" opacity=".55"/>' +
      '<rect x="' + x0.toFixed(1) + '" y="' + (y + 4) + '" width="' +
      (w * pct / 100).toFixed(1) + '" height="13" rx="3" fill="' + c + '"/>' +
      '<text x="' + (x1 + 7).toFixed(1) + '" y="' + (y + 14) + '" font-size="10.6"' +
      ' fill="' + c + '" font-weight="700">' + pct + "%</text>";
  }).join("");

  var marks = (o.marks || []).map(function (m) {
    var x = X(m.on), c = m.tone === "bad" ? "var(--bad)" : m.tone === "gold" ? "var(--gold)"
      : "var(--n)";
    return '<line x1="' + x.toFixed(1) + '" y1="' + (Tp - 8) + '" x2="' + x.toFixed(1) +
      '" y2="' + (Tp + list.length * RH + 2) + '" stroke="' + c + '" stroke-width="1.5"' +
      ' stroke-dasharray="5 4"/>' +
      // FLIPPED INWARD NEAR THE EDGE. "lands" printed as "lan" because the
      // label ran past the right of the viewBox and was simply cut off.
      '<text x="' + (x > W - 90 ? (x - 5).toFixed(1) : (x + 5).toFixed(1)) + '" y="' + (Tp - 12) +
      '" font-size="10.6" text-anchor="' + (x > W - 90 ? "end" : "start") + '" fill="' + c +
      '" font-weight="700">' + esc(m.label) + "</text>"; }).join("");

  var key = '<div class="rp-chartkey">' +
    '<span><i style="background:var(--rule)"></i>the window the programme gives it</span>' +
    '<span><i style="background:var(--n3)"></i>what the walk can see built</span></div>';
  return '<div class="rp-chart"><svg viewBox="0 0 ' + W + " " + H + '" role="img">' +
    marks + bars + "</svg>" + key +
    (o.note ? '<div class="rp-chartnote">' + esc(o.note) + "</div>" : "") + "</div>";
}

root.RP_DESIGN = {
  CSS: CSS, esc: esc, toneOf: toneOf, val: val, fmtDay: fmtDay, dates: dates,
  BRAND: BRAND, headline: headline,
  page: page, cover: cover, stats: stats, specs: specs, twoCol: twoCol, panel: panel,
  plan: plan, curve: curve, timeline: timeline,
  pills: pills, chip: chip, cards: cards, rows: rows, duals: duals, table: table,
  shots: shots, reading: reading, couldNotSay: couldNotSay, sectionHead: sectionHead
};
if (typeof module !== "undefined" && module.exports) module.exports = root.RP_DESIGN;

})(typeof window !== "undefined" ? window : globalThis);
