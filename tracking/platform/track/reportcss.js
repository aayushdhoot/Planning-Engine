// ===================================================================
// DnB-OS . platform/track/reportcss.js . THE REPORT DESIGN LANGUAGE
// One place that defines the whole visual language for every report the
// engine publishes, so a new report inherits the same calm, finished
// look automatically. It is the design system the four reference PDFs
// carry (Client Weekly, Management One Pager, Daily Site Digest,
// Procurement Weekly): cream paper, white cards, pastel pairs, Poppins
// headings, Lato body, typography over colour, low noise.
//
// Two things live here and nowhere else:
//   . CSS: the full stylesheet, injected once into the page.
//   . builders: pure string helpers that stamp out the components every
//     report is made of (page, stat cards, chips, dual bars, dot rows,
//     verdict card, photo frames, footer). A report never writes raw
//     markup for these, it calls a builder, so the look cannot drift.
//
// Pure. No DOM, no fetch, no ledger. Every builder takes data and returns
// a string, so the guards can drive it offline and the template can drop
// the strings straight into a view.
//
// The page is 1280 x 720, the 16:9 the reference PDFs print at (960 x 540
// pt is the same shape). One report page prints as one PDF page.
// ===================================================================

;(function (root) {

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// the five pastel pairs, bg then deep, named so a tone is never a raw hex
var TONES = ["sage", "sky", "sand", "lilac", "rose"];

// chip words map to a tone. done, ahead, near and on read calm green,
// behind and risk read rose, everything soft and unknown reads neutral.
var CHIP_TONE = {
  done: "sage", ahead: "sage", near: "sage", "near plan": "sage", on: "sage", "on plan": "sage",
  "on track": "sage", ok: "sage",
  behind: "rose", risk: "rose", "at risk": "rose", late: "rose", "act now": "rose",
  expedite: "sand", "at a gate": "sand", watch: "sky", warn: "sand",
  not_due: "neutral", "not due": "neutral", no_reading: "neutral", "no reading": "neutral",
  bad: "rose"
};
function chipTone(chip) { return CHIP_TONE[String(chip || "").toLowerCase()] || "neutral"; }

// ---- the stylesheet -------------------------------------------------
var CSS = [
"@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Lato:wght@400;700&display=swap');",
":root{",
"  --rp-paper:#FBF9F5; --rp-ink:#33323B; --rp-ink2:#4A4954; --rp-muted:#8A8794; --rp-faint:#B0ADA4;",
"  --rp-line:#EEE9E1; --rp-card:#FFFFFF;",
"  --rp-plan:#E2DBCF; --rp-plantrack:#F0EBE2;",
"  --rp-sage-bg:#E1EAE0; --rp-sage:#5F7F68;",
"  --rp-sky-bg:#DEE8F1; --rp-sky:#5D7E9E;",
"  --rp-sand-bg:#F4ECDA; --rp-sand:#9C8850;",
"  --rp-lilac-bg:#E8E3F2; --rp-lilac:#7D719F;",
"  --rp-rose-bg:#F2DCD7; --rp-rose:#A85F52;",
"  --rp-neutral-bg:#EFEDE7; --rp-neutral:#7C7970;",
"}",
// the stage the pages sit on, on screen. Print strips it.
".rstage{background:#ECEEF1;padding:26px;display:flex;flex-direction:column;align-items:center;gap:26px;min-height:100%;overflow-x:clip;}",
".rstage.scaled .rpage{transform:scale(var(--rp-scale,1));transform-origin:top center;margin-bottom:calc((var(--rp-scale,1) - 1) * 720px);}",
".rtoolbar{width:1280px;max-width:100%;display:flex;align-items:center;gap:12px;flex-wrap:wrap;}",
// the page itself
".rpage{width:1280px;height:720px;background:var(--rp-paper);color:var(--rp-ink);",
"  position:relative;overflow:hidden;box-shadow:0 8px 30px rgba(60,55,45,.10);border-radius:4px;",
"  font-family:'Lato','Helvetica Neue',Arial,sans-serif;flex:none;}",
".rp-in{position:absolute;left:72px;right:72px;top:56px;bottom:72px;}",
".rp-h{font-family:'Poppins',sans-serif;}",
".rp-kick{font-family:'Poppins',sans-serif;font-weight:700;font-size:13px;letter-spacing:2.4px;",
"  text-transform:uppercase;color:var(--rp-sky);margin:0 0 20px;}",
".rp-h1{font-family:'Poppins',sans-serif;font-weight:700;font-size:38px;line-height:1.1;color:var(--rp-ink);margin:0 0 26px;letter-spacing:-.3px;}",
".rp-sub{font-size:19px;color:var(--rp-muted);margin:-14px 0 24px;line-height:1.4;}",
// cover
".rp-cover .rp-in{top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;}",
".rp-cover .rp-title{font-family:'Poppins',sans-serif;font-weight:800;font-size:62px;line-height:1.05;color:var(--rp-ink);margin:14px 0 18px;letter-spacing:-1px;}",
".rp-cover .rp-sub{font-size:22px;margin:0 0 30px;}",
".rp-intro{font-size:15px;color:var(--rp-muted);line-height:1.7;max-width:820px;margin-top:30px;}",
// header pill row
".rp-pills{display:flex;gap:14px;flex-wrap:wrap;margin:6px 0 4px;}",
".rp-pill{font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;padding:11px 20px;border-radius:999px;}",
".rp-pill.sage{background:var(--rp-sage-bg);color:var(--rp-sage);}",
".rp-pill.sky{background:var(--rp-sky-bg);color:var(--rp-sky);}",
".rp-pill.sand{background:var(--rp-sand-bg);color:var(--rp-sand);}",
".rp-pill.lilac{background:var(--rp-lilac-bg);color:var(--rp-lilac);}",
".rp-pill.rose{background:var(--rp-rose-bg);color:var(--rp-rose);}",
".rp-pill.neutral{background:var(--rp-neutral-bg);color:var(--rp-neutral);}",
// stat cards
".rp-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin:6px 0 4px;}",
".rp-stat{border-radius:18px;padding:26px 26px 24px;min-height:120px;display:flex;flex-direction:column;justify-content:flex-start;}",
".rp-stat b{font-family:'Poppins',sans-serif;font-weight:700;font-size:40px;line-height:1;color:var(--rp-ink);display:block;margin-bottom:12px;}",
".rp-stat span{font-size:14px;color:var(--rp-ink2);line-height:1.45;}",
".rp-stat.sage{background:var(--rp-sage-bg);} .rp-stat.sky{background:var(--rp-sky-bg);}",
".rp-stat.sand{background:var(--rp-sand-bg);} .rp-stat.lilac{background:var(--rp-lilac-bg);}",
".rp-stat.rose{background:var(--rp-rose-bg);} .rp-stat.neutral{background:var(--rp-neutral-bg);}",
// white cards
".rp-cards{display:grid;gap:20px;margin:4px 0;}",
".rp-cards.c2{grid-template-columns:1fr 1fr;} .rp-cards.c1{grid-template-columns:1fr;}",
".rp-card{background:var(--rp-card);border:1px solid var(--rp-line);border-radius:16px;padding:26px 28px;}",
".rp-card.sky{background:var(--rp-sky-bg);border-color:transparent;} .rp-card.sand{background:var(--rp-sand-bg);border-color:transparent;}",
".rp-card.sage{background:var(--rp-sage-bg);border-color:transparent;} .rp-card.rose{background:var(--rp-rose-bg);border-color:transparent;}",
".rp-card.lilac{background:var(--rp-lilac-bg);border-color:transparent;}",
".rp-card h3{font-family:'Poppins',sans-serif;font-weight:700;font-size:19px;color:var(--rp-ink);margin:0 0 10px;}",
".rp-card p{font-size:15px;line-height:1.6;color:var(--rp-ink2);margin:0;}",
".rp-card .foot{font-size:13px;color:var(--rp-muted);margin-top:10px;}",
// dual bars
".rp-legend{display:flex;gap:22px;align-items:center;margin:0 0 18px;font-size:13px;color:var(--rp-muted);}",
".rp-legend i{display:inline-block;width:26px;height:9px;border-radius:5px;vertical-align:middle;margin-right:8px;}",
".rp-legend i.plan{background:var(--rp-plan);} .rp-legend i.site{background:var(--rp-sage);}",
".rp-duals{display:flex;flex-direction:column;gap:14px;}",
".rp-dual{display:grid;grid-template-columns:168px 262px auto auto 1fr;gap:2px 16px;align-items:center;}",
".rp-dual .r-name{font-family:'Poppins',sans-serif;font-weight:600;font-size:14.5px;color:var(--rp-ink);line-height:1.2;}",
".rp-bars{display:flex;flex-direction:column;gap:5px;}",
".rp-lane{height:9px;border-radius:6px;background:var(--rp-plantrack);position:relative;overflow:hidden;}",
".rp-lane.plan span{background:var(--rp-plan);} ",
".rp-lane span{position:absolute;left:0;top:0;bottom:0;border-radius:6px;display:block;}",
".rp-lane.sage span{background:var(--rp-sage);} .rp-lane.sky span{background:var(--rp-sky);}",
".rp-lane.sand span{background:var(--rp-sand);} .rp-lane.rose span{background:var(--rp-rose);}",
".rp-lane.neutral span{background:var(--rp-neutral);}",
".rp-dual .r-val{font-size:13px;color:var(--rp-muted);white-space:nowrap;}",
".rp-dual .r-val b{color:var(--rp-ink);font-weight:700;}",
".rp-dual .r-note{font-size:13px;color:var(--rp-muted);line-height:1.4;}",
// chip
".r-chip{font-family:'Poppins',sans-serif;font-weight:700;font-size:12px;padding:5px 13px;border-radius:999px;white-space:nowrap;}",
".r-chip.sage{background:var(--rp-sage-bg);color:var(--rp-sage);} .r-chip.sky{background:var(--rp-sky-bg);color:var(--rp-sky);}",
".r-chip.sand{background:var(--rp-sand-bg);color:var(--rp-sand);} .r-chip.lilac{background:var(--rp-lilac-bg);color:var(--rp-lilac);}",
".r-chip.rose{background:var(--rp-rose-bg);color:var(--rp-rose);} .r-chip.neutral{background:var(--rp-neutral-bg);color:var(--rp-neutral);}",
// soft not captured chip
".r-nc{font-size:12px;padding:4px 11px;border-radius:999px;background:var(--rp-neutral-bg);color:var(--rp-neutral);font-style:italic;}",
// dot rows
".rp-dots{display:flex;flex-direction:column;gap:15px;}",
".rp-dot{display:flex;align-items:flex-start;gap:13px;font-size:15.5px;line-height:1.5;color:var(--rp-ink2);}",
".rp-dot .d{width:9px;height:9px;border-radius:50%;margin-top:8px;flex:none;background:var(--rp-neutral);}",
".rp-dot .d.sage{background:var(--rp-sage);} .rp-dot .d.sky{background:var(--rp-sky);} .rp-dot .d.sand{background:var(--rp-sand);}",
".rp-dot .d.lilac{background:var(--rp-lilac);} .rp-dot .d.rose{background:var(--rp-rose);}",
".rp-dot b{font-weight:700;color:var(--rp-ink);}",
// photo frames
".rp-photos{display:grid;grid-template-columns:1fr 1fr;gap:20px;}",
".rp-frame{background:var(--rp-card);border:1px solid var(--rp-line);border-radius:16px;overflow:hidden;}",
".rp-shot{height:198px;background:#E7E2D8;position:relative;display:flex;align-items:center;justify-content:center;}",
".rp-photos.pairs .rp-shot{height:186px;}",
".rp-photos.pairs .rp-cap{padding:8px 13px;font-size:12px;line-height:1.4;}",
".rp-shot img{width:100%;height:100%;object-fit:cover;display:block;}",
".rp-shot .ph{font-size:12.5px;color:var(--rp-faint);padding:0 18px;text-align:center;line-height:1.5;}",
".rp-cap{padding:13px 18px;font-size:13.5px;line-height:1.5;color:var(--rp-ink2);}",
".rp-cap b{font-weight:700;color:var(--rp-ink);}",
// simple table
".rp-tab{width:100%;border-collapse:collapse;font-size:13.5px;}",
".rp-tab th{font-family:'Poppins',sans-serif;font-weight:700;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--rp-muted);text-align:left;padding:0 14px 12px;border-bottom:1px solid var(--rp-line);}",
".rp-tab td{padding:11px 14px;border-bottom:1px solid #F4F1EA;color:var(--rp-ink2);}",
".rp-tab td.num,.rp-tab th.num{text-align:right;} .rp-tab td b{color:var(--rp-ink);font-weight:700;}",
// footer
".rp-foot{position:absolute;left:72px;right:72px;bottom:30px;display:flex;justify-content:space-between;",
"  font-size:11px;color:var(--rp-faint);font-family:'Lato',sans-serif;}",
".rp-shot .busy{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:#8A857A;}",
".rp-shot .busy .sp{width:12px;height:12px;border-radius:50%;border:2px solid #E2DDD2;border-top-color:#8A857A;animation:rpspin .8s linear infinite;}",
"@keyframes rpspin{to{transform:rotate(360deg)}}",
".rp-needs{border:1px solid #E3D6B8;background:#FBF6EA;border-radius:10px;padding:14px 16px;margin-top:16px;}",
".rp-needh{font-size:12px;font-weight:700;color:#7A5C12;letter-spacing:.2px;margin-bottom:9px;text-transform:uppercase;}",
".rp-needlist{margin:0;padding:0;list-style:none;}",
".rp-need{padding:8px 0 8px 13px;border-left:3px solid #D9C48C;margin-bottom:8px;}",
".rp-need:last-child{margin-bottom:0;}",
".rp-need.blocking{border-left-color:#B5654F;}",
".rp-need b{display:block;font-size:12.5px;color:#3A3A38;font-weight:650;}",
".rp-needwho{display:inline-block;font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:#8A7A55;margin:3px 0;}",
".rp-needfix{display:block;font-size:11.5px;color:#5F5C55;line-height:1.5;}",
".rp-note{font-size:13px;color:var(--rp-muted);line-height:1.5;margin-top:18px;}",
// ---- the Reports tab itself: calm pastel cards, one per report -------
".rtab{padding:6px 2px 44px;}",
".rtab-head{margin:0 0 26px;}",
".rtab-head h2{font-family:'Poppins',sans-serif;font-weight:700;font-size:26px;color:var(--rp-ink);margin:0 0 6px;letter-spacing:-.3px;}",
".rtab-head p{font-size:14.5px;color:var(--rp-muted);margin:0;line-height:1.5;}",
".rtab-sum{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0 0;}",
".rtab-grp{margin-bottom:30px;}",
".rtab-h{font-family:'Poppins',sans-serif;font-weight:700;font-size:13px;letter-spacing:1.6px;text-transform:uppercase;color:var(--rp-muted);margin:0 0 14px;display:flex;align-items:center;gap:10px;}",
".rtab-h .c{font-size:11px;color:var(--rp-faint);letter-spacing:.5px;font-weight:400;}",
".rtab-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:16px;}",
".rtab-card{background:var(--rp-card);border:1px solid var(--rp-line);border-radius:16px;padding:20px 22px;display:flex;flex-direction:column;min-height:158px;}",
".rtab-card.locked{background:#FAF8F3;border-style:dashed;border-color:#E4DECF;}",
".rtab-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}",
".rtab-name{font-family:'Poppins',sans-serif;font-weight:700;font-size:16.5px;color:var(--rp-ink);line-height:1.25;}",
".rtab-tells{font-size:13.5px;color:var(--rp-ink2);line-height:1.5;margin:9px 0 0;}",
".rtab-meta{font-size:12px;color:var(--rp-faint);margin-top:10px;}",
".rtab-lock{font-size:12.5px;color:#A7A399;margin-top:auto;padding-top:14px;line-height:1.5;}",
".rtab-act{display:flex;gap:9px;margin-top:auto;padding-top:16px;}",
".rbtn{font-family:'Poppins',sans-serif;font-weight:700;font-size:12.5px;padding:9px 16px;border-radius:9px;border:none;cursor:pointer;transition:opacity .12s;}",
".rbtn:hover{opacity:.86;}",
".rbtn.primary{background:var(--rp-sage);color:#fff;}",
".rbtn.ghost{background:#EDEAE3;color:var(--rp-ink2);}",
".rtoolbar .rbtn.back{background:transparent;color:var(--rp-muted);padding-left:0;}",
".rtoolbar .rtip{font-size:12.5px;color:var(--rp-faint);}",
// ---- the week picker, a calm select in the report toolbar ----------
".rweek{font-family:'Lato',sans-serif;font-size:12.5px;color:var(--rp-ink2);border:1px solid #E4DECF;background:#FCFBF8;border-radius:9px;padding:8px 12px;}",
".rweek:focus{outline:none;border-color:var(--rp-sky);}",
".rtoolbar .rwlab{font-size:12.5px;color:var(--rp-muted);}",
".rpm{position:relative;} .rpm summary{list-style:none;cursor:pointer;} .rpm summary::-webkit-details-marker{display:none;}",
".rpm .rpmwrap{position:absolute;top:38px;left:0;z-index:5;background:#fff;border:1px solid var(--rp-line);border-radius:10px;padding:12px;box-shadow:0 8px 24px rgba(60,55,45,.14);width:320px;}",
".rpm textarea{display:block;width:100%;box-sizing:border-box;height:64px;font-family:'Lato',sans-serif;font-size:12.5px;padding:8px;border:1px solid #E4DECF;border-radius:8px;resize:vertical;margin-bottom:8px;}",
".rpm textarea:focus{outline:none;border-color:var(--rp-sky);}",
// ---- compact annex dual bars: 23 packages on one page, two columns --
".rp-annex{display:grid;grid-template-columns:1fr 1fr;gap:9px 44px;margin-top:6px;}",
".rp-adual{display:grid;grid-template-columns:128px 150px 1fr auto;gap:2px 12px;align-items:center;}",
".rp-adual .an{font-family:'Poppins',sans-serif;font-weight:600;font-size:12px;color:var(--rp-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
".rp-abar{display:flex;flex-direction:column;gap:3px;}",
".rp-al{height:6px;border-radius:4px;background:var(--rp-plantrack);position:relative;overflow:hidden;}",
".rp-al span{position:absolute;left:0;top:0;bottom:0;border-radius:4px;display:block;}",
".rp-al.plan span{background:var(--rp-plan);}",
".rp-al.sage span{background:var(--rp-sage);} .rp-al.sky span{background:var(--rp-sky);}",
".rp-al.sand span{background:var(--rp-sand);} .rp-al.lilac span{background:var(--rp-lilac);}",
".rp-al.rose span{background:var(--rp-rose);} .rp-al.neutral span{background:var(--rp-neutral);}",
".rp-aval{font-size:11px;color:var(--rp-muted);white-space:nowrap;}",
".rp-aval b{color:var(--rp-ink);font-weight:700;}",
".rp-adual .r-chip{font-size:10.5px;padding:3px 9px;}",
// ---- the two week look ahead: two week columns ---------------------
".rp-la{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:6px;}",
".rp-lacol h4{font-family:'Poppins',sans-serif;font-weight:700;font-size:15px;color:var(--rp-ink);margin:0 0 12px;padding-bottom:10px;border-bottom:2px solid var(--rp-line);display:flex;justify-content:space-between;align-items:baseline;}",
".rp-lacol h4 span{font-size:11.5px;font-weight:400;color:var(--rp-faint);letter-spacing:.3px;}",
".rp-laitem{display:grid;grid-template-columns:50px 1fr;gap:12px;padding:8px 0;border-bottom:1px solid #F4F1EA;align-items:start;}",
".rp-lad{font-family:'Poppins',sans-serif;font-weight:700;font-size:11.5px;color:var(--rp-muted);padding-top:2px;white-space:nowrap;}",
".rp-lamain b{font-family:'Poppins',sans-serif;font-weight:600;font-size:13.5px;color:var(--rp-ink);}",
".rp-laev{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-left:8px;}",
".rp-laev.opens{color:var(--rp-sky);} .rp-laev.closes{color:var(--rp-sage);}",
".rp-laneed{font-size:11.5px;margin-top:4px;color:var(--rp-ink2);line-height:1.4;display:flex;gap:7px;align-items:baseline;}",
".rp-nch{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:2px 8px;border-radius:999px;white-space:nowrap;}",
".rp-nch.sky{background:var(--rp-sky-bg);color:var(--rp-sky);} .rp-nch.sand{background:var(--rp-sand-bg);color:var(--rp-sand);} .rp-nch.rose{background:var(--rp-rose-bg);color:var(--rp-rose);}",
".rp-laempty{font-size:13px;color:var(--rp-muted);padding:10px 0;}",
// ---- the delay and risk register: editable owner and recovery ------
".rp-reg{display:flex;flex-direction:column;margin-top:2px;}",
".rp-reghead{display:grid;grid-template-columns:150px 92px 1fr 148px 128px 24px;gap:16px;align-items:end;font-family:'Poppins',sans-serif;font-weight:700;font-size:10px;letter-spacing:.7px;text-transform:uppercase;color:var(--rp-muted);padding:0 6px 10px;border-bottom:1px solid var(--rp-line);}",
".rp-regwrap{border-bottom:1px solid #F4F1EA;}",
".rp-regrow{display:grid;grid-template-columns:150px 92px 1fr 148px 128px 24px;gap:16px;align-items:center;padding:8px 6px;cursor:pointer;}",
".rp-regrow:hover{background:#FBF9F4;}",
".rp-rn{font-family:'Poppins',sans-serif;font-weight:600;font-size:12.5px;color:var(--rp-ink);line-height:1.25;}",
".rp-rn small{display:block;font-family:'Lato',sans-serif;font-weight:400;font-size:10.5px;color:var(--rp-faint);margin-top:2px;}",
".rp-rr{font-size:11.5px;color:var(--rp-ink2);line-height:1.45;}",
".rp-rgate{font-size:10.5px;color:var(--rp-sky);margin-top:3px;}",
".rp-edit{font-family:'Lato',sans-serif;font-size:11.5px;color:var(--rp-ink);border:1px solid #E7E1D3;border-radius:7px;padding:6px 8px;background:#FCFBF8;width:100%;box-sizing:border-box;}",
".rp-edit:focus{outline:none;border-color:var(--rp-sky);background:#fff;}",
".rp-edit.nc{color:var(--rp-neutral);font-style:italic;}",
".rp-chev{font-size:13px;color:var(--rp-faint);text-align:center;transition:transform .12s;}",
".rp-regwrap.open .rp-chev{transform:rotate(90deg);}",
".rp-exp{display:none;padding:2px 8px 16px;font-size:12px;color:var(--rp-ink2);line-height:1.6;}",
".rp-regwrap.open .rp-exp{display:block;}",
".rp-exp b{color:var(--rp-ink);font-weight:700;}",
".rp-exp .ev{margin-top:6px;padding-left:14px;border-left:2px solid var(--rp-line);}",
".rp-reccell{position:relative;}",
".rp-recnc{display:none;font-size:11px;color:var(--rp-neutral);font-style:italic;}",
".rp-reccell:not(.has) .rp-recnc{display:block;margin-top:4px;}",
".rp-odchip{font-size:10px;font-weight:700;color:var(--rp-rose);margin-top:4px;display:block;}",
// a plain column heading used inside a report page (no card around it)
".rp-colh{font-family:'Poppins',sans-serif;font-weight:700;font-size:17px;color:var(--rp-ink);margin:0 0 14px;}",
".rp-two{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:8px;}",
// the look ahead items can flow in two balanced columns on one page
".rp-laflow{columns:2;column-gap:38px;}",
".rp-laflow .rp-laitem{break-inside:avoid;-webkit-column-break-inside:avoid;}",
// scoped compaction for the two dense pages, so the faithful reports keep
// their reference sizing while the One Pager and Delay register fit one page
".mop1 .rp-stat{min-height:84px;padding:15px 20px 13px;} .dreg .rp-stat{min-height:74px;padding:12px 20px 11px;}",
".mop1 .rp-stat b,.dreg .rp-stat b{font-size:30px;margin-bottom:5px;}",
".mop1 .rp-stat span,.dreg .rp-stat span{font-size:12.5px;line-height:1.35;}",
".mop1 .rp-two{margin-top:12px;gap:30px;}",
".mop1 .rp-colh{font-size:16px;margin:0 0 9px;}",
".mop1 .rp-tab td{padding:6px 14px;font-size:12.5px;} .mop1 .rp-tab th{padding-bottom:8px;}",
".mop1 .rp-dots{gap:9px;} .mop1 .rp-dot{font-size:12.8px;line-height:1.4;} .mop1 .rp-dot .d{margin-top:6px;}",
".mop1 .rp-card{padding:15px 20px;} .mop1 .rp-card h3{font-size:16px;margin-bottom:6px;}",
".mop1 .rp-card p{font-size:12.8px;line-height:1.45;} .mop1 .rp-card .foot{font-size:11.5px;margin-top:7px;}",
".dreg .rp-reg{margin-top:8px;} .dreg .rp-regrow{padding:6px 6px;} .dreg .rp-rr{font-size:11px;line-height:1.4;}",
".dreg .rp-rn{font-size:12px;} .dreg .rp-rn small{font-size:10px;}",
// scoped compaction for the data heavy reports (procurement weekly, the PO
// register, the GFC status). The stat numbers never wrap, the cards sit
// lower, and the tables pack the reference's row density so a full board or
// a long register clears the footer on one page.
".rdense .rp-stat{min-height:92px;padding:18px 22px 16px;}",
".rdense .rp-stat b{font-size:33px;line-height:1.05;margin-bottom:6px;white-space:nowrap;}",
".rdense .rp-stat span{font-size:12.5px;line-height:1.4;}",
".rdense .rp-colh{margin:0 0 10px;}",
".rdense .rp-tab th{padding:0 14px 8px;}",
".rdense .rp-tab td{padding:6px 14px;font-size:12.5px;line-height:1.35;}",
// the 16 row material board packs a touch tighter so it clears the footer
".rboard .rp-tab td{padding:5px 14px;}",
".rdense .rp-card{padding:18px 22px;} .rdense .rp-card h3{font-size:17px;margin-bottom:7px;} .rdense .rp-card p{font-size:13px;line-height:1.5;}",
".rdense .rp-note{margin-top:12px;font-size:12px;}",
".rdense .rp-comp{gap:11px;} .rdense .rp-crow{grid-template-columns:210px 300px 54px 1fr;}",
// ---- Site Walk deck: completion by package, single deep bars --------
".rp-comp{display:flex;flex-direction:column;gap:15px;margin-top:4px;}",
".rp-crow{display:grid;grid-template-columns:190px 320px 54px 1fr;gap:20px;align-items:center;}",
".rp-crow .cn{font-family:'Poppins',sans-serif;font-weight:600;font-size:14.5px;color:var(--rp-ink);}",
".rp-cbar{height:11px;border-radius:7px;background:var(--rp-plantrack);position:relative;overflow:hidden;}",
".rp-cbar span{position:absolute;left:0;top:0;bottom:0;border-radius:7px;display:block;}",
".rp-cbar.sage span{background:var(--rp-sage);} .rp-cbar.sky span{background:var(--rp-sky);}",
".rp-cbar.sand span{background:var(--rp-sand);} .rp-cbar.lilac span{background:var(--rp-lilac);}",
".rp-cbar.rose span{background:var(--rp-rose);} .rp-cbar.neutral span{background:var(--rp-neutral);}",
".rp-cpct{font-family:'Poppins',sans-serif;font-weight:700;font-size:17px;color:var(--rp-ink2);text-align:right;}",
".rp-cnote{font-size:13px;color:var(--rp-muted);line-height:1.4;}",
// ---- left accent insight cards (the slow packages, what compare says)
".rp-lcards{display:grid;gap:14px;}",
".rp-lcards.c2{grid-template-columns:1fr 1fr;}",
".rp-lcard{background:var(--rp-card);border:1px solid var(--rp-line);border-left:4px solid var(--rp-neutral);border-radius:12px;padding:15px 18px;}",
".rp-lcard.sage{border-left-color:var(--rp-sage);} .rp-lcard.sky{border-left-color:var(--rp-sky);}",
".rp-lcard.sand{border-left-color:var(--rp-sand);} .rp-lcard.lilac{border-left-color:var(--rp-lilac);} .rp-lcard.rose{border-left-color:var(--rp-rose);}",
".rp-lcard b{font-family:'Poppins',sans-serif;font-weight:700;color:var(--rp-ink);}",
".rp-lcard p{font-size:13.5px;line-height:1.55;color:var(--rp-ink2);margin:2px 0 0;}",
// a photo with a caption sitting beside content (deck evidence pages) ----
".rp-split{display:grid;grid-template-columns:1fr 468px;gap:34px;align-items:start;}",
".rp-split.left{grid-template-columns:468px 1fr;}",
".rp-photo1{background:var(--rp-card);border:1px solid var(--rp-line);border-radius:16px;overflow:hidden;}",
".rp-photo1 .rp-shot{height:300px;}",
".rp-pintag{display:inline-block;font-family:'Poppins',sans-serif;font-weight:700;font-size:11px;padding:3px 10px;border-radius:999px;background:var(--rp-sand-bg);color:var(--rp-sand);margin-right:8px;}",
// ---- tinted list rows (next 7 days, week look) ---------------------
".rp-tlist{display:flex;flex-direction:column;gap:11px;}",
".rp-titem{border-radius:12px;padding:13px 18px;font-size:14.5px;line-height:1.45;color:var(--rp-ink2);}",
".rp-titem b{font-family:'Poppins',sans-serif;font-weight:600;color:var(--rp-ink);}",
".rp-titem.sage{background:var(--rp-sage-bg);} .rp-titem.sand{background:var(--rp-sand-bg);}",
".rp-titem.rose{background:var(--rp-rose-bg);} .rp-titem.sky{background:var(--rp-sky-bg);} .rp-titem.neutral{background:var(--rp-neutral-bg);}",
// ---- two big tinted list cards (challenges, manpower and material) --
".rp-bigcards{display:grid;grid-template-columns:1fr 1fr;gap:24px;}",
".rp-bigcard{border-radius:18px;padding:26px 28px;}",
".rp-bigcard.sage{background:var(--rp-sage-bg);} .rp-bigcard.sky{background:var(--rp-sky-bg);}",
".rp-bigcard.sand{background:var(--rp-sand-bg);} .rp-bigcard.lilac{background:var(--rp-lilac-bg);} .rp-bigcard.rose{background:var(--rp-rose-bg);}",
".rp-bigcard h3{font-family:'Poppins',sans-serif;font-weight:700;font-size:20px;margin:0 0 16px;}",
".rp-bigcard.sage h3{color:var(--rp-sage);} .rp-bigcard.sky h3{color:var(--rp-sky);} .rp-bigcard.sand h3{color:var(--rp-sand);} .rp-bigcard.lilac h3{color:var(--rp-lilac);} .rp-bigcard.rose h3{color:var(--rp-rose);}",
".rp-bl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px;}",
".rp-bl li{font-size:14px;line-height:1.5;color:var(--rp-ink2);padding-left:18px;position:relative;}",
".rp-bl li::before{content:'';position:absolute;left:0;top:8px;width:6px;height:6px;border-radius:50%;background:var(--rp-muted);}",
".rp-bl.chips{flex-direction:row;flex-wrap:wrap;gap:9px;}",
".rp-bl.chips li{padding:7px 15px;background:#fff;border-radius:999px;font-family:'Poppins',sans-serif;font-weight:600;font-size:12.5px;color:var(--rp-ink2);}",
".rp-bl.chips li::before{display:none;}",
// ---- Site Walk grid mode: all 81 pins as thumbnails ----------------
".rp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:4px;}",
".rp-gcell{background:var(--rp-card);border:1px solid var(--rp-line);border-radius:12px;overflow:hidden;}",
".rp-gcell .rp-shot{height:124px;}",
".rp-gcap{padding:8px 11px;font-size:11px;line-height:1.35;color:var(--rp-ink2);}",
".rp-gcap b{font-family:'Poppins',sans-serif;font-weight:700;color:var(--rp-ink);}",
// ---- deck toggle (curated vs grid), a segmented control ------------
".rp-dtoggle{display:inline-flex;gap:3px;background:#EDEAE3;border-radius:10px;padding:4px;}",
".rp-dtoggle button{font-family:'Poppins',sans-serif;font-weight:700;font-size:12px;padding:7px 15px;border:none;border-radius:7px;background:transparent;color:var(--rp-muted);cursor:pointer;}",
".rp-dtoggle button.on{background:#fff;color:var(--rp-ink);box-shadow:0 1px 3px rgba(60,55,45,.12);}",
// ---- Client walkthrough: the zone picker (screen only) -------------
".rp-setup{max-width:1000px;margin:0 auto;padding:8px 0 40px;}",
".rp-setup h2{font-family:'Poppins',sans-serif;font-weight:700;font-size:24px;color:var(--rp-ink);margin:0 0 6px;}",
".rp-setup p.lead{font-size:14px;color:var(--rp-muted);margin:0 0 20px;line-height:1.5;}",
".rp-zgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 18px;}",
".rp-zone{display:flex;align-items:center;gap:10px;padding:11px 14px;border:1px solid var(--rp-line);border-radius:10px;background:#fff;cursor:pointer;font-size:13.5px;color:var(--rp-ink2);}",
".rp-zone:hover{border-color:var(--rp-sky);}",
".rp-zone.on{background:var(--rp-sage-bg);border-color:transparent;color:var(--rp-ink);}",
".rp-zone input{accent-color:var(--rp-sage);width:16px;height:16px;flex:none;}",
".rp-zone .zt{font-size:11px;color:var(--rp-faint);margin-left:auto;}",
".rp-setup .rp-zh{font-family:'Poppins',sans-serif;font-weight:700;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:var(--rp-muted);margin:22px 0 12px;}",
// ---- Client walkthrough: the route reorder list (screen only) ------
".rp-route{display:flex;flex-direction:column;gap:9px;margin-top:6px;}",
".rp-ritem{display:grid;grid-template-columns:26px 1fr auto;gap:12px;align-items:center;background:#fff;border:1px solid var(--rp-line);border-radius:10px;padding:11px 14px;cursor:grab;}",
".rp-ritem.drag{opacity:.5;}",
".rp-ritem .grip{color:var(--rp-faint);font-size:15px;cursor:grab;}",
".rp-ritem .rname{font-family:'Poppins',sans-serif;font-weight:600;font-size:14px;color:var(--rp-ink);}",
".rp-ritem .rmeta{font-size:12px;color:var(--rp-muted);}",
".rp-go{font-family:'Poppins',sans-serif;font-weight:700;font-size:13px;padding:11px 22px;border-radius:9px;border:none;cursor:pointer;background:var(--rp-sage);color:#fff;margin-top:20px;}",
".rp-go:hover{opacity:.88;}",
// ---- Client walkthrough: one room page -----------------------------
".rp-room{display:grid;grid-template-columns:520px 1fr;gap:34px;align-items:start;}",
".rp-room .rp-photo1 .rp-shot{height:360px;}",
".rp-rlists{display:flex;flex-direction:column;gap:18px;}",
".rp-rlist h4{font-family:'Poppins',sans-serif;font-weight:700;font-size:14px;letter-spacing:.4px;color:var(--rp-ink);margin:0 0 9px;display:flex;align-items:center;gap:8px;}",
".rp-rlist h4 .dot{width:9px;height:9px;border-radius:50%;}",
".rp-rlist h4 .dot.sage{background:var(--rp-sage);} .rp-rlist h4 .dot.sky{background:var(--rp-sky);} .rp-rlist h4 .dot.sand{background:var(--rp-sand);}",
".rp-rlist ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px;}",
".rp-rlist li{font-size:14px;line-height:1.45;color:var(--rp-ink2);padding-left:16px;position:relative;}",
".rp-rlist li::before{content:'';position:absolute;left:0;top:8px;width:5px;height:5px;border-radius:50%;background:var(--rp-faint);}",
".rp-say{background:var(--rp-sky-bg);border-radius:12px;padding:14px 18px;}",
".rp-say h4{color:var(--rp-sky);}",
".rp-redit{width:100%;box-sizing:border-box;font-family:'Lato',sans-serif;font-size:13.5px;color:var(--rp-ink);border:1px solid #E7E1D3;border-radius:8px;padding:8px 10px;background:#FCFBF8;resize:vertical;line-height:1.45;}",
".rp-redit:focus{outline:none;border-color:var(--rp-sky);background:#fff;}",
// print: one report page per PDF page, landscape 16:9, no stage, no chrome
"@media print{",
"  @page rp{ size:1280px 720px; margin:0; }",
"  .rstage{background:#fff;padding:0;gap:0;display:block;overflow:visible;}",
"  .rtoolbar,.noprint{display:none !important;}",
"  .rpage{page:rp;box-shadow:none;border-radius:0;margin:0 !important;break-inside:avoid;transform:none !important;}",
"  .rpage + .rpage{break-before:page;}",
"  html,body{background:#fff;}",
"  *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}",
// the register inputs print as plain static text, no field chrome
"  .rp-edit{border:none;background:transparent;padding:2px 0;}",
"  .rp-chev{display:none;}",
"  .rp-regrow{grid-template-columns:150px 92px 1fr 148px 128px;}",
"  .rp-reghead{grid-template-columns:150px 92px 1fr 148px 128px;}",
"  .rp-exp{display:none !important;}",
"  .rp-reccell:not(.has) .rp-edit{display:none;}",
// the deck toggle, zone setup and route reorder are screen only steps
"  .rp-dtoggle,.rp-setup,.rp-go,.rp-dtoolbar{display:none !important;}",
"  .rp-ritem{cursor:default;} .rp-ritem .grip{display:none;}",
// the walkthrough talking point editor prints as plain static text
"  .rp-redit{border:none;background:transparent;padding:0;resize:none;}",
"  .rp-eviden{display:none !important;} .rp-dot .caret{display:none;}",
"}"
].join("\n");

// ---- builders -------------------------------------------------------
// A page. variant: "cover" | "section" | "plain". Everything optional so
// a report composes exactly the header it needs.
function page(o) {
  o = o || {};
  var cls = "rpage" + (o.variant === "cover" ? " rp-cover" : "");
  var head = "";
  if (o.variant === "cover") {
    head =
      (o.kick ? '<div class="rp-kick">' + esc(o.kick) + "</div>" : "") +
      (o.title ? '<h1 class="rp-title">' + o.title + "</h1>" : "") +
      (o.sub ? '<div class="rp-sub">' + esc(o.sub) + "</div>" : "") +
      (o.pills ? pills(o.pills) : "");
  } else {
    head =
      (o.kick ? '<div class="rp-kick">' + esc(o.kick) + "</div>" : "") +
      (o.title ? '<h1 class="rp-h1">' + esc(o.title) + "</h1>" : "") +
      (o.sub ? '<div class="rp-sub">' + esc(o.sub) + "</div>" : "");
  }
  var footL = o.footL || "Flipspaces · Project Tracking Engine";
  var footR = o.footR || "";
  return '<div class="' + cls + '"><div class="rp-in">' + head +
    '<div class="rp-body">' + (o.body || "") + "</div></div>" +
    '<div class="rp-foot"><span>' + esc(footL) + "</span><span>" + esc(footR) + "</span></div></div>";
}

function pills(list) {
  return '<div class="rp-pills">' + (list || []).map(function (p) {
    return '<div class="rp-pill ' + (p.tone || "sky") + '">' + esc(p.t) + "</div>";
  }).join("") + "</div>";
}

// stat cards. cards: [{big, cap, tone}]. tone defaults cycle the pastels.
function statCards(cards) {
  return '<div class="rp-stats">' + (cards || []).map(function (c, i) {
    var tone = c.tone || TONES[i % TONES.length];
    return '<div class="rp-stat ' + tone + '"><b>' + esc(c.big) + "</b><span>" + esc(c.cap) + "</span></div>";
  }).join("") + "</div>";
}

// white or tinted cards. items: [{head, body, foot, tone}]. cols 1 or 2.
function cards(items, cols) {
  return '<div class="rp-cards c' + (cols || 2) + '">' + (items || []).map(function (c) {
    return '<div class="rp-card' + (c.tone ? " " + c.tone : "") + '">' +
      (c.head ? "<h3>" + esc(c.head) + "</h3>" : "") +
      (c.body ? "<p>" + esc(c.body) + "</p>" : "") +
      (c.foot ? '<div class="foot">' + esc(c.foot) + "</div>" : "") + "</div>";
  }).join("") + "</div>";
}

// one verdict / plain read card, full width, with an optional muted foot.
// body is escaped plain text. Pass tone to tint the card.
function verdict(o) {
  o = o || {};
  return '<div class="rp-cards c1"><div class="rp-card' + (o.tone ? " " + o.tone : "") + '">' +
    (o.head ? "<h3>" + esc(o.head) + "</h3>" : "") +
    (o.body ? "<p>" + esc(o.body) + "</p>" : "") +
    (o.foot ? '<div class="foot">' + esc(o.foot) + "</div>" : "") + "</div></div>";
}

// a chip. Pass an explicit tone, else it is read from the word.
function chip(text, tone) {
  return '<span class="r-chip ' + (tone || chipTone(text)) + '">' + esc(text) + "</span>";
}
// the soft "not captured" chip, never a blank, never a guess
function notCaptured(what) { return '<span class="r-nc">' + esc(what || "not captured") + "</span>"; }

// dual bar rows. rows: [{name, plan, site, chip, chipLabel, note}].
// plan is the pale lane, site the deep lane tinted by the chip tone.
function dualRows(rows, legend) {
  var leg = legend === false ? "" :
    '<div class="rp-legend"><span><i class="plan"></i>plan</span><span><i class="site"></i>seen on site</span></div>';
  var body = (rows || []).map(function (r) {
    var tone = chipTone(r.chip);
    var plan = r.plan == null ? 0 : Math.max(0, Math.min(100, r.plan));
    var site = r.site == null ? null : Math.max(0, Math.min(100, r.site));
    var chipHtml = r.chip ? chip(r.chipLabel || r.chip, tone) : "<span></span>";
    return '<div class="rp-dual">' +
      '<div class="r-name">' + esc(r.name) + "</div>" +
      '<div class="rp-bars">' +
        '<div class="rp-lane plan"><span style="width:' + plan + '%"></span></div>' +
        '<div class="rp-lane ' + tone + '"><span style="width:' + (site == null ? 0 : site) + '%"></span></div>' +
      "</div>" +
      '<span class="r-val">plan <b>' + (r.plan == null ? "·" : plan) + "</b> · site <b>" +
        (site == null ? "no reading" : site) + "</b></span>" +
      chipHtml +
      '<div class="r-note">' + esc(r.note || "") + "</div>" +
      "</div>";
  }).join("");
  return leg + '<div class="rp-duals">' + body + "</div>";
}

// dot rows. rows: [{tone, lead, body}]. lead is bold, body follows.
function dotRows(rows) {
  return '<div class="rp-dots">' + (rows || []).map(function (r) {
    return '<div class="rp-dot"><span class="d ' + (r.tone || "") + '"></span><div>' +
      (r.lead ? "<b>" + esc(r.lead) + "</b> " : "") + esc(r.body || "") + "</div></div>";
  }).join("") + "</div>";
}

// photo frames. frames: [{slotId, ph, lead, body}]. slotId names the img
// slot the template fills at render time. ph is the honest placeholder.
function photoFrames(frames) {
  return '<div class="rp-photos">' + (frames || []).map(function (f) {
    return '<div class="rp-frame"><div class="rp-shot" id="' + esc(f.slotId) + '">' +
      '<div class="ph"><span class="busy"><span class="sp"></span>' + esc(f.ph || "pulling the photo") + "</span></div></div>" +
      '<div class="rp-cap">' + (f.lead ? "<b>" + esc(f.lead) + "</b> " : "") + esc(f.body || "") + "</div></div>";
  }).join("") + "</div>";
}

function note(text) { return '<div class="rp-note">' + esc(text) + "</div>"; }

// needsBlock . the missing inputs, printed on the cover. A report never
// says "to be updated later": it names the input, who supplies it and how
// it is closed, so the gap is actionable instead of decorative.
function needsBlock(res) {
  if (!res || res.ready || !res.gaps || !res.gaps.length) return "";
  var rows = res.gaps.map(function (g) {
    return '<li class="rp-need' + (g.blocking ? " blocking" : "") + '">' +
      '<b>' + esc(g.what) + "</b>" +
      '<span class="rp-needwho">' + esc(g.who) + "</span>" +
      '<span class="rp-needfix">' + esc(g.fix) + "</span></li>";
  }).join("");
  return '<div class="rp-needs"><div class="rp-needh">' +
    esc("This report needs " + res.gaps.length + " input" + (res.gaps.length > 1 ? "s" : "") +
        " to be complete" + (res.blocking ? ", " + res.blocking + " of them blocking" : "")) +
    "</div><ul class=\"rp-needlist\">" + rows + "</ul></div>";
}

// a simple table in the report style. headers: [{label, num?}]. rows:
// arrays of cell HTML (already built by the caller), or { cells:[...],
// cls } to tint a row. Cells are raw HTML so a caller can drop a chip in.
function table(headers, rows) {
  var head = "<thead><tr>" + (headers || []).map(function (h) {
    return '<th' + (h.num ? ' class="num"' : "") + ">" + esc(h.label) + "</th>";
  }).join("") + "</tr></thead>";
  var body = "<tbody>" + (rows || []).map(function (r) {
    var cells = Array.isArray(r) ? r : (r.cells || []);
    var cls = (r && r.cls) ? ' class="' + r.cls + '"' : "";
    return "<tr" + cls + ">" + cells.map(function (c, i) {
      var num = headers && headers[i] && headers[i].num ? ' class="num"' : "";
      return "<td" + num + ">" + c + "</td>";
    }).join("") + "</tr>";
  }).join("") + "</tbody>";
  return '<table class="rp-tab">' + head + body + "</table>";
}

// compact dual bars for an annex: many packages, two columns, thin lanes.
// rows: [{name, plan, site, chip, chipLabel}].
function annexDuals(rows) {
  return '<div class="rp-annex">' + (rows || []).map(function (r) {
    var tone = chipTone(r.chip);
    var plan = r.plan == null ? 0 : Math.max(0, Math.min(100, r.plan));
    var site = r.site == null ? null : Math.max(0, Math.min(100, r.site));
    return '<div class="rp-adual">' +
      '<div class="an" title="' + esc(r.name) + '">' + esc(r.name) + "</div>" +
      '<div class="rp-abar">' +
        '<div class="rp-al plan"><span style="width:' + plan + '%"></span></div>' +
        '<div class="rp-al ' + tone + '"><span style="width:' + (site == null ? 0 : site) + '%"></span></div>' +
      "</div>" +
      '<span class="rp-aval">plan <b>' + (r.plan == null ? "·" : plan) + "</b> · site <b>" +
        (site == null ? "·" : site) + "</b></span>" +
      (r.chip ? chip(r.chipLabel || r.chip, tone) : "<span></span>") +
      "</div>";
  }).join("") + "</div>";
}

// a small need chip for the look ahead (material / drawing / decision).
function needChip(text, tone) { return '<span class="rp-nch ' + (tone || "sky") + '">' + esc(text) + "</span>"; }

root.TRACK_REPORTCSS = {
  CSS: CSS,
  TONES: TONES, chipTone: chipTone, esc: esc,
  page: page, pills: pills, statCards: statCards, cards: cards, verdict: verdict,
  chip: chip, notCaptured: notCaptured, dualRows: dualRows, dotRows: dotRows,
  photoFrames: photoFrames, note: note, needsBlock: needsBlock,
  table: table, annexDuals: annexDuals, needChip: needChip
};
if (typeof module !== "undefined") module.exports = root.TRACK_REPORTCSS;

})(typeof window !== "undefined" ? window : globalThis);
