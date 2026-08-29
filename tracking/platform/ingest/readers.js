// ===================================================================
// DnB-OS . platform/ingest/readers.js . OPENING THE DOCUMENTS
// Real readers for the formats a fit-out actually arrives in. Each one
// returns rows with WHERE each value sat, so every fact built from them
// carries its sheet and cell.
//
//   xlsx(buf)          sheets -> rows, with A1-style cell refs
//   dxf(text)          CAD -> text entities and closed polygons with areas
//   csv(text)          rows, with line numbers
//   sniff(name, buf)   which reader a file needs
//
// THE LAWS
//   . A READER REPORTS WHAT IT COULD NOT READ. A sheet it skipped, a row
//     it could not parse, a layer it did not understand . named, counted,
//     and handed back. A reader that quietly returns fewer rows than the
//     document has is the most dangerous thing in an ingest pipeline.
//   . NO INTERPRETATION HERE. These return cells and geometry. Turning
//     "SKF_R1_GFC" into a project name, or a polygon into a room, is the
//     mapping layer's job and it is done against declared vocabulary.
//   . DATES ARE ONLY DATES WHEN THE CELL SAYS SO. A spreadsheet serial is
//     just a number; it becomes a date because its column is a date
//     column, not because the number falls in a plausible range.
//
// Node-side: needs zlib for xlsx. Pure otherwise.
// ===================================================================

