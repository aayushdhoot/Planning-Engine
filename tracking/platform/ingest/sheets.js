// ===================================================================
// DnB-OS . platform/ingest/sheets.js . TAKING SIGNALS OUT OF A SHEET
// The xlsx reader opens a workbook and says what is in it: 999 rows,
// 1,102 numbers, 148 of which could be dates. That is a description, not
// knowledge. This module is the mapping layer the reader's own comment
// promised — it decides what a sheet IS, which column means what, and
// turns rows into signals that carry the cell they came out of.
//
//   ROLES                 the column meanings, declared
//   SHAPES                the sheet kinds the engine knows
//   headerBand(sheet)     which ROWS are the header — real sheets merge
//                         "Planned" over "Start | Finish"
//   profile(sheet)        what each column's DATA actually is
//   map(sheet, opts)      columns -> roles, plus the ones it will not name
//   classify(sheet, m)    which shape, with the evidence for it
//   extract(sheet, opts)  rows -> facts, plus what it refused and why
//
// THE LAWS
//   . THE HEADER IS A CLAIM, THE DATA IS THE EVIDENCE. A column headed
//     "RAG" that holds dates is not a RAG column. Where the two disagree
//     the disagreement is REPORTED and the column is left unnamed — real
//     sheets have merged cells, shifted headers and stale titles, and a
//     reader that trusts the header silently invents facts.
//   . TWO COLUMNS CLAIMING ONE ROLE MEANS NEITHER IS TAKEN. A sheet with
//     "Finish" over the planned column and "Finish" over the actual one
//     cannot be read by position without inventing which is which. Both
//     go to the confirm list; nothing is emitted from either.
//   . A COLUMN THE ENGINE CANNOT NAME IS ASKED ABOUT, ONCE. It comes back
//     with its header text and a sample of its values, a person says what
//     it is, and the mapping is remembered for that sheet. Guessing costs
//     a wrong date on every row; asking costs one sitting.
//   . START AND FINISH ARE ORDERED, AND THE ORDER IS TESTED. Where a date
//     column is unnamed, it is only taken as the start if it actually
//     falls on or before the finish on nearly every row that has both.
//     That is evidence, not an assumption — and the test is reported.
//   . EVERY VALUE CARRIES SHEET AND CELL. "Milestones!C8" is what makes a
//     date arguable. A fact without it is refused by facts.js anyway.
//   . A SHEET THAT MATCHES NO SHAPE IS REPORTED WITH ITS HEADERS. Never
//     read as the nearest thing.
//
// Pure: a parsed sheet in, facts out. No clock, no filesystem, no model.
// ===================================================================

