// ===================================================================
// DnB-OS · platform/core/export.js
// Exports without dependencies:
//  - a genuine .xlsx workbook, built by hand (a zip with STORED
//    entries — no compression library needed) so Excel opens it clean
//  - a print document (browser print -> Save as PDF) that keeps the
//    design language
// ===================================================================

;(function () {

// ---- CRC32 (zip needs it) ------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
// utf-8 encoder with a fallback for environments without TextEncoder
const enc = (typeof TextEncoder !== "undefined") ? new TextEncoder() : {
  encode(s) {
    const out = [];
    for (const ch of String(s)) {
      let c = ch.codePointAt(0);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }
};

// ---- minimal ZIP writer (STORED = no compression, always valid) ----
function zipStore(files) {   // files: [{name, text}]
  const chunks = [], central = [];
  let offset = 0;
  const u16 = v => new Uint8Array([v & 255, (v >> 8) & 255]);
  const u32 = v => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
  files.forEach(f => {
    const name = enc.encode(f.name), data = enc.encode(f.text);
    const crc = crc32(data);
    const head = [u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)];
    const localLen = 30 + name.length;
    chunks.push(...head, name, data);
    central.push({ name, data, crc, offset });
    offset += localLen + data.length;
  });
  const cdStart = offset;
  central.forEach(e => {
    chunks.push(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(e.crc), u32(e.data.length), u32(e.data.length), u16(e.name.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.offset), e.name);
    offset += 46 + e.name.length;
  });
  chunks.push(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
    u32(offset - cdStart), u32(cdStart), u16(0));
  let total = 0; chunks.forEach(c => total += c.length);
  const out = new Uint8Array(total + 22 - 22 + 0);
  let p = 0; chunks.forEach(c => { out.set(c, p); p += c.length; });
  return out.slice(0, p);
}

// ---- minimal XLSX --------------------------------------------------
const xmlesc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function sheetXml(rows, freeze) {
  const pane = freeze && (freeze.x || freeze.y)
    ? `<sheetViews><sheetView workbookViewId="0"><pane ${freeze.x ? `xSplit="${freeze.x}" ` : ""}${freeze.y ? `ySplit="${freeze.y}" ` : ""}topLeftCell="${colName(freeze.x || 0)}${(freeze.y || 0) + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`
    : "";
  const rowsXml = rows.map((r, ri) =>
    `<row r="${ri + 1}">` + r.map((v, ci) => {
      const ref = colName(ci) + (ri + 1);
      if (typeof v === "number" && isFinite(v))
        return `<c r="${ref}" t="n"${ri === 0 ? ' s="1"' : ""}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${xmlesc(v)}</t></is></c>`;
    }).join("") + `</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<sheetData>${rowsXml}</sheetData></worksheet>`;
}
function colName(i) { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

function xlsx(sheets) {   // sheets: [{name, rows:[[..]]}]
  const files = [];
  files.push({ name: "[Content_Types].xml", text:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` });
  files.push({ name: "_rels/.rels", text:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
  files.push({ name: "xl/workbook.xml", text:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlesc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` });
  files.push({ name: "xl/_rels/workbook.xml.rels", text:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
  files.push({ name: "xl/styles.xml", text:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>` });
  sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s.rows, s.freeze) }));
  return zipStore(files);
}

// ---- download + print helpers (browser only) ------------------------
function download(filename, bytes, mime) {
  if (typeof URL === "undefined" || !URL.createObjectURL) return; // non-browser environment
  const blob = new Blob([bytes], { type: mime || "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function printDoc(html, autoPrint) {
  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups to export the PDF"); return null; }
  w.document.open(); w.document.write(html); w.document.close();
  if (autoPrint !== false) w.addEventListener ? setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 600) : null;
  return w;
}

const EXPORT = { xlsx, zipStore, crc32, download, printDoc, colName };
(function (g) { g.CORE_EXPORT = EXPORT; })(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = EXPORT;

})();