;(function (root) {

const hasNode = (typeof require !== "undefined");

// ---- xlsx --------------------------------------------------------------
// A workbook is a zip of XML. No dependency: unzip with the platform's own
// inflate, then read the two parts that matter.
//
// &amp; IS AN AMPERSAND EVERYWHERE, NOT JUST IN A SHARED STRING. The same
// five entities arrive in shared strings, in inline strings, in formula
// results and in the sheet name, and each place that unescaped its own way
// got a different subset right — "Fire &amp; Security" then failed to match
// "Fire & Security" and the sheet could not be found at all.
function unescapeXml(s) {
  return String(s == null ? "" : s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#10;/g, " ").replace(/&#13;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    // last, so a literal "&amp;lt;" survives as "&lt;" rather than becoming "<"
    .replace(/&amp;/g, "&");
}

function xlsx(entries) {
  // entries: { "xl/workbook.xml": "<xml…>", … } . already unzipped by the
  // caller, because unzipping is an I/O concern and this stays pure.
  const problems = [];
  const get = (p) => entries[p] || null;

  const ssXml = get("xl/sharedStrings.xml");
  const shared = ssXml ? [...ssXml.matchAll(/<si>(.*?)<\/si>/gs)].map(m =>
    unescapeXml([...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(x => x[1]).join(""))) : [];

  // DATES ARE ONLY DATES WHEN THE CELL SAYS SO — and the cell says so in
  // styles.xml, not in the size of the number. A serial in the 1990-2100
  // window is anything from 32,900 to 73,400, which is also where a great
  // many rupee rates live: HVAC_VAV's supply rate of 33,839 was read as
  // 24 August 1992 and the column was refused as "mixed". Excel already
  // knows the answer — every cell carries a style index, and the style
  // carries a number format. Ask it.
  const dateStyles = dateFormats(get("xl/styles.xml"), problems);

  const wb = get("xl/workbook.xml"), rels = get("xl/_rels/workbook.xml.rels");
  if (!wb)  { problems.push("no xl/workbook.xml — this is not a readable workbook"); return { sheets: {}, problems }; }
  const rid = {};
  if (rels) for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) rid[m[1]] = m[2];

  const sheets = {};
  // ATTRIBUTE ORDER IS NOT GUARANTEED. Excel writes <sheet name= … r:id= …>
  // but a workbook saved elsewhere writes <sheet state="hidden" name= …>,
  // and a regex that assumed the first order silently read ZERO sheets out
  // of a 185 KB workbook . and reported it as a clean read.
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const at = m[1];
    const nm = /name="([^"]+)"/.exec(at), ri = /r:id="([^"]+)"/.exec(at);
    if (!nm || !ri) { problems.push("a <sheet> element carries no name or no r:id: " + at.trim().slice(0, 60)); continue; }
    const name = unescapeXml(nm[1]);
    const hidden = /state="(hidden|veryHidden)"/.test(at);
    const target = rid[ri[1]];
    if (!target) { problems.push('sheet "' + name + '" has no part in the workbook rels'); continue; }
    const path = "xl/" + String(target).replace(/^\/?xl\//, "");
    const xml = get(path);
    if (!xml) { problems.push('sheet "' + name + '" is declared but its part is missing'); continue; }
    sheets[name] = readSheet(xml, shared, name, problems, dateStyles);
    sheets[name].hidden = hidden;   // a hidden sheet often holds the real data
  }
  // A WORKBOOK THAT YIELDS NOTHING IS A PROBLEM, NOT A READ. Saying
  // "0 sheets" in the success column is exactly the silent-shortfall this
  // module is written to prevent.
  if (!Object.keys(sheets).length)
    problems.push("no sheet could be read out of this workbook at all — it declares " +
      (wb.match(/<sheet\b/g) || []).length + " of them");
  return { sheets, problems, sheetNames: Object.keys(sheets),
    hiddenNames: Object.keys(sheets).filter(n => sheets[n].hidden) };
}

// AN EMPTY CELL IS STILL A CELL, AND IT CLOSES ITSELF. Excel writes a
// styled-but-empty cell as <c r="F1" s="835"/> — no closing tag. A pattern
// that only knows <c …>…</c> does not skip it: it matches <c r="F1" … up to
// the NEXT </c>, so the empty cell swallows its neighbours and claims their
// value. Every quantity and rate after a blank column then lands one column
// to the left, and the shared-string index arrives unresolved — the empty
// cell carries no t="s", so "RATE" is recorded as the number 224.
// This is the worst kind of parse failure: it never throws, it never reports,
// and a BOQ where the blanks are styled reads as confident wrong numbers.
// The alternation matches the self-closing form FIRST, so a blank cell is
// consumed as a blank cell and nothing shifts.
const CELL = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs;

// ---- which styles mean "this is a date" -------------------------------
// styles.xml holds <cellXfs>, one <xf> per style index, each naming a
// numFmtId. Ids 14-22 and 45-47 are the built-in date and time formats;
// anything custom is declared in <numFmts> with its format code, and a code
// containing y/d or a month token is a date. Everything else is a number,
// however large. Returns a set of style indices.
const BUILTIN_DATE = new Set([14,15,16,17,18,19,20,21,22,45,46,47]);
function dateFormats(stylesXml, problems) {
  // NULL IS "THERE IS NOBODY TO ASK", AN EMPTY SET IS "I ASKED AND NOTHING
  // IS A DATE". Returning an empty set for a workbook with no styles told
  // every caller that no cell was a date — a confident answer to a question
  // that was never put.
  if (!stylesXml) { (problems || []).push(
    "this workbook carries no styles.xml, so a number can only be told from a date by its size — " +
    "rates between 32,900 and 73,400 may be misread"); return null; }
  const out = new Set();
  const custom = {};
  const nf = /<numFmts[^>]*>(.*?)<\/numFmts>/s.exec(stylesXml);
  if (nf) for (const m of nf[1].matchAll(/numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const code = unescapeXml(m[2]);
    // strip the quoted literals first — a format of "Total "0 is not a date
    const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
    custom[m[1]] = /(y{2,}|d{1,2}\b|mmm|m{1,2}\/|\/m{1,2}|h:mm|mm:ss)/i.test(bare);
  }
  const xfs = /<cellXfs[^>]*>(.*?)<\/cellXfs>/s.exec(stylesXml);
  if (!xfs) return out;   // styles exist but declare no cell formats
  let i = 0;
  for (const m of xfs[1].matchAll(/<xf\b([^>]*?)\/?>/g)) {
    const id = /numFmtId="(\d+)"/.exec(m[1]);
    if (id && (BUILTIN_DATE.has(Number(id[1])) || custom[id[1]])) out.add(i);
    i++;
  }
  return out;
}

function readSheet(xml, shared, sheetName, problems, dateStyles) {
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
    const rNum = Number(rm[1]);
    const cells = {};
    for (const cm of rm[2].matchAll(CELL)) {
      const col = cm[1], t = /t="([^"]+)"/.exec(cm[3]);
      const body = cm[4] == null ? "" : cm[4];
      const v = /<v>(.*?)<\/v>/s.exec(body);
      const isf = /<f[ >]/.test(body);
      // A CELL CAN CARRY ITS TEXT IN PLACE OF POINTING AT IT. t="inlineStr"
      // writes <is><t>…</t></is> and no <v> at all; dropping it loses whole
      // columns without a word, and exports out of Google Sheets and several
      // BOQ tools use it throughout.
      if (!v && t && t[1] === "inlineStr") {
        const parts = [...body.matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(x => x[1]);
        if (!parts.length) continue;
        cells[col + rNum] = { v: unescapeXml(parts.join("")), col, row: rNum,
          ref: col + rNum, num: null, formula: isf };
        continue;
      }
      if (!v) continue;
      let val;
      if (t && t[1] === "s") { const i = Number(v[1]); val = shared[i]; if (val == null) problems.push(sheetName + "!" + col + rNum + " points at a shared string that is not there"); }
      else if (t && t[1] === "e") { val = null; problems.push(sheetName + "!" + col + rNum + " is a spreadsheet error cell"); }
      else if (t && t[1] === "str") val = unescapeXml(v[1]);
      else val = v[1];
      // keyed by the FULL A1 reference, not the column letter. The cell says
      // "B7" everywhere else in the pipeline; keying it "B" meant a fact's
      // source and the store's key disagreed about the same cell.
      const st = /\bs="(\d+)"/.exec(cm[3]);
      cells[col + rNum] = { v: val, col, row: rNum, ref: col + rNum,
        num: t ? null : Number(v[1]), formula: isf,
        // null when the workbook has no styles to ask — the caller then falls
        // back to the range test and knows that is what it is doing
        dated: dateStyles ? (st ? dateStyles.has(Number(st[1])) : false) : null };
    }
    if (Object.keys(cells).length) rows.push({ r: rNum, cells });
  }
  // A MERGED CELL IS A DECLARATION ABOUT THE COLUMNS IT SPANS. "RATE(INR)"
  // written once across E:G is the sheet SAYING that E, F and G are all
  // rates; the file stores the text on E1 alone and leaves F1 and G1 empty,
  // so a reader that ignores merges sees three headers called SUPPLY,
  // INSTALLATION and TOTAL with nothing to say what they are of.
  // Reported, never applied here: filling the spanned cells in would put the
  // same value in three columns and make three facts out of one. What to do
  // with a span is the mapping layer's decision — see sheets.js.
  const merges = [];
  const mc = /<mergeCells[^>]*>(.*?)<\/mergeCells>/s.exec(xml);
  if (mc) for (const m of mc[1].matchAll(/ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g))
    merges.push({ c1: m[1], r1: Number(m[2]), c2: m[3], r2: Number(m[4]) });
  return { name: sheetName, rows, count: rows.length, merges };
}

// a spreadsheet serial is only a date when its column is a date column
function serialToISO(n) {
  const x = Number(n);
  if (!isFinite(x) || x < 1) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(x) * 86400000);
  const iso = d.toISOString().slice(0, 10);
  return iso >= "1990-01-01" && iso <= "2100-01-01" ? iso : null;
}

// ---- dxf ---------------------------------------------------------------
// Code/value line pairs. Text entities carry labels; closed polylines carry
// geometry. Both come back with the layer they sat on.
function dxf(text, opts) {
  const o = opts || {};
  const lines = String(text).split(/\r?\n/);
  const texts = [], polys = [];
  const layers = {};
  let cur = null;
  const flush = () => {
    if (!cur) return;
    if (cur.t === "LWPOLYLINE" && cur.pts.length > 2) polys.push(cur);
    if ((cur.t === "TEXT" || cur.t === "MTEXT") && cur.s != null) texts.push(cur);
  };
  for (let i = 0; i < lines.length - 1; i += 2) {
    const c = lines[i].trim(), v = lines[i + 1];
    if (c === "0") { flush(); cur = { t: v.trim(), pts: [], closed: 0 }; continue; }
    if (!cur) continue;
    if (c === "8") { cur.layer = v.trim(); layers[cur.layer] = (layers[cur.layer] || 0) + 1; }
    else if (c === "70" && cur.t === "LWPOLYLINE") cur.closed = parseInt(v, 10) & 1;
    else if (c === "1" || c === "3") cur.s = (cur.s || "") + v;
    else if (c === "10") { if (cur.t === "LWPOLYLINE") cur.pts.push([parseFloat(v), null]); else cur.x = parseFloat(v); }
    else if (c === "20") { if (cur.t === "LWPOLYLINE" && cur.pts.length) cur.pts[cur.pts.length - 1][1] = parseFloat(v); else cur.y = parseFloat(v); }
  }
  flush();

  // MTEXT carries formatting codes inline: \pi<n>;  \H<n>x;  \C<n>;  \fFont;
  const clean = (s) => String(s)
    .replace(/\\[fF][^;]*;/g, "")
    .replace(/\\[a-zA-Z]+[-\d.]*x?;/g, "")
    .replace(/\\P/g, " ").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();

  const SQ_MM = o.sqftPerUnit || 92903.04;   // drawing units are mm
  const area = (p) => { let a = 0; for (let i = 0, n = p.length; i < n; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % n]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };

  const labels = texts.filter(t => t.x != null && t.y != null)
    .map(t => ({ text: clean(t.s), raw: t.s, x: t.x, y: t.y, layer: t.layer || "0" }))
    .filter(t => t.text);
  const shapes = polys.filter(p => p.closed && p.pts.every(q => q[1] != null))
    .map((p, i) => ({ i, layer: p.layer || "0", pts: p.pts, sqft: area(p.pts) / SQ_MM }));

  return { labels, shapes, layers,
    problems: [
      texts.length - labels.length ? (texts.length - labels.length) + " text entities had no position and were skipped" : null,
      polys.length - shapes.length ? (polys.length - shapes.length) + " polylines were open or malformed and carry no area" : null,
    ].filter(Boolean) };
}

// point in polygon . used to place a label inside a shape
function inside(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}

// ---- csv ---------------------------------------------------------------
function csv(text) {
  const rows = [], problems = [];
  const lines = String(text).split(/\r?\n/);
  let width = null;
  lines.forEach((ln, i) => {
    if (!ln.trim()) return;
    const cells = ln.match(/("([^"]|"")*"|[^,]*)(,|$)/g).slice(0, -1)
      .map(c => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
    if (width == null) width = cells.length;
    else if (cells.length !== width) problems.push("line " + (i + 1) + " has " + cells.length + " cells, the header had " + width);
    rows.push({ line: i + 1, cells });
  });
  return { rows, problems, width };
}

function sniff(name) {
  const n = String(name).toLowerCase();
  if (/\.xlsx?$/.test(n) || /\.xlsm$/.test(n)) return "xlsx";
  if (/\.dxf$/.test(n)) return "dxf";
  if (/\.csv$/.test(n) || /\.tsv$/.test(n)) return "csv";
  if (/\.pdf$/.test(n)) return "pdf";
  if (/\.(png|jpe?g|webp)$/.test(n)) return "image";
  if (/\.(docx?|txt|md)$/.test(n)) return "text";
  if (/\.dwg$/.test(n)) return "dwg";
  return null;
}

const READERS = { unescapeXml, xlsx, dxf, csv, sniff, serialToISO, inside, readSheet };
root.INGEST_READERS = READERS;
if (typeof module !== "undefined" && module.exports) module.exports = READERS;

})(typeof window !== "undefined" ? window : globalThis);
