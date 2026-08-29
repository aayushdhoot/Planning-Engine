// ===================================================================
// DnB-OS . platform/track/reportkit.js . REPORT DESIGN, BATCH 2 PARTS
// The Batch 1 design module (reportcss.js) owns the shared look. This kit
// adds only the pieces the four daily and site reports need on top of it,
// without touching that file: an A4 record page for the formal DPR, a
// three across photo grid, horizontal manpower bars, HSE flag rows, a
// segmented week/month toggle, and the screen only lightbox and expand
// styles. Print strips every interactive part and leaves clean pages.
//
// Pure. CSS is a string injected once beside the Batch 1 stylesheet, and
// every builder takes data and returns markup, so the guards drive it
// offline. It leans on TRACK_REPORTCSS for esc and the base page builder.
// ===================================================================

;(function (root) {

function RC() { return root.TRACK_REPORTCSS; }
function esc(s) { return RC() ? RC().esc(s) : String(s == null ? "" : s); }

var CSS = [
// ---- A4 record page for the formal DPR ------------------------------
".rpage.a4{width:794px;height:1123px;}",
".rstage.scaled .rpage.a4{margin-bottom:calc((var(--rp-scale,1) - 1) * 1123px);}",
".rpage.a4 .rp-in{left:56px;right:56px;top:48px;bottom:56px;}",
".rpage.a4 .rp-h1{font-size:30px;margin-bottom:18px;}",
".rpage.a4 .rp-kick{margin-bottom:16px;}",
".rpage.a4 .rp-foot{left:56px;right:56px;bottom:26px;}",
// a record table, tighter than the deck table
".dpr-sec{margin:0 0 16px;}",
".dpr-sec h3{font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;color:var(--rp-ink);margin:0 0 8px;letter-spacing:.2px;}",
".dpr-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 26px;}",
".dpr-line{display:flex;gap:10px;font-size:12.5px;line-height:1.5;color:var(--rp-ink2);align-items:baseline;}",
".dpr-line .k{color:var(--rp-muted);min-width:96px;flex:none;}",
".dpr-line .v{color:var(--rp-ink);}",
".dpr-tab{width:100%;border-collapse:collapse;font-size:12.5px;}",
".dpr-tab th{font-family:'Poppins',sans-serif;font-weight:700;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--rp-muted);text-align:left;padding:0 10px 7px;border-bottom:1px solid var(--rp-line);}",
".dpr-tab td{padding:7px 10px;border-bottom:1px solid #F4F1EA;color:var(--rp-ink2);vertical-align:top;}",
".dpr-tab td b{color:var(--rp-ink);}",
".dpr-tab td.num,.dpr-tab th.num{text-align:right;white-space:nowrap;}",
// ---- three across photo grid ----------------------------------------
".rp-photos.c3{grid-template-columns:repeat(3,1fr);}",
".rp-photos.c3 .rp-shot{height:230px;}",
// ---- horizontal manpower bars ---------------------------------------
".mp-wrap{display:flex;flex-direction:column;gap:9px;}",
".mp-row{display:grid;grid-template-columns:118px 1fr 92px;gap:14px;align-items:center;}",
".mp-lab{font-size:13px;color:var(--rp-ink2);font-family:'Poppins',sans-serif;font-weight:600;}",
".mp-lab small{display:block;font-weight:400;color:var(--rp-faint);font-size:11px;letter-spacing:.2px;}",
".mp-track{height:18px;border-radius:9px;background:var(--rp-plantrack);position:relative;overflow:hidden;cursor:default;}",
".mp-fill{position:absolute;left:0;top:0;bottom:0;border-radius:9px;background:var(--rp-sky);}",
".mp-fill.night{background:var(--rp-lilac);opacity:.9;}",
".mp-val{font-size:13px;color:var(--rp-ink);text-align:right;white-space:nowrap;}",
".mp-val b{font-family:'Poppins',sans-serif;font-weight:700;}",
".mp-val small{color:var(--rp-faint);font-weight:400;}",
".mp-legend{display:flex;gap:20px;align-items:center;margin:2px 0 14px;font-size:12.5px;color:var(--rp-muted);}",
".mp-legend i{display:inline-block;width:24px;height:10px;border-radius:5px;vertical-align:middle;margin-right:7px;}",
".mp-legend i.day{background:var(--rp-sky);} .mp-legend i.night{background:var(--rp-lilac);}",
// ---- HSE flag rows ---------------------------------------------------
".hse-day{margin:0 0 14px;}",
".hse-dayh{font-family:'Poppins',sans-serif;font-weight:700;font-size:13px;color:var(--rp-ink);margin:0 0 10px;display:flex;align-items:center;gap:10px;}",
".hse-dayh .c{font-size:11px;color:var(--rp-faint);font-weight:400;letter-spacing:.4px;}",
".hse-flags{display:flex;flex-direction:column;gap:8px;}",
".hse-flag{display:grid;grid-template-columns:74px 116px 1fr;gap:14px;align-items:start;background:var(--rp-card);border:1px solid var(--rp-line);border-radius:11px;padding:11px 15px;}",
".hse-flag .cat{font-size:12px;color:var(--rp-ink2);font-family:'Poppins',sans-serif;font-weight:600;line-height:1.5;}",
".hse-flag .txt{font-size:13px;color:var(--rp-ink2);line-height:1.5;}",
".hse-flag .txt .pins{color:var(--rp-faint);font-size:11.5px;}",
".sev{font-family:'Poppins',sans-serif;font-weight:700;font-size:10.5px;padding:4px 10px;border-radius:999px;white-space:nowrap;text-transform:uppercase;letter-spacing:.4px;}",
".sev.high{background:var(--rp-rose-bg);color:var(--rp-rose);} .sev.med{background:var(--rp-sand-bg);color:var(--rp-sand);} .sev.low{background:var(--rp-neutral-bg);color:var(--rp-neutral);}",
".rep-badge{font-family:'Poppins',sans-serif;font-weight:700;font-size:10px;padding:3px 9px;border-radius:999px;background:var(--rp-lilac-bg);color:var(--rp-lilac);margin-left:8px;letter-spacing:.3px;}",
// ---- segmented toggle (screen only) ---------------------------------
".rp-seg{display:inline-flex;gap:3px;background:#EDEAE3;border-radius:10px;padding:4px;}",
".rp-seg button{font-family:'Poppins',sans-serif;font-weight:700;font-size:12px;padding:7px 15px;border:none;border-radius:7px;background:transparent;color:var(--rp-muted);cursor:pointer;}",
".rp-seg button.on{background:#fff;color:var(--rp-ink);box-shadow:0 1px 3px rgba(60,55,45,.12);}",
".rp-pick{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--rp-muted);}",
".rp-pick input{font-family:'Lato',sans-serif;font-size:12.5px;padding:6px 9px;border:1px solid var(--rp-line);border-radius:8px;color:var(--rp-ink);background:#fff;}",
// ---- expandable dot evidence (screen only) --------------------------
".rp-dot.exp>div{cursor:pointer;}",
".rp-dot .caret{color:var(--rp-faint);font-size:12px;margin-left:6px;}",
".rp-eviden{display:none;margin:8px 0 2px 0;padding:12px 14px;background:#FAF8F3;border:1px solid var(--rp-line);border-radius:10px;}",
".rp-eviden.open{display:block;}",
".rp-eviden .ev{font-size:12.5px;color:var(--rp-ink2);line-height:1.5;padding:3px 0;}",
".rp-eviden .ev b{color:var(--rp-ink);font-weight:700;}",
// ---- lightbox (screen only) -----------------------------------------
".rlb{position:fixed;inset:0;background:rgba(38,34,28,.88);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:44px;}",
".rlb img{max-width:90vw;max-height:80vh;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5);}",
".rlb .cap{color:#F3EEE6;font-family:'Lato',sans-serif;font-size:15px;margin-top:18px;max-width:760px;text-align:center;line-height:1.5;}",
".rlb .x{position:absolute;top:22px;right:30px;color:#F3EEE6;font-size:30px;cursor:pointer;line-height:1;background:none;border:none;}",
".rp-shot.clik{cursor:zoom-in;}",
// ---- digest page 1: tightened so stat cards, floor lines and the two
//      side cards all fit one 720 page like the reference PDF -----------
".dg1 .rp-stat{min-height:80px;padding:16px 22px 14px;}",
".dg1 .rp-stat b{font-size:33px;margin-bottom:5px;line-height:1.06;}",
".dg1 .rp-stat span{font-size:13.5px;}",
".dg-cols{display:grid;grid-template-columns:1.08fr .92fr;gap:24px;margin-top:10px;align-items:start;}",
// manpower page: slightly shorter stat cards so the bars and note fit ---
".mp1 .rp-stat{min-height:100px;padding:20px 24px;}",
".mp1 .rp-stat b{font-size:36px;}",
".mp1 .rp-note{margin-top:14px;font-size:12.5px;}",
".dg-cols .dg-h{font-family:'Poppins',sans-serif;font-weight:700;font-size:18px;color:var(--rp-ink);margin:2px 0 12px;}",
".dg-cols .rp-dots{gap:10px;}",
".dg-cols .rp-dot{font-size:14px;line-height:1.45;}",
".dg-cols .rp-dot .d{margin-top:7px;}",
".dg-cols .rp-card{padding:18px 20px;}",
".dg-cols .rp-card h3{font-size:17px;margin-bottom:8px;}",
".dg-cols .rp-card p{font-size:13px;line-height:1.5;margin:0 0 8px;}",
".dg-cols .rp-card p:last-child{margin-bottom:0;}",
// digest page 2: six frames, three across, sized to two clean rows -----
".rp-photos.c3 .rp-shot{height:180px;}",
".rp-photos.c3 .rp-cap{padding:9px 14px;font-size:12px;line-height:1.4;}",
// DPR A4 record: tighter sections and lists so the record fits one page -
".dpr-body .dpr-sec{margin:0 0 8px;}",
".dpr-body .dpr-sec h3{margin:0 0 6px;}",
".dpr-body .dpr-tab td{padding:5px 10px;}",
".dpr-body .rp-dots{gap:5px;}",
".dpr-body .rp-dot{font-size:12.5px;line-height:1.4;}",
".dpr-body .rp-dot .d{margin-top:6px;}",
".dpr-body .rp-note{margin-top:10px;font-size:12px;}",
// HSE: flags in three columns so a full week of flags fits one page ----
".hse-3col{columns:3;column-gap:15px;margin-top:4px;}",
".hse-3col .hse-flag{break-inside:avoid;margin:0 0 9px;display:block;padding:10px 13px;}",
".hse-3col .hse-flag .sev{display:inline-block;margin-right:7px;font-size:9.5px;padding:3px 8px;vertical-align:middle;}",
".hse-3col .hse-flag .cat{display:inline;font-size:11px;}",
".hse-3col .hse-flag .txt{display:block;margin-top:5px;font-size:11.5px;line-height:1.4;}",
".hse-3col .hse-flag .txt .pins{font-size:10.5px;}",
// ---- print: strip every interactive part ----------------------------
"@media print{",
"  @page rpa4{ size:A4 portrait; margin:0; }",
"  .rpage.a4{page:rpa4;width:210mm;height:297mm;box-shadow:none;border-radius:0;}",
"  .rp-seg,.rp-pick,.rlb,.rp-dot .caret{display:none !important;}",
"  .rp-eviden{display:none !important;}",
"  .rp-shot.clik{cursor:default;}",
"}"
].join("\n");

// ---- builders -------------------------------------------------------
// an A4 record page: the base page with the a4 class added.
function pageA4(o) {
  var html = RC().page(o || {});
  return html.replace('class="rpage"', 'class="rpage a4"');
}

// three across photo frames (six per digest page 2)
function photos3(frames) {
  return RC().photoFrames(frames || []).replace('class="rp-photos"', 'class="rp-photos c3"');
}

// horizontal manpower bars. rows: [{label, sub, value, night, max, req, note}].
// value is the day count, night the optional night count stacked visually
// as a second faint bar. req is the required number if ever sourced, else
// null and a not captured chip stands in its place. note fills the hover.
function manpowerBars(rows, opts) {
  opts = opts || {};
  // day and night are separate shifts, so the bar stacks them: the day
  // count then the night count appended, the full bar is the day's labour.
  var max = opts.max || Math.max.apply(null, (rows || []).map(function (r) { return (r.value || 0) + (r.night || 0); }).concat([1]));
  var legend = '<div class="mp-legend"><span><i class="day"></i>day shift</span>' +
    '<span><i class="night"></i>night shift</span>' +
    '<span>required headcount ' + (RC().notCaptured("not captured")) + '</span></div>';
  var body = (rows || []).map(function (r) {
    var vw = Math.round(((r.value || 0) / max) * 100);
    var nw = r.night ? Math.round((r.night / max) * 100) : 0;
    var fill = '<div class="mp-fill" style="left:0;width:' + vw + '%"></div>' +
      (r.night ? '<div class="mp-fill night" style="left:' + vw + '%;width:' + nw + '%"></div>' : "");
    var val = '<span class="mp-val"><b>' + esc(r.value != null ? r.value : "·") + '</b>' +
      (r.night ? ' <small>+' + esc(r.night) + ' n</small>' : "") + '</span>';
    return '<div class="mp-row"><div class="mp-lab">' + esc(r.label) +
      (r.sub ? '<small>' + esc(r.sub) + '</small>' : "") + '</div>' +
      '<div class="mp-track" title="' + esc(r.note || "") + '">' + fill + '</div>' + val + '</div>';
  }).join("");
  return legend + '<div class="mp-wrap">' + body + "</div>";
}

// HSE flags grouped by day. days: [{day, niceDay, flags:[{cat,sev,text,pins,repeat}]}]
function hseDays(days) {
  return (days || []).map(function (d) {
    var rows = (d.flags || []).map(function (f) {
      var pins = (f.pins && f.pins.length) ? ' <span class="pins">at ' + f.pins.map(function (p) { return "P" + p; }).join(", ") + "</span>" : "";
      var rep = f.repeat ? '<span class="rep-badge">repeat</span>' : "";
      return '<div class="hse-flag"><span class="sev ' + esc(f.sev) + '">' + esc(f.sev) + '</span>' +
        '<span class="cat">' + esc(f.cat) + rep + '</span>' +
        '<span class="txt">' + esc(f.text) + pins + '</span></div>';
    }).join("");
    return '<div class="hse-day"><div class="hse-dayh">' + esc(d.niceDay || d.day) +
      ' <span class="c">' + (d.flags ? d.flags.length : 0) + ' flags</span></div>' +
      '<div class="hse-flags">' + rows + "</div></div>";
  }).join("");
}

// a segmented toggle, screen only. id names it for the click handler.
function seg(id, options, current) {
  return '<div class="rp-seg noprint" data-seg="' + esc(id) + '">' + (options || []).map(function (o) {
    return '<button data-segval="' + esc(o.val) + '" class="' + (o.val === current ? "on" : "") + '">' + esc(o.label) + "</button>";
  }).join("") + "</div>";
}

root.TRACK_REPORTKIT = {
  CSS: CSS, esc: esc,
  pageA4: pageA4, photos3: photos3, manpowerBars: manpowerBars, hseDays: hseDays, seg: seg
};
if (typeof module !== "undefined") module.exports = root.TRACK_REPORTKIT;

})(typeof window !== "undefined" ? window : globalThis);