;(function (root) {

const R = (typeof require !== "undefined") ? require("./readers.js") : root.INGEST_READERS;

// ---- what a column can mean -------------------------------------------
// `words` match the header text, longest match winning, so "actual start"
// beats "start" and "main task" beats "task". `data` is what the column's
// values must actually look like for the name to stand.
const ROLES = {
  // A SERIAL COLUMN IS MEANT TO BE MIXED. 1, 1.1, 1.2 then a, b, c is how
  // every BOQ numbers its sub-items; demanding one clean type refused the
  // column outright and left the lines with no identifier at all. Nothing is
  // ever computed from it, so mixing costs nothing.
  code:     { words: ["s.no", "sno", "s no", "sr.no", "sr no", "sl no", "sl.no", "item no", "code", "id", "ref"],
              data: ["text", "number", "mixed"] },
  // A DRAWING REGISTER IS KEPT BY TWO PARTIES AT ONCE. Flipspaces has a date
  // and a status; the client has their own. They disagree on purpose, and
  // collapsing them into one "end date" loses the very gap worth watching.
  startfs:  { words: ["start date (fs)", "start date fs"],                                  data: ["date"] },
  endfs:    { words: ["end date (fs)", "end date fs"],                                      data: ["date"] },
  endfsrev: { words: ["revised end date (fs)", "revised end date fs"],                      data: ["date"] },
  statusfs: { words: ["status (int)", "status int"],                                        data: ["text"] },
  endskf:   { words: ["end date (skf)", "end date skf"],                                    data: ["date"] },
  endskfrev:{ words: ["revised end date (skf)", "revised end date skf"],                    data: ["date"] },
  statusskf:{ words: ["status (skf)", "status skf"],                                        data: ["text"] },
  // A BOQ LINE SAYS WHERE IT APPLIES. Without this column a quantity has no
  // area to hang on, and the whole register of areas is decoration.
  location: { words: ["location", "zone", "room", "floor"],                                 data: ["text"] },
  // three rates and two amounts on one line is normal in a Flipspaces BOQ:
  // what it costs, what it sells for, and what the BCS carries. They are
  // different numbers and the longest header wins, so none shadows another.
  baserate: { words: ["basic rate", "base rate"],                                           data: ["number"] },
  // AN MEP LINE IS BOUGHT TWICE: the kit, and the labour to put it in. And
  // the sheet may say so in either order — "SUPPLY RATE" on Fire & Security,
  // "RATE(INR) SUPPLY" on PHE and Electrical, because the group heading is a
  // merged cell above and which half comes first is a layout choice. `all`
  // asks only that every word is somewhere in the header, so both read the
  // same; `not` keeps the BCS copy of the same four columns from claiming
  // the sale price's role. Matching on the ordered phrase left twelve of
  // PHE's sixteen columns nameless and the whole package unread.
  supplyrate:      { all: ["supply", "rate"],    not: ["bcs", "amount"],                    data: ["number"] },
  installrate:     { all: ["install", "rate"],   not: ["bcs", "amount"],                    data: ["number"] },
  totalrate:       { all: ["total", "rate"],     not: ["bcs", "amount"],                    data: ["number"] },
  supplyamount:    { all: ["supply", "amount"],  not: ["bcs", "rate"],                      data: ["number"] },
  installamount:   { all: ["install", "amount"], not: ["bcs", "rate"],                      data: ["number"] },
  totalamount:     { all: ["total", "amount"],   not: ["bcs", "rate"],                      data: ["number"] },
  // the BCS is the same bill again at cost. Same four columns, different
  // number, and they must never collapse into one another.
  bcssupplyrate:   { all: ["bcs", "supply", "rate"],    not: ["amount"],                    data: ["number"] },
  bcsinstallrate:  { all: ["bcs", "install", "rate"],   not: ["amount"],                    data: ["number"] },
  bcstotalrate:    { all: ["bcs", "total", "rate"],     not: ["amount"],                    data: ["number"] },
  bcssupplyamount: { all: ["bcs", "supply", "amount"],  not: ["rate"],                      data: ["number"] },
  bcsinstallamount:{ all: ["bcs", "install", "amount"], not: ["rate"],                      data: ["number"] },
  bcstotalamount:  { all: ["bcs", "total", "amount"],   not: ["rate"],                      data: ["number"] },
  bcsrate:  { words: ["bcs rate"],                                                          data: ["number"] },
  bcsamount:{ words: ["bcs amount"],                                                        data: ["number"] },
  ratepersft:{ words: ["rate per sft", "rate per sqft"],                                    data: ["number"] },
  margin:   { words: ["margin"],                                                            data: ["number"] },
  // the weekly task tracker's own vocabulary
  department:{ words: ["department", "dept", "stakeholder"],                                data: ["text"] },
  priority: { words: ["priority"],                                                          data: ["text"] },
  dependson:{ words: ["depends on", "blocked by", "gate"],                                  data: ["text"] },
  progress: { words: ["progress %", "% complete", "percent complete", "% done"],            data: ["number"] },
  due:      { words: ["due date", "due", "by when"],                                        data: ["date"] },
  scope:    { words: ["scope", "package", "head"],                                          data: ["text"] },
  maintask: { words: ["main task", "activity"],                                             data: ["text"] },
  name:     { words: ["sub-task", "sub task", "milestone", "drawing name", "particulars",
                      "floor type", "design change", "items", "item", "task", "work",
                      // an approved-makes list heads its subject column "MATERIAL"
                      "material"],                                                          data: ["text"] },
  // A REGISTER OFTEN CARRIES BOTH. "ITEMS" names the thing; "DESCRIPTION"
  // says more about it. Reading them as two claims on one role meant the
  // duplicate law refused both and the sheet became unreadable.
  description:{ words: ["description", "discription", "note", "remark detail"],              data: ["text"] },
  criticality:{ words: ["criticality", "priority level"],                                    data: ["text"] },
  revision: { words: ["revision", "rev no"],                                                 data: ["text", "number"] },
  start:    { words: ["start", "planned start", "commence", "from date"],                   data: ["date"] },
  finish:   { words: ["finish", "end date", "completion", "planned finish", "to date"],     data: ["date"] },
  actstart: { words: ["actual start", "act start", "actual commence"],                      data: ["date"] },
  actfinish:{ words: ["actual finish", "act finish", "actual completion"],                  data: ["date"] },
  duration: { words: ["duration", "no of days", "days"],                                    data: ["number"] },
  status:   { words: ["status", "rag"],                                                     data: ["text"] },
  remarks:  { words: ["remark", "remarks", "note", "comment"],                              data: ["text"] },
  qty:      { words: ["qty", "quantity", "total qty", "nos.", "no of", "sqft", "sqm", "rmt"], data: ["number"] },
  unit:     { words: ["unit", "uom"],                                                       data: ["text"] },
  rate:     { words: ["rate", "unit rate", "price", "mrp"],                                 data: ["number"] },
  // "TOTAL" ON ITS OWN IS NOT MONEY. On HVAC_VAV it heads the quantity
  // column — every money column on that sheet is already named supply rate,
  // install rate, supply amount, install amount — and reading it as an amount
  // put "12" on the books as twelve rupees for a VAV box. It is genuinely
  // ambiguous, so it is asked about rather than guessed. "TOTAL AMOUNT" and
  // "TOTAL RATE" still resolve, through totalamount and totalrate.
  amount:   { words: ["amount", "value"],                                                   data: ["number"] },
  target:   { words: ["target date", "required by", "need by", "needed on", "target"],      data: ["date"] },
  approval: { words: ["approval date", "tds", "sample approval"],                           data: ["date"] },
  receipt:  { words: ["receipt date", "material receipt", "delivery date", "grn"],          data: ["date"] },
  vendor:   { words: ["vendor", "supplier", "make", "brand", "agency"],                     data: ["text"] },
  owner:    { words: ["owner", "responsible", "assigned", "by whom"],                       data: ["text"] },
  // ---- the RA billing ladder ------------------------------------------
  // WHAT TRIGGERS MONEY IS A SIGNAL THE ENGINE WAS BLIND TO. The register
  // says a missing `payment` blocks RA staging, cashflow and any value on a
  // slipped milestone — and the one sheet that answers it, an unnamed
  // "Sheet4" holding ₹8.21 Cr against days 0, 20, 40, 55, 70 and 75, matched
  // no shape at all and was never read.
  // "RA" IS TWO LETTERS AND THEY ARE INSIDE "RATE". A substring rule cannot
  // have it: `is` demands the header be exactly this and nothing else, which
  // is the only safe way to name a column whose heading is an abbreviation.
  stage:    { is: ["ra", "ra no", "ra stage"], words: ["bill no", "invoice no"],            data: ["text", "number", "mixed"] },
  dayoffset:{ is: ["day", "days"], words: ["days from start", "day no"],                    data: ["number"] },
  pctpay:   { words: ["% payment", "percent payment", "payment %", "% of contract"],        data: ["number"] },
  // the same money twice, and they must not collapse into one `amount`
  amountexgst: { all: ["amount", "exclu"],                                                  data: ["number"] },
  amountincgst:{ all: ["amount", "gst"], not: ["exclu"],                                    data: ["number"] },
  // ---- a count matrix by room type -------------------------------------
  // "Description of Location" down the side, point types across the top.
  places:   { words: ["no of location", "no of locations", "no. of location", "count of location"], data: ["number"] },
  // "TOTAL NETWORK PORT" IS THE GROUP HEADING OVER THREE COLUMNS, NOT ONE OF
  // THEM. Active, redundant and the sum all sit under it, so naming the group
  // made three columns claim one role and the duplicate law refused all three
  // — losing the one number that says how many data points this floor really
  // has. Each column is named by its OWN heading; the group only qualifies.
  points:   { all: ["total points"],                                                        data: ["number"] },
  activedata:    { all: ["total", "active data"],                                           data: ["number"] },
  redundantdata: { all: ["total", "redundant data"],                                        data: ["number"] },
};

// ---- what a whole sheet can be ----------------------------------------
const SHAPES = {
  milestones:      { name: "Milestone list",   needs: ["name", "start", "finish"],
                     hints: ["milestone"],                  gives: ["milestone", "duration"] },
  taskplan:        { name: "Task plan",        needs: ["name", "start", "finish"],
                     hints: ["sub-task", "main task", "scope"], gives: ["milestone", "duration", "status"] },
  materialtracker: { name: "Material tracker", needs: ["name", "target"],
                     hints: ["items", "target date", "lead"], gives: ["material", "leadtime", "status"] },
  boq:             { name: "Priced BOQ",       needs: ["name", "qty", "rate"],
                     hints: ["boq", "bill of quant", "bcs"], gives: ["quantity", "rate", "spec"] },
  boqsplit:        { name: "Priced BOQ, supply and installation split",
                     needs: ["name", "qty", "supplyrate"],
                     hints: ["supply rate", "installation rate"], gives: ["quantity", "rate", "spec"] },
  drawingregister: { name: "Drawing release register", needs: ["name", "endfs"],
                     hints: ["drawing name", "criticality", "revision"],
                     gives: ["milestone", "status", "dependency"] },
  register:        { name: "Item register", needs: ["code", "name"],
                     hints: ["location", "make", "qty"], gives: ["material", "spec", "status"] },
  costsummary:     { name: "Cost head summary", needs: ["scope", "amount"],
                     hints: ["cost head", "summary"],        gives: ["rate", "payment"] },
  tasktracker:     { name: "Task tracker",     needs: ["name", "status"],
                     hints: ["department", "priority", "depends on", "task tracker"],
                     gives: ["status", "owner", "dependency"] },
  // THE BILL IS RAISED AGAINST WORK, AND THE SHEET SAYS WHICH WORK. Five
  // stages, a day offset, a percentage and the milestone that releases it.
  // This is the only document in the project that answers "what triggers
  // money", and the whole payment signal hung on it.
  paymentplan:     { name: "RA billing ladder", needs: ["stage", "pctpay"],
                     hints: ["ra", "% payment", "milestone"],
                     gives: ["payment", "milestone"] },
  // COUNTS BY ROOM TYPE ARE QUANTITIES WITH AN ADDRESS ALREADY ON THEM.
  // 305 workstations, 6 cabins, 6 four-pax meeting rooms — the node break-up
  // names the same rooms the area register does, so its counts land straight
  // on areas instead of being spread by floor share.
  countmatrix:     { name: "Count by room type", needs: ["name", "places"],
                     hints: ["description of location", "no of location", "total points"],
                     gives: ["quantity", "area", "countable"] },
  // WHICH BRAND IS APPROVED IS BOTH A SPEC AND A MARK. It tells procurement
  // what may be bought, and it tells a camera how to tell Kajaria tile from
  // something that merely looks like it.
  // A SHEET THE ENGINE CAN NAME NO COLUMN ON IS STILL A SHEET SOMEBODY WROTE.
  // The BOQ's General Notes carries the inclusions, the exclusions and who
  // supplies power and water, in sentences, and there is no column to name
  // and never will be. Refusing it left the contract's own terms unread.
  // This records each line VERBATIM with its cell — no structure invented,
  // nothing interpreted — so the text is on the log, addressable, and can be
  // compared later. It is tried last, and ONLY where the engine named no
  // column at all: a sheet with roles but no shape is a gap in the shape
  // list, and that has to stay visible rather than be swallowed here.
  // ONE NAMED COLUMN IS NOT A TABLE. "Critical Points" has a cell reading
  // "Make: Spacewood, AFC, Featherlite" and the word "make" named it vendor
  // — one accidental hit on a sheet with no header row at all. Demanding
  // ZERO named columns let a single coincidence keep two sheets unread.
  notes:           { name: "A sheet of notes", needs: [], onlyIfFewerRolesThan: 2,
                     hints: ["general notes", "notes", "non negotiable"],
                     gives: ["spec", "payment", "dependency", "timings"] },
  makelist:        { name: "Approved makes", needs: ["name", "vendor"],
                     hints: ["proposed makes", "make list", "approved make"],
                     gives: ["spec", "marks"] },
  // WHAT WAS CHOSEN, AND FOR WHICH ROOM. The GFC tracker's flooring, light
  // fixture and furniture tabs carry no rate at all — they are the selection
  // record: this item, this make, this room, and a reference image beside a
  // render. That last pair is exactly what a camera needs to tell the chosen
  // tile from one that merely looks like it, so these sheets answer `marks`
  // even though they answer nothing about money.
  // THE SHEET NAME IS THE ITEM, AND THE ROWS ARE PLACES. The GFC tracker's
  // CHAIR tab has a location and a quantity and no item column at all —
  // because every row is a chair. Refusing it lost 399 chairs and the rooms
  // they go in, which is the one thing that lets the trade run in parallel.
  countbylocation: { name: "Count by location", needs: ["location", "qty"],
                     hints: ["no. of qty", "no of qty", "reference image"],
                     gives: ["quantity", "area", "countable"] },
  selection:       { name: "Item selection by room", needs: ["name", "location"],
                     hints: ["render image", "reference image", "image", "make"],
                     gives: ["spec", "marks", "area"] },
};

// A ROLE THAT CAN STAND IN FOR ANOTHER. "DESCRIPTION" is the item column on
// a BOQ and the detail column on a register — which it is depends on whether
// the sheet also has an ITEMS column. So it is its own role, and it satisfies
// `name` when nothing better does. Splitting them without this made every
// BOQ whose item column is headed DESCRIPTION unreadable.
const STANDS_IN = { name: ["description", "maintask", "scope"] };

// THE SECOND COPY OF THE SAME COLUMN IS THE COST COPY. A Flipspaces bill
// prices every line twice — what it sells for, then what the BCS carries —
// and where the sheet forgets to write "BCS" over the second block, the two
// are word-for-word identical. This says which role the later duplicate
// takes. It is used ONLY when a BCS block has already been named further
// left on the same sheet, so the position has evidence behind it.
const ALTERNATE = {
  supplyrate: "bcssupplyrate", installrate: "bcsinstallrate", totalrate: "bcstotalrate",
  supplyamount: "bcssupplyamount", installamount: "bcsinstallamount", totalamount: "bcstotalamount",
  rate: "bcsrate", amount: "bcsamount",
};

const isDate = (n) => n != null && R.serialToISO(n) != null;
// ASK THE CELL, NOT THE NUMBER. Excel writes the answer into the cell's
// style, and the reader hands it over as `dated`. Only when a workbook has
// no styles at all does this fall back to "is the serial in the 1990-2100
// window" — which cannot tell 33,839 rupees from 24 August 1992, and read a
// whole HVAC rate column as dates. Belt and braces: even a date-formatted
// cell must hold a serial that lands in a believable range.
const cellIsDate = (c) => {
  if (!c || c.num == null || !isFinite(c.num)) return false;
  if (c.dated === true)  return isDate(c.num);
  if (c.dated === false) return false;
  return isDate(c.num);                       // no styles in the workbook
};
const clean  = (s) => String(s == null ? "" : s).replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// "S NO ." · "SR . NO" · "SR NO." are all the serial column. A person's
// spacing around a full stop is not a different column, and matching on the
// raw string means the same header reads differently on three sheets.
const tidy = (h) => String(h || "").toLowerCase()
  .replace(/\s*\.\s*/g, ".").replace(/\s+/g, " ").replace(/\.$/, "").trim();

// spreadsheet column letters are base-26 with no zero: A=1 … Z=26, AA=27
const colNum = (s) => String(s).split("").reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
const colName = (n) => { let s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; } return s; };

// ---- which ROWS are the header ----------------------------------------
// A header row has several text cells and few dates. Real sheets split it:
// a merged "Planned" over "Start | Finish". So the band is one row plus
// any immediately following rows that also look like header.
function headerBand(sheet, limit) {
  const scan = (sheet.rows || []).slice(0, limit || 12);
  const looks = (row) => {
    let text = 0, dates = 0, n = 0;
    for (const k of Object.keys(row.cells)) {
      const c = row.cells[k]; n++;
      if (c.num != null && isFinite(c.num)) { if (cellIsDate(c)) dates++; }
      else if (typeof c.v === "string" && c.v.trim()) text++;
    }
    // a stray date in a header row is common (a print date in the corner);
    // a header row full of them is a data row
    let nums = 0;
    for (const k of Object.keys(row.cells)) { const c = row.cells[k];
      if (c.num != null && isFinite(c.num) && !cellIsDate(c)) nums++; }
    return { ok: text >= 2 && dates / Math.max(1, n) <= 0.25, text, dates, nums, n };
  };
  let startRow = null, best = 0;
  for (const row of scan) {
    const v = looks(row);
    if (v.ok && v.text > best) { best = v.text; startRow = row.r; }
  }
  if (startRow == null) return { rows: [], last: null,
    why: "no row in the first " + (limit || 12) + " looks like a header — two or more text cells and few dates" };
  // A SPLIT HEADER CARRIES NO DATES AT ALL. "Planned" over "Start | Finish"
  // is a label row. A row with a date in it is data, however wordy it looks,
  // and swallowing it into the band silently drops that row's facts.
  // A HEADER BAND GROWS BOTH WAYS. "7TH FLOOR" merged across three columns
  // sits ABOVE "SUPPLY | INSTALLATION | TOTAL" as often as "Planned" sits
  // above "Start | Finish"; reading only downward leaves four columns all
  // called TOTAL and no way to tell them apart.
  const label = (row) => { const v = looks(row); return v.ok && v.dates === 0 && v.nums <= 1; };

  // A WORDY DATA ROW LOOKS EXACTLY LIKE THE SECOND HALF OF A HEADER, and on
  // the RA ladder that is precisely what row 6 is: "Advance | 0 | No Advance
  // | RA 2 | RA02" — four text cells and one number, indistinguishable from
  // "SUPPLY | INSTALLATION | TOTAL" by counting. What tells them apart is
  // WHERE the text sits. In a real split header the lower row fills columns
  // the upper row left empty, or sits under a cell the sheet MERGED across
  // or down — that merge is the sheet saying "this heading covers what is
  // below and beside it". Two independent headings stacked in one plain
  // column is not a split header; it is a header and then a row of data.
  // Absorbing it read "RA" as "RA Advance" and lost the payment ladder.
  const anchor = {};
  for (const g of (sheet.merges || [])) anchor[g.c1 + g.r1] = 1;
  const stacksOnPlain = (cand, baseRow) => {
    const base = scan.find(x => x.r === baseRow);
    if (!base) return false;
    for (const k of Object.keys(cand.cells)) {
      const c = cand.cells[k];
      if (!(typeof c.v === "string" && c.v.trim())) continue;
      const up = base.cells[c.col + baseRow];
      if (up && typeof up.v === "string" && up.v.trim() && !anchor[c.col + baseRow]) return true;
    }
    return false;
  };

  const rows = [startRow];
  for (const row of scan) {                       // downward
    if (row.r !== rows[rows.length - 1] + 1) continue;
    if (rows.length >= 3) break;
    if (label(row) && !stacksOnPlain(row, rows[rows.length - 1])) rows.push(row.r);
  }
  // THE SHEET ALREADY SAYS HOW TALL ITS HEADER IS. A1 merged down to A3 is
  // Excel stating that rows 1 to 3 are one header cell. Growing row by row
  // cannot see that when the middle row is empty — it holds no cells, so it
  // is not in the scan at all, adjacency breaks, and the band stops at row 1.
  // On UPS that left the real headings (QTY, RATE) sitting in the data and
  // every column named after the group heading "7TH FLOOR".
  // A MERGE SAYS HOW TALL, THE ROW SAYS WHETHER IT IS HEADER. On the RA
  // ladder a merge anchored in the header row reaches down into the first
  // DATA row, and taking the merge's word for it read "RA" as "RA Advance"
  // and "Day" as "Day 0" — the header absorbed the Advance line and the
  // whole payment ladder became unreadable. So the merge may only extend
  // across rows that hold nothing at all, or that still look like a label.
  let deepest = startRow;
  for (const g of (sheet.merges || []))
    if (g.r1 === startRow && g.r2 > deepest && g.r2 <= startRow + 3) deepest = g.r2;
  for (let r = rows[rows.length - 1] + 1; r <= deepest; r++) {
    const here = scan.find(x => x.r === r);
    if (here && !label(here)) break;             // data — the header stopped above this
    if (rows.indexOf(r) === -1) rows.push(r);
  }
  const above = scan.filter(r => r.r === rows[0] - 1)[0];
  if (above && rows.length < 3 && label(above)) rows.unshift(above.r);
  rows.sort((a, b) => a - b);
  return { rows, last: rows[rows.length - 1],
    why: rows.length > 1
      ? "rows " + rows.join(" and ") + " read together — the header is split across them"
      : "row " + rows[0] + " carries " + best + " text cells and few dates" };
}

// ---- what each column's data actually is ------------------------------
// A NUMBER TYPED AS TEXT IS STILL A NUMBER. A cell holding the string "0"
// is a formatting accident — somebody pasted a column in as text — not a
// different kind of value. Counting it as text made PHE's quantity column
// 54% numeric, below the two-thirds bar, so the whole column was refused
// and eleven real quantities went with it. What must NOT happen is the
// reverse: "NOS", "RO", a description, a unit stay text, and a column that
// is mostly words is still a text column.
const numish = (s) => typeof s === "string" && s.trim() !== "" &&
  /^-?[\d,]*\.?\d+$/.test(s.trim().replace(/\s/g, "")) && isFinite(Number(s.replace(/,/g, "")));

function profile(sheet, fromRow) {
  const cols = {};
  for (const row of (sheet.rows || [])) {
    if (fromRow != null && row.r <= fromRow) continue;
    for (const k of Object.keys(row.cells)) {
      const c = row.cells[k], col = c.col;
      const p = cols[col] = cols[col] || { col, date: 0, number: 0, text: 0, n: 0, asText: 0, sample: [] };
      p.n++;
      if (c.num != null && isFinite(c.num)) { cellIsDate(c) ? p.date++ : p.number++; }
      else if (numish(c.v)) { p.number++; p.asText++; }
      else if (typeof c.v === "string" && c.v.trim()) p.text++;
      if (p.sample.length < 4) p.sample.push(cellIsDate(c) ? R.serialToISO(c.num)
        : (c.v != null ? clean(c.v).slice(0, 28) : String(c.num)));
    }
  }
  for (const col of Object.keys(cols)) {
    const p = cols[col], top = Math.max(p.date, p.number, p.text);
    // `top` is what the column mostly is; `is` is what it is CLEANLY. Keeping
    // both is what lets a mixed column still be read for the type it mostly
    // holds, with the odd cell out refused rather than the whole column.
    p.top = top === 0 ? "text" : top === p.date ? "date" : top === p.number ? "number" : "text";
    p.is = top / p.n >= 0.66 ? p.top : "mixed";
  }
  return cols;
}

// ---- the ordering test -------------------------------------------------
// Is column A, on the rows where both have a date, on or before column B?
// Returns the share that pass and the count tested. Evidence, not a guess.
function ordered(sheet, fromRow, colA, colB) {
  let both = 0, pass = 0;
  for (const row of (sheet.rows || [])) {
    if (fromRow != null && row.r <= fromRow) continue;
    const a = row.cells[colA + row.r], b = row.cells[colB + row.r];
    if (!a || !b || a.num == null || b.num == null || !cellIsDate(a) || !cellIsDate(b)) continue;
    both++; if (a.num <= b.num) pass++;
  }
  return { tested: both, pass, share: both ? pass / both : 0 };
}

// ---- columns to roles --------------------------------------------------
function map(sheet, opts) {
  const o = opts || {};

  const band = (o.headerRows && o.headerRows.length)
    ? { rows: o.headerRows, last: o.headerRows[o.headerRows.length - 1], why: "given" }
    : headerBand(sheet);
  const prof = profile(sheet, band.last);
  // HOW MANY ROWS THIS SHEET REALLY HAS. A workbook padded to 999 rows with a
  // serial number in column A has twenty-six rows of data and nine hundred of
  // nothing; measuring a column against the padding rejects every real column
  // on the sheet.
  const dataRows = (sheet.rows || []).filter(r =>
    (band.last == null || r.r > band.last) && Object.keys(r.cells).length >= 2).length;

  // the header text for a column is every band row's text for it, joined
  //
  // A GROUP HEADING SPANS ITS COLUMNS, AND THE SPAN IS THE SENTENCE. A BOQ
  // writes "RATE(INR)" once, merged across E:G, over "SUPPLY | INSTALLATION
  // | TOTAL" — and the file stores the words on E1 only. Joining band rows
  // cell by cell then yields one column called "RATE(INR) SUPPLY" and two
  // called "INSTALLATION" and "TOTAL", which name nothing: the same sheet
  // has four more columns with those exact headings under AMOUNT, BCS RATE
  // and BCS AMOUNT. Carrying the merge across its own columns — and ONLY
  // inside the header band, never into the data — is what turns twelve
  // nameless columns into supply rate, install rate, supply amount and the
  // rest. Without it PHE and Fire & Security read as zero facts each.
  const spanned = {};              // "col|row" -> the merged heading above it
  for (const g of (sheet.merges || [])) {
    if (g.c1 === g.c2) continue;                       // a vertical merge spans no columns
    if (band.rows.indexOf(g.r1) === -1) continue;      // header band only
    const src = ((sheet.rows || []).find(x => x.r === g.r1) || { cells: {} }).cells[g.c1 + g.r1];
    if (!src || typeof src.v !== "string" || !clean(src.v)) continue;
    for (let n = colNum(g.c1) + 1; n <= colNum(g.c2); n++) spanned[colName(n) + "|" + g.r1] = clean(src.v);
  }
  const headers = {};
  const add = (col, text) => { if (text) headers[col] = clean((headers[col] ? headers[col] + " " : "") + text); };
  for (const r of band.rows) {
    const row = (sheet.rows || []).find(x => x.r === r);
    if (!row) continue;
    const seen = {};
    for (const k of Object.keys(row.cells)) {
      const c = row.cells[k];
      if (typeof c.v === "string" && clean(c.v)) { add(c.col, clean(c.v)); seen[c.col] = 1; }
    }
    // the columns this row said nothing about, but a merge on this row covers
    Object.keys(spanned).forEach(k => { const [col, rr] = k.split("|");
      if (Number(rr) === r && !seen[col]) add(col, spanned[k]); });
  }

  const claims = {}, ambiguous = [], disagreed = [], notes = [];
  for (const col of Object.keys(prof)) {
    const p = prof[col];
    if (o.mapping && o.mapping[col]) { (claims[o.mapping[col]] = claims[o.mapping[col]] || []).push(col); continue; }
    const h = tidy(headers[col]);
    // THE LONGEST MATCH WINS, MEASURED IN CHARACTERS THAT ACTUALLY MATCHED.
    // "supply"+"rate" beats a bare "rate" by ten to four, and "bcs"+"supply"
    // +"rate" beats both — so the cost column never takes the sale column's
    // role, without a single ordering rule about which comes first.
    const ranked = [];
    for (const rid of Object.keys(ROLES)) {
      const R0 = ROLES[rid];
      let len = 0;
      // AN EXACT HEADER BEATS EVERY SUBSTRING. "RA" is the whole heading, not
      // a fragment of "RATE", and only saying so can tell the two apart.
      if (R0.is && h && R0.is.indexOf(h) !== -1) len = 1000;
      if (!len && R0.all) {
        if (!h || !R0.all.every(w => h.indexOf(w) !== -1)) continue;
        if ((R0.not || []).some(w => h.indexOf(w) !== -1)) continue;
        len = R0.all.reduce((t, w) => t + w.length, 0);
      } else if (!len) {
        for (const w of (R0.words || [])) if (h && h.indexOf(w) !== -1 && w.length > len) len = w.length;
      }
      if (len) ranked.push({ rid, len });
    }
    ranked.sort((a, b) => b.len - a.len);
    if (!ranked.length) {
      if (p.n >= 3) ambiguous.push({ col, header: headers[col] || null, is: p.is, n: p.n, sample: p.sample,
        reason: headers[col] ? "unknown_header" : "no_header",
        why: headers[col] ? "the header \"" + headers[col] + "\" matches no role the engine knows"
                          : "this column has no header at all" });
      continue;
    }
    // A MIXED COLUMN IS NOT A CONTRADICTED ONE. PHE's quantity column holds
    // twenty numbers and seventeen cells reading "RO"; neither type reaches
    // two thirds, so the column was "mixed" and refused whole — and twenty
    // real quantities went out with it. What the law forbids is naming a
    // column whose data CONTRADICTS its header. Where the majority of the
    // column agrees with the header, the column stands and the cells that
    // disagree are refused one by one, each with its own cell reference.
    const fits = (rid) => ROLES[rid].data.indexOf(p.is) !== -1 ||
      (p.is === "mixed" && ROLES[rid].data.indexOf(p.top) !== -1);
    // THE GROUP HEADING QUALIFIES, IT DOES NOT NAME. "7TH FLOOR" merged over
    // "QTY | RATE" makes the joined header read "7th floor qty", and "floor"
    // is a longer match than "qty" — so the quantity column claimed to be a
    // location, failed on type, and was dropped. Taking the next-best claim
    // that the data actually supports keeps the header's evidence AND the
    // data's, instead of throwing the column away when the two rank apart.
    const best2 = ranked.find(r => fits(r.rid));
    if (!best2) {
      disagreed.push({ col, header: headers[col], claimed: ranked[0].rid, is: p.is, n: p.n, sample: p.sample,
        why: "the header says \"" + headers[col] + "\" but the column holds " + p.is +
             " values — the engine will not name it on the header's word alone" });
      continue;
    }
    const claim = best2.rid;
    if (claim !== ranked[0].rid)
      notes.push({ note: "\"" + headers[col] + "\" (" + col + ") reads first as " + ranked[0].rid +
        ", but the column holds " + p.is + " values, so it is read as " + claim +
        " — the nearest naming the data supports" });
    if (p.is === "mixed")
      notes.push({ note: "\"" + headers[col] + "\" (" + col + ") is mostly " + p.top + " and read as " +
        claim + "; the " + (p.n - p[p.top]) + " cells that are not will be refused one by one" });
    // A HEADER OVER AN EMPTY COLUMN IS NOT A COLUMN. On a real programme the
    // word "Start" sits over a merged cell while the dates live one column
    // left. Naming the empty one takes the header's word over the sheet's
    // own contents, and every start date is then missed.
    // A HEADER OVER A COLUMN THE SHEET BARELY FILLS IS NOT A COLUMN. Measured
    // against the FULLEST column rather than as a flat count, so the rule
    // holds on a nine-row schedule and on a five-hundred-row bill alike: one
    // value beside a column of twenty-four is a merged-cell artefact, three
    // beside five is a small sheet doing its job.
    if (p.n < Math.max(2, dataRows * 0.15)) {
      ambiguous.push({ col, header: headers[col] || null, is: p.is, n: p.n, sample: p.sample,
        reason: "too_few",
        why: "the header reads \"" + headers[col] + "\" but the column holds " + p.n +
             " value" + (p.n === 1 ? "" : "s") + " across " + dataRows +
             " rows of data — too thin to name it on" });
      continue;
    }
    (claims[claim] = claims[claim] || []).push(col);
  }

  // TWO COLUMNS CLAIMING ONE ROLE MEANS NEITHER IS TAKEN — unless the sheet
  // has already said, further left, that a second copy of the bill starts
  // here. Fire & Security heads four columns "INSTALLATION RATE | AMOUNT"
  // twice: once for the sale price and once for the cost, and the second
  // pair sits to the RIGHT of a column the sheet did label "BCS SUPPLY".
  // A Flipspaces bill always carries the sale price first and the BCS second,
  // so the later duplicate is the BCS one. That is an inference from
  // position, taken because a person said to take it — and it is written on
  // to every fact it produces, so it can be argued with later.
  const roles = {}, inferred = {};
  for (const rid of Object.keys(claims)) {
    const cols = claims[rid].slice().sort((a, b) => colNum(a) - colNum(b));
    if (cols.length === 1) { roles[cols[0]] = rid; continue; }
    const alt = ALTERNATE[rid];
    // the alternate must be free, and the sheet must already show a BCS block
    // beginning left of the duplicate — otherwise this is a guess with nothing
    // behind it and the old refusal stands.
    const bcsStarts = Object.keys(claims).filter(r => /^bcs/.test(r))
      .map(r => Math.min(...claims[r].map(colNum)));
    const blockFrom = bcsStarts.length ? Math.min(...bcsStarts) : Infinity;
    if (o.infer !== false && alt && cols.length === 2 && !claims[alt] && colNum(cols[1]) > blockFrom) {
      roles[cols[0]] = rid; roles[cols[1]] = alt;
      inferred[cols[1]] = "the sheet heads " + cols[0] + " and " + cols[1] + " identically (\"" +
        headers[cols[1]] + "\"), and " + cols[1] + " sits inside the BCS block that opens at column " +
        colName(blockFrom) + " — so it is read as " + alt + ". Inferred from position, not stated.";
      notes.push({ note: inferred[cols[1]] });
      continue;
    }
    cols.forEach(col => ambiguous.push({ col, header: headers[col] || null,
      is: prof[col].is, n: prof[col].n, sample: prof[col].sample, reason: "duplicate_role",
      why: cols.length + " columns (" + cols.join(", ") + ") all read as \"" + rid +
           "\" — which is which cannot be told from the sheet, so none of them is used" }));
  }
  const byRole = {};
  Object.keys(roles).forEach(c => (byRole[roles[c]] = byRole[roles[c]] || []).push(c));

  // THE QUANTITY SITS BETWEEN THE UNIT AND THE FIRST RATE. On every priced
  // sheet in this bill the order is the same — serial, description, unit,
  // quantity, then the money. HVAC_VAV heads its quantity column just
  // "TOTAL", which names nothing on its own, and the column was left unread:
  // a priced package with rates, amounts and no quantity at all, so nothing
  // in it could ever be given a duration. Where the unit and the first rate
  // are both named, exactly one unnamed numeric column lies between them,
  // and no quantity has been found any other way, that column is the
  // quantity — and every fact it produces says it was read by position.
  if (o.infer !== false && !byRole.qty && (byRole.rate || byRole.supplyrate) && byRole.unit) {
    const uAt = colNum(byRole.unit[0]);
    const rAt = Math.min(...(byRole.rate || []).concat(byRole.supplyrate || []).map(colNum));
    const between = Object.keys(prof).filter(c => colNum(c) > uAt && colNum(c) < rAt)
      .filter(c => !roles[c] && (prof[c].is === "number" || prof[c].top === "number"));
    if (between.length === 1) {
      const col = between[0];
      roles[col] = "qty"; byRole.qty = [col];
      inferred[col] = "column " + col + " on \"" + sheet.name + "\" is headed \"" +
        (headers[col] || "(nothing)") + "\", which names no role. It is the only unnamed numeric " +
        "column between the unit in " + byRole.unit[0] + " and the first rate in " + colName(rAt) +
        ", which is where every priced sheet in this bill puts the quantity — so it is read as the " +
        "quantity. Inferred from position, not stated.";
      notes.push({ note: inferred[col] });
    } else if (between.length > 1) {
      notes.push({ problem: "\"" + sheet.name + "\" has " + between.length + " unnamed numeric columns (" +
        between.join(", ") + ") between the unit and the first rate — which one is the quantity cannot " +
        "be told by position either, so none is used" });
    }
  }

  // ---- the ordering law, only where a name is missing ------------------
  // A COLUMN THE ENGINE REFUSED TO NAME STAYS UNNAMED. The ordering law
  // exists to read a column nobody labelled, not to overrule a rejection —
  // two columns both headed "Finish" must not come back as start and finish.
  // ...but "nobody labelled this column" is precisely the case the ordering
  // law exists for. Only a column the engine actively REFUSED — two claiming
  // one role, a header its data contradicts, a header over an empty column —
  // stays out of reach.
  const REFUSED = ["duplicate_role", "too_few"];
  const rejected = {};
  ambiguous.filter(a => REFUSED.indexOf(a.reason) !== -1).forEach(a => rejected[a.col] = 1);
  disagreed.forEach(a => rejected[a.col] = 1);
  const unnamedDates = Object.keys(prof).filter(c => prof[c].is === "date" && !roles[c] && !rejected[c]);
  const fin = (byRole.finish || [])[0], st = (byRole.start || [])[0];
  if (!st && fin && unnamedDates.length) {
    // test EVERY unnamed date column against the finish. Exactly one that
    // consistently precedes it is the start; two would be a guess and are
    // reported instead.
    const tried = unnamedDates.map(c => ({ col: c, t: ordered(sheet, band.last, c, fin) }));
    const fit = tried.filter(x => x.t.tested >= 3 && x.t.share >= 0.9);
    if (fit.length === 1) {
      const w = fit[0];
      roles[w.col] = "start"; (byRole.start = byRole.start || []).push(w.col);
      notes.push({ note: "column " + w.col + " on \"" + sheet.name + "\" carries no Start header, but on " +
        w.t.pass + " of " + w.t.tested + " rows its date falls on or before the finish in column " + fin +
        " — read as the planned start, because nothing finishes before it begins" });
    } else if (fit.length > 1) {
      notes.push({ problem: "\"" + sheet.name + "\" has " + fit.length + " unnamed date columns (" +
        fit.map(f => f.col).join(", ") + ") that all precede the finish — which one is the planned start " +
        "cannot be told from the sheet, so none is used" });
    } else if (tried.some(x => x.t.tested)) {
      notes.push({ problem: "no unnamed date column on \"" + sheet.name + "\" consistently precedes the finish in " +
        fin + " — no planned start was taken" });
    }
  } else if (!st && !fin && unnamedDates.length === 2) {
    const t = ordered(sheet, band.last, unnamedDates[0], unnamedDates[1]);
    const rev = ordered(sheet, band.last, unnamedDates[1], unnamedDates[0]);
    const pick = (t.share >= 0.9 && t.tested >= 3) ? [unnamedDates[0], unnamedDates[1]]
              : (rev.share >= 0.9 && rev.tested >= 3) ? [unnamedDates[1], unnamedDates[0]] : null;
    if (pick) {
      roles[pick[0]] = "start"; roles[pick[1]] = "finish";
      byRole.start = [pick[0]]; byRole.finish = [pick[1]];
      notes.push({ note: "neither date column on \"" + sheet.name + "\" is headed Start or Finish; " + pick[0] +
        " is on or before " + pick[1] + " on " + Math.max(t.pass, rev.pass) + " of " + Math.max(t.tested, rev.tested) +
        " rows, so it is read as the start" });
    } else {
      notes.push({ problem: "\"" + sheet.name + "\" has two unnamed date columns (" + unnamedDates.join(", ") +
        ") and neither consistently precedes the other — no dates were taken from it" });
    }
  } else if (!st && unnamedDates.length > 2) {
    notes.push({ problem: "\"" + sheet.name + "\" has " + unnamedDates.length +
      " unnamed date columns (" + unnamedDates.join(", ") + ") — which pair belongs to which task cannot be told, so none is used" });
  }

  return { band, headers, profile: prof, roles, byRole, ambiguous, disagreed, notes, inferred,
    inferredStart: !!(byRole.start && !claims.start) };
}

// ---- is this a document, or a table? ----------------------------------
// A SHEET WITH NO SHAPE IS NOT ALWAYS A SHEET THE ENGINE FAILED TO READ.
// The BOQ's "General Notes" is 130 rows of sentences in one column — the
// inclusions, the exclusions, who supplies power and water, what triggers
// money. There is no column to name and never will be. Calling that "no
// shape the engine knows" files a document that needs a MODEL under the
// same heading as a table with a stale header, and the difference is the
// difference between "add a rule" and "send this to a reader".
function prose(sheet) {
  const rows = (sheet.rows || []);
  if (rows.length < 8) return null;
  let long = 0, nums = 0, cells = 0;
  const byCol = {};
  for (const row of rows) for (const k of Object.keys(row.cells)) {
    const c = row.cells[k]; cells++;
    if (c.num != null && isFinite(c.num)) { nums++; continue; }
    if (typeof c.v === "string" && clean(c.v).length >= 40) { long++; byCol[c.col] = (byCol[c.col] || 0) + 1; }
  }
  const top = Math.max(0, ...Object.values(byCol));
  // most of what is there is a sentence, the sentences sit in ONE column,
  // and there is hardly a number on the sheet
  return (long >= 6 && top / Math.max(1, long) >= 0.8 && nums / Math.max(1, cells) <= 0.2)
    ? { n: long, col: Object.keys(byCol).find(c => byCol[c] === top) } : null;
}

// ---- which shape ------------------------------------------------------
function classify(sheet, m) {
  const mm = m || map(sheet);
  const have = Object.keys(mm.byRole);
  const hay = (Object.values(mm.headers).join(" ") + " " + (sheet.name || "")).toLowerCase();
  const met = (r) => have.indexOf(r) !== -1 ||
    (STANDS_IN[r] || []).some(alt => have.indexOf(alt) !== -1);
  const scored = Object.keys(SHAPES).map(id => {
    const S = SHAPES[id];
    const missing = S.needs.filter(r => !met(r));
    // HINTS ARE WEIGHED IN CHARACTERS, NOT COUNTED. "make list" is nine
    // characters of evidence and "make" is four; counting them as one each
    // let the generic item register take the approved-makes sheet on a tie.
    const hit = (S.hints || []).filter(h => hay.indexOf(h) !== -1);
    const hints = hit.reduce((t, h) => t + h.length, 0);
    const blocked = S.onlyIfFewerRolesThan && have.length >= S.onlyIfFewerRolesThan;
    return { id, name: S.name, missing, hints, matched: hit, ok: missing.length === 0 && !blocked };
  // THE SHAPE THAT DEMANDS MORE WINS. A priced BOQ needs a name, a quantity
  // AND a rate; an item register needs only a code and a name, so every BOQ
  // sheet also satisfies "register". Sorting by hints first let the looser
  // shape take them, and Electrical went from 602 facts to 177 — a quiet
  // loss of two thirds of a package. Specificity first, hints only to break
  // a genuine tie.
  }).sort((a, b) => (b.ok - a.ok) ||
    (SHAPES[b.id].needs.length - SHAPES[a.id].needs.length) ||
    (b.hints - a.hints) || (a.missing.length - b.missing.length));
  const win = scored[0];
  if (!win || !win.ok) return { shape: null, candidates: scored,
    why: prose(sheet)
      ? "this sheet is PROSE, not a table — " + prose(sheet).n + " long text cells in one column and " +
        "almost no numbers. A BOQ's General Notes carries the inclusions, exclusions and payment " +
        "terms in sentences; refusing it as a shapeless table hides the fact that it needs a reader " +
        "that reads sentences, not columns. It is named here so it can be sent to one."
      : "this sheet matches no shape the engine knows. Headers found: " +
        (Object.values(mm.headers).join(" | ") || "none") + ". Roles named: " +
        (have.join(", ") || "none") + ".",
    prose: !!prose(sheet) };
  return { shape: win.id, name: win.name, hints: win.hints, candidates: scored, why: null };
}

// ---- rows to facts -----------------------------------------------------
function extract(sheet, opts) {
  const o = opts || {};
  const doc = o.doc || "(unnamed document)";
  const m = map(sheet, o);
  const cls = o.shape ? { shape: o.shape, name: (SHAPES[o.shape] || {}).name } : classify(sheet, m);
  const facts = [], refused = [], notes = m.notes.map(n => ({ doc, ...n }));
  let seq = 0;
  const nid = (k) => (o.idPrefix || "sh") + ":" + (sheet.name || "s") + ":" + k + ":" + (++seq);
  const at = (col, r) => (sheet.name || "sheet") + "!" + col + r;

  const confirm = m.ambiguous.concat(m.disagreed).map(a => ({ doc, sheet: sheet.name, ...a }));

  if (!cls.shape) return { facts, refused, notes, confirm, map: m, classify: cls, shape: null, why: cls.why };

  const c1 = (role) => (m.byRole[role] || [])[0];
  const cName = c1("name") || c1("description") || c1("maintask") || c1("scope"), cCode = c1("code");
  const cell = (row, col) => col ? row.cells[col + row.r] : null;
  const txt = (c) => c && typeof c.v === "string" && clean(c.v) ? clean(c.v) : null;
  // A NUMBER TYPED AS TEXT IS STILL A NUMBER — and the profile already counts
  // it as one, so reading it here too is what keeps the two halves of this
  // module telling the same story. Without it PHE's quantity column passed
  // the naming test and then produced nothing.
  const num = (c) => c && c.num != null && isFinite(c.num) ? c.num
    : (c && numish(c.v) ? Number(String(c.v).replace(/,/g, "")) : null);
  // the role travels with the fact: a planned start and a planned finish are
  // both dates about one subject and must never read as a disagreement
  // A NUMBER IN A DATE COLUMN THAT IS NOT A DATE IS REPORTED, NOT EMITTED.
  // A column is called a date column when two thirds of it are dates; the
  // other third is a stray count or a typo, and turning one into a fact
  // with a null value pushes the problem downstream where nobody can see
  // which cell it came from.
  const dateAt = (row, col, what, subject) => {
    const c = cell(row, col);
    const n = num(c);
    if (n == null) return null;
    const iso = R.serialToISO(n);
    if (iso) return iso;
    refused.push({ subject, why: at(col, row.r) + " holds " + n + ", which is not a date, in a column read as " +
      what + " — reported rather than carried through as an empty date" });
    return null;
  };
  // THE CELL THAT DOES NOT FIT ITS COLUMN IS NAMED, NOT SKIPPED. A column can
  // be the quantity column and still hold a word: PHE's holds "RO" seventeen
  // times. Reading past those in silence is how a package ends up with a
  // third of its lines quietly unquantified and a total that looks complete.
  // Each one is reported with its own cell reference so somebody can look.
  const numAt = (row, col, what, subject) => {
    const c = cell(row, col);
    if (!c) return null;
    const n = num(c);
    if (n != null) return n;
    if (typeof c.v === "string" && clean(c.v))
      refused.push({ subject, why: at(col, row.r) + " holds \"" + clean(c.v).slice(0, 24) +
        "\", which is not a number, in a column read as " + what +
        " — the line is left without one rather than counted as nothing" });
    return null;
  };
  // A FACT READ OUT OF AN INFERRED COLUMN CARRIES THE INFERENCE. The column
  // was named by where it sits, not by what the sheet calls it, and anybody
  // reading this number three months from now has to be able to see that
  // without going back to the workbook. It also drops the confidence from
  // stated to derived, so the materiality gate treats it as the softer thing
  // it is — a positional read is not a document saying so.
  const push = (kind, subject, value, unit, conf, col, row, read, note) => {
    const inf = m.inferred && m.inferred[col];
    facts.push({ id: nid(read.replace(/\W+/g, "")), kind, subject, role: read, value, unit,
      conf: inf ? "derived" : conf,
      note: [note, inf].filter(Boolean).join(". ") || null,
      inferred: inf ? true : undefined,
      source: { doc, where: at(col, row.r), read } });
  };

  for (const row of (sheet.rows || [])) {
    if (m.band.last != null && row.r <= m.band.last) continue;

    // A LINE SOMEBODY WROTE, KEPT AS THEY WROTE IT. No structure is invented
    // and nothing is interpreted — the sentence is recorded against the cell
    // it sits in, so it is on the log, searchable, and arguable. What it
    // MEANS is a later question, and one for a reader that reads sentences.
    if (cls.shape === "notes") {
      const cols = Object.keys(row.cells)
        .sort((a, b) => colNum(a.replace(/\d+$/, "")) - colNum(b.replace(/\d+$/, "")));
      const parts = cols.map(k => txt(row.cells[k])).filter(Boolean);
      const line = parts.join(" — ").trim();
      // a row of one short word is a heading or a stray, not a clause
      if (line.length >= 12) {
        const at1 = row.cells[cols[0]].col;
        push("term", (sheet.name || "notes") + " · line " + row.r, line, "text", "stated",
          at1, row, "stated in the notes");
      }
    }

    if (cls.shape === "notes") continue;   // it has no subject column, and needs none

    let subject = txt(cell(row, cName)) || txt(cell(row, cCode));
    if (!subject) continue;                       // a value with no subject is not a fact
    // A PRICED LINE WITH NO DESCRIPTION IS A SUB-TOTAL, NOT A LINE. Falling
    // back to the serial number turns "1179" into an item and puts a section
    // total beside a unit rate.
    const priced = cls.shape === "boq" || cls.shape === "boqsplit";
    if (priced && !txt(cell(row, cName))) continue;
    // THE SHEET IS THE PACKAGE, AND IT IS PART OF THE ITEM'S NAME. The same
    // description under Civil Works and under Toilet Works is two lines with
    // two quantities; keyed on the description alone they read as one line
    // that the bill disagrees with itself about.
    if (priced || cls.shape === "costsummary") subject = (sheet.name || "") + " · " + subject;
    const code = txt(cell(row, cCode));
    const scope = txt(cell(row, c1("scope")));
    const tag = [code ? "code " + code : null, scope && scope !== subject ? "under " + scope : null]
      .filter(Boolean).join(", ");

    if (cls.shape === "milestones" || cls.shape === "taskplan") {
      const cs = c1("start"), cf = c1("finish");
      const a = dateAt(row, cs, "the planned start", subject), b = dateAt(row, cf, "the planned finish", subject);
      const conf = m.inferredStart ? "inferred" : "stated";
      if (a != null) push("date", subject, a, "iso", conf, cs, row, "planned start",
        [tag, m.inferredStart ? "column read as the start by the ordering test, not by a header" : null].filter(Boolean).join(". ") || null);
      if (b != null) push("date", subject, b, "iso", conf, cf, row, "planned finish", tag || null);
      if (a != null && b != null && b < a)
        refused.push({ subject, why: "finish " + b + " is before start " + a +
          " on row " + row.r + " of \"" + sheet.name + "\" — reported, not silently swapped" });
      const as = dateAt(row, c1("actstart"), "the actual start", subject), af = dateAt(row, c1("actfinish"), "the actual finish", subject);
      if (as != null) push("date", subject, as, "iso", "stated", c1("actstart"), row, "actual start",
        "as the sheet claims it, not as the site confirmed it");
      if (af != null) push("date", subject, af, "iso", "stated", c1("actfinish"), row, "actual finish",
        "as the sheet claims it, not as the site confirmed it");
      const dur = num(cell(row, c1("duration")));
      if (dur != null && dur > 0 && dur < 3000)
        push("duration", subject, dur, "days", "stated", c1("duration"), row, "planned duration",
          "as the sheet states it, not as the engine derives it from quantity");
      const st = txt(cell(row, c1("status")));
      if (st) push("term", subject, st, "text", "stated", c1("status"), row, "declared status",
        "a claim in a cell, not a confirmed actual");
    }

    if (cls.shape === "materialtracker") {
      const ct = c1("target"), ca = c1("approval"), cr = c1("receipt");
      const t = dateAt(row, ct, "the needed-by date", subject), ap = dateAt(row, ca, "the approval date", subject),
            rc = dateAt(row, cr, "the receipt date", subject);
      // the column's own words, not the engine's. A sheet headed "Target
      // Closure Date" is not saying "needed on site by", and paraphrasing it
      // is how a fact stops meaning what its source meant.
      const tWord = (m.headers[ct] || "target date").toLowerCase();
      if (t != null)  push("date", subject, t,  "iso", "stated", ct, row, tWord, tag || null);
      if (ap != null) push("date", subject, ap, "iso", "stated", ca, row, "sample or TDS approval");
      if (rc != null) push("date", subject, rc, "iso", "stated", cr, row, "material receipt");
      const st = txt(cell(row, c1("status")));
      if (st) push("term", subject, st, "text", "stated", c1("status"), row, "procurement status");
      const vd = txt(cell(row, c1("vendor")));
      if (vd) push("scope", subject, vd, "text", "stated", c1("vendor"), row, "vendor or make");
      // LEAD TIME IS ARITHMETIC ON TWO DATES, NOT A GUESS
      if (t != null && rc != null) {
        const days = Math.round((Date.parse(rc) - Date.parse(t)) / 86400000);
        facts.push({ id: nid("lead"), kind: "duration", subject, role: "lead time", value: days, unit: "days", conf: "derived",
          note: days > 0 ? "arrived " + days + " days after it was needed"
                         : days < 0 ? "arrived " + (-days) + " days before it was needed" : "arrived on the day it was needed",
          source: { doc, where: at(ct, row.r) + " and " + at(cr, row.r), read: "receipt date minus needed-by date" } });
      }
    }

    if (cls.shape === "costsummary") {
      const cam = c1("amount"), cbc = c1("bcsamount"), cps = c1("ratepersft");
      const am = num(cell(row, cam)), bc = num(cell(row, cbc)), ps = num(cell(row, cps));
      if (am != null) push("money", subject, am, "INR", "measured", cam, row, "cost head amount");
      if (bc != null) push("money", subject, bc, "INR", "measured", cbc, row, "cost head BCS amount");
      if (ps != null) push("rate",  subject, ps, "INR/sqft", "measured", cps, row, "rate per sqft");
    }

    if (cls.shape === "tasktracker") {
      const st = txt(cell(row, c1("status")));
      const rk = txt(cell(row, c1("remarks")));
      if (st) push("term", subject, st, "text", "stated", c1("status"), row, "declared status",
        ["a claim in a cell, not a confirmed actual", rk ? "remark: " + rk : null].filter(Boolean).join(". "));
      const dp = txt(cell(row, c1("department")));
      if (dp) push("scope", subject, dp, "text", "stated", c1("department"), row, "stakeholder department");
      const ow = txt(cell(row, c1("owner")));
      if (ow) push("person", subject, ow, "name", "stated", c1("owner"), row, "owner");
      const dep = txt(cell(row, c1("dependson")));
      if (dep && dep !== "\u2014" && dep !== "-") push("term", subject, dep, "text", "stated",
        c1("dependson"), row, "depends on", "somebody else owes this before the work can start");
      const du = dateAt(row, c1("due"), "the due date", subject);
      if (du) push("date", subject, du, "iso", "stated", c1("due"), row, "due");
      const pg = num(cell(row, c1("progress")));
      // A PERCENT IS A CLAIM, NOT A MEASUREMENT, AND NEVER READS AS DONE.
      if (pg != null) push("term", subject, pg + "%", "text", "stated", c1("progress"), row, "progress claimed",
        "claimed by whoever filled the sheet; it is not a measurement and 100 is not done");
    }

    if (cls.shape === "drawingregister") {
      const g = (r) => dateAt(row, c1(r), r, subject);
      const efs = g("endfs"), rfs = g("endfsrev"), eskf = g("endskf"), rskf = g("endskfrev");
      const sfs = g("startfs");
      if (sfs)  push("date", subject, sfs,  "iso", "stated", c1("startfs"), row, "drawing start (Flipspaces)");
      if (efs)  push("date", subject, efs,  "iso", "stated", c1("endfs"),   row, "drawing due (Flipspaces)");
      if (rfs)  push("date", subject, rfs,  "iso", "stated", c1("endfsrev"),row, "drawing due, revised (Flipspaces)");
      if (eskf) push("date", subject, eskf, "iso", "stated", c1("endskf"),  row, "drawing due (client)");
      if (rskf) push("date", subject, rskf, "iso", "stated", c1("endskfrev"),row,"drawing due, revised (client)");
      const st1 = txt(cell(row, c1("statusfs"))), st2 = txt(cell(row, c1("statusskf")));
      if (st1) push("term", subject, st1, "text", "stated", c1("statusfs"), row, "drawing status (Flipspaces)");
      if (st2) push("term", subject, st2, "text", "stated", c1("statusskf"), row, "drawing status (client)");
      const cr = txt(cell(row, c1("criticality")));
      if (cr) push("term", subject, cr, "text", "stated", c1("criticality"), row, "criticality");
      const rv = txt(cell(row, c1("revision"))) || num(cell(row, c1("revision")));
      if (rv != null) push("scope", subject, String(rv), "text", "stated", c1("revision"), row, "revision");
      // A DATE THAT MOVED IS THE POINT OF A REGISTER. Both stand; the slip
      // is arithmetic on them and says which two it came from.
      if (efs && rfs && rfs !== efs)
        facts.push({ id: nid("dwgslip"), kind: "duration", subject, role: "drawing slip",
          value: Math.round((Date.parse(rfs) - Date.parse(efs)) / 86400000), unit: "days", conf: "derived",
          note: "due " + efs + ", revised to " + rfs,
          source: { doc, where: at(c1("endfs"), row.r) + " and " + at(c1("endfsrev"), row.r),
                    read: "revised due date minus original" } });
    }

    if (cls.shape === "register") {
      const q = num(cell(row, c1("qty"))), u = txt(cell(row, c1("unit")));
      const loc = txt(cell(row, c1("location"))), mk = txt(cell(row, c1("vendor")));
      const de = c1("description") === cName ? null : txt(cell(row, c1("description")));
      const st = txt(cell(row, c1("status")));
      if (q != null) push("quantity", subject, q, u || "(unit not stated)", "stated", c1("qty"), row,
        "register quantity", loc ? "at " + loc : null);
      if (loc) push("scope", subject, loc, "text", "stated", c1("location"), row, "location the item is for");
      if (mk)  push("scope", subject, mk,  "text", "stated", c1("vendor"),   row, "make");
      if (de)  push("scope", subject, de,  "text", "stated", c1("description"), row, "description");
      if (st)  push("term",  subject, st,  "text", "stated", c1("status"),   row, "register status");
    }

    if (cls.shape === "boqsplit") {
      const cq = c1("qty"), cu = c1("unit");
      const q = numAt(row, cq, "the quantity", subject), u = txt(cell(row, cu));
      const sr = num(cell(row, c1("supplyrate"))),  ir = num(cell(row, c1("installrate")));
      const sa = num(cell(row, c1("supplyamount"))), ia = num(cell(row, c1("installamount")));
      // THE BCS IS THE SAME LINE AT COST, AND IT IS WHAT THE MARGIN IS MADE OF.
      const br = num(cell(row, c1("bcssupplyrate"))),   bir = num(cell(row, c1("bcsinstallrate")));
      const ba = num(cell(row, c1("bcssupplyamount"))), bia = num(cell(row, c1("bcsinstallamount")));
      if (br  != null) push("rate",  subject, br,  "INR/" + (u || "(unit not stated)"), "measured", c1("bcssupplyrate"),  row, "BCS supply rate");
      if (bir != null) push("rate",  subject, bir, "INR/" + (u || "(unit not stated)"), "measured", c1("bcsinstallrate"), row, "BCS installation rate");
      if (ba  != null) push("money", subject, ba,  "INR", "measured", c1("bcssupplyamount"),  row, "BCS supply amount");
      if (bia != null) push("money", subject, bia, "INR", "measured", c1("bcsinstallamount"), row, "BCS installation amount");
      if (q  != null) push("quantity", subject, q, u || "(unit not stated)", "measured", cq, row, "priced BOQ quantity",
        [tag, u ? null : "the sheet states no unit for this line"].filter(Boolean).join(". ") || null);
      if (sr != null) push("rate",  subject, sr, "INR/" + (u || "(unit not stated)"), "measured", c1("supplyrate"),  row, "supply rate");
      if (ir != null) push("rate",  subject, ir, "INR/" + (u || "(unit not stated)"), "measured", c1("installrate"), row, "installation rate");
      if (sa != null) push("money", subject, sa, "INR", "measured", c1("supplyamount"),  row, "supply amount");
      if (ia != null) push("money", subject, ia, "INR", "measured", c1("installamount"), row, "installation amount");
      // THE LINE TOTAL IS ARITHMETIC ON TWO NUMBERS, AND IT SAYS SO
      if (sa != null && ia != null)
        facts.push({ id: nid("linetotal"), kind: "money", subject, role: "line total",
          value: sa + ia, unit: "INR", conf: "derived",
          note: "supply " + Math.round(sa) + " plus installation " + Math.round(ia),
          source: { doc, where: at(c1("supplyamount"), row.r) + " and " + at(c1("installamount"), row.r),
                    read: "supply amount plus installation amount" } });
    }

    // WHAT TRIGGERS MONEY. Five stages against days from start, each with a
    // percentage and the work that releases it. The day offset is deliberately
    // kept as a NUMBER OF DAYS, not turned into a date here: which day zero it
    // counts from is the plan's business, and there are five candidate start
    // dates on this project — resolving it in a spreadsheet reader would hide
    // that choice inside an ingest.
    if (cls.shape === "paymentplan") {
      const pc = num(cell(row, c1("pctpay")));
      const dy = num(cell(row, c1("dayoffset")));
      const ex = num(cell(row, c1("amountexgst"))) ?? num(cell(row, c1("amount")));
      const inc = num(cell(row, c1("amountincgst")));
      const ms = txt(cell(row, c1("name")));
      if (pc != null) push("term", subject, pc, "%", "stated", c1("pctpay"), row, "share of the contract this stage releases");
      if (dy != null) push("duration", subject, dy, "days", "stated", c1("dayoffset"), row,
        "day from start this stage falls due",
        "counted in days from the start, not a date — which day zero applies is the plan's to settle");
      if (ex != null) push("money", subject, ex, "INR", "stated", c1("amountexgst") || c1("amount"), row, "RA amount before tax");
      if (inc != null) push("money", subject, inc, "INR", "stated", c1("amountincgst"), row, "RA amount with tax");
      if (ms) push("term", subject, ms, "text", "stated", c1("name"), row, "what releases this payment");
    }

    // COUNTS THAT ALREADY KNOW WHERE THEY ARE. "Workstation 305", "Cabin 6",
    // "4 Pax Meeting Room 6" names the same rooms the area register does, so
    // these land on areas directly instead of being spread by floor share.
    if (cls.shape === "countmatrix") {
      const pl = num(cell(row, c1("places"))), pt = num(cell(row, c1("points")));
      const ac = num(cell(row, c1("activedata"))), rd = num(cell(row, c1("redundantdata")));
      if (pl != null) push("count", subject, pl, "nos", "stated", c1("places"), row,
        "how many rooms of this type");
      if (pt != null) push("count", subject, pt, "nos", "stated", c1("points"), row,
        "points across all rooms of this type");
      if (ac != null) push("count", subject, ac, "nos", "stated", c1("activedata"), row, "active data points");
      if (rd != null) push("count", subject, rd, "nos", "stated", c1("redundantdata"), row, "redundant data points");
    }

    // THE SHEET NAMES THE ITEM; THE ROW NAMES THE PLACE AND THE COUNT.
    if (cls.shape === "countbylocation") {
      const q = numAt(row, c1("qty"), "the quantity", subject);
      const loc = txt(cell(row, c1("location")));
      if (q != null) push("count", (sheet.name || "item") + " · " + (loc || subject), q, "nos",
        "stated", c1("qty"), row, "how many in this place",
        "the sheet is \"" + (sheet.name || "?") + "\" and every row of it is that item; the row says where and how many");
      if (loc) push("scope", (sheet.name || "item") + " · " + loc, loc, "text", "stated",
        c1("location"), row, "where they go");
    }

    // THE CHOSEN ITEM, AND THE ROOM IT WAS CHOSEN FOR.
    if (cls.shape === "selection") {
      const loc = txt(cell(row, c1("location"))), mk = txt(cell(row, c1("vendor")));
      const de = c1("description") === cName ? null : txt(cell(row, c1("description")));
      const q = num(cell(row, c1("qty"))), u = txt(cell(row, c1("unit")));
      if (loc) push("scope", subject, loc, "text", "stated", c1("location"), row, "room this was selected for");
      if (mk)  push("scope", subject, mk,  "text", "stated", c1("vendor"), row, "selected make");
      if (de)  push("scope", subject, de,  "text", "stated", c1("description"), row, "what was selected");
      // NO RATE ON THIS SHEET MEANS NO MONEY FROM IT. A selection record says
      // what and where, never what it costs — taking a quantity from here and
      // a rate from the bill would double-count against the BOQ's own line.
      if (q != null) push("count", subject, q, u || "nos", "stated", c1("qty"), row,
        "how many were selected", "a selection record, not a priced line — the BOQ carries the money");
    }

    // THE APPROVED BRAND IS A SPEC AND A MARK AT ONCE. Procurement may buy
    // only these; a camera tells this tile from a lookalike by exactly this.
    if (cls.shape === "makelist") {
      const mk = txt(cell(row, c1("vendor")));
      if (mk) push("scope", subject, mk, "text", "stated", c1("vendor"), row, "approved make",
        mk.split(/[,/]/).length > 1 ? "more than one make is approved for this item" : null);
    }

    if (cls.shape === "boq") {
      const cq = c1("qty"), cu = c1("unit"), cr = c1("rate"), cam = c1("amount");
      const q = numAt(row, cq, "the quantity", subject), u = txt(cell(row, cu));
      const rt = num(cell(row, cr)), am = num(cell(row, cam));
      // WHERE THE LINE APPLIES. A quantity with no place cannot reach an area.
      const loc = txt(cell(row, c1("location")));
      if (loc) push("scope", subject, loc, "text", "stated", c1("location"), row, "location the line applies to");
      const br = num(cell(row, c1("baserate"))), bcr = num(cell(row, c1("bcsrate"))), bca = num(cell(row, c1("bcsamount")));
      if (br  != null) push("rate",  subject, br,  "INR/" + (u || "(unit not stated)"), "measured", c1("baserate"), row, "basic rate");
      if (bcr != null) push("rate",  subject, bcr, "INR/" + (u || "(unit not stated)"), "measured", c1("bcsrate"),  row, "BCS rate");
      if (bca != null) push("money", subject, bca, "INR", "measured", c1("bcsamount"), row, "BCS amount");
      // A QUANTITY WITH NO STATED UNIT SAYS SO. Defaulting to "nos" turns
      // 2,130 square metres of self-levelling screed into 2,130 items, and
      // nothing downstream can tell the difference — the man-hour norm is
      // per unit, so a wrong unit is a wrong duration on every task it feeds.
      const NOUNIT = "(unit not stated)";
      if (q != null)  push("quantity", subject, q,  u || NOUNIT, "measured", cq, row, "priced BOQ quantity",
        [tag, loc ? "at " + loc : null,
         u ? null : "the sheet states no unit for this line, so no duration can be derived from it"]
        .filter(Boolean).join(". ") || null);
      if (rt != null) push("rate",     subject, rt, "INR/" + (u || NOUNIT), "measured", cr, row, "BOQ rate");
      if (am != null) push("money",    subject, am, "INR", "measured", cam, row, "BOQ amount");
      if (q != null && rt != null && am != null) {
        const calc = q * rt;
        if (Math.abs(calc - am) > Math.max(1, Math.abs(am) * 0.01))
          refused.push({ subject, why: "quantity x rate = " + Math.round(calc) + " but the amount cell says " +
            Math.round(am) + " on row " + row.r + " — the line does not add up and is reported, not averaged" });
      }
    }
  }

  return { facts, refused, notes, confirm, map: m, classify: cls, shape: cls.shape, why: null };
}

const SH = { ROLES, SHAPES, headerBand, profile, ordered, map, classify, extract };
root.INGEST_SHEETS = SH;
if (typeof module !== "undefined" && module.exports) module.exports = SH;

})(typeof window !== "undefined" ? window : globalThis);
