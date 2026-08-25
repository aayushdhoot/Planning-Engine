// ===================================================================
// DnB-OS . platform/core/cashflow.js . MONEY IN, MONEY OUT, BY MONTH
// Output 9. A fit-out can be on programme and still run out of cash,
// because the money comes in on gates and goes out on deliveries, and
// those two do not happen in the same week.
//
//   receipts(gates, plan, cal)   money in, on the dates the gates land
//   payments(pos, terms)         money out, on the dates the terms imply
//   position(rec, pay, opts)     month by month, with the running balance
//   worst(position)              the deepest trough, and when
//   line(position)               one sentence
//
// THE LAWS
//   . A RECEIPT MOVES WHEN ITS GATE MOVES. This is the whole point. A
//     payment gate is earned by work; if the work slips, the money
//     slips with it. A forecast that keeps the old receipt date while
//     the plan slips is not optimistic, it is wrong.
//   . NOTHING IS FORECAST FROM A DATE THE ENGINE DOES NOT HAVE. No gate
//     dates, no receipts . and it says so rather than drawing a flat
//     line through zero. Half the danger of a cashflow is the confident
//     empty chart.
//   . RETENTION IS WITHHELD, NOT EARNED. Money retained against a gate
//     is not received on that gate, and the engine keeps it out of the
//     balance until its own release date.
//   . PAYMENT TERMS ARE COUNTED FROM THE EVENT THEY NAME. "45 days from
//     delivery" and "45 days from invoice" are different weeks, and
//     using one for the other is how a trough appears a month early.
//   . THE TROUGH IS THE ANSWER. A cashflow whose headline is the total
//     is answering a question nobody asked; the number that matters is
//     how deep it goes and in which month.
//
// Pure: gates, orders and terms in . a monthly position out. No clock.
// ===================================================================

;(function (root) {

const monthOf = (iso) => String(iso || "").slice(0, 7);
const addDaysISO = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---- money in ----------------------------------------------------------
// gates: [{ ra, pay:"20%", codes:[...] }] . the signed payment schedule.
// plan:  the CURRENT plan, so a gate lands when its work actually lands.
function receipts(gates, plan, opts) {
  const o = opts || {};
  const total = o.contractValue || 0;
  const retentionPct = o.retentionPct == null ? 0 : o.retentionPct;
  const creditDays = o.clientCreditDays == null ? 0 : o.clientCreditDays;

  if (!gates || !gates.length)
    return { rows: [], total: 0, why: "no payment gates are declared for this project, so no receipt can be forecast" };
  if (!total)
    return { rows: [], total: 0, why: "no contract value is recorded, so the gates cannot be turned into money" };

  const tasks = (plan && plan.tasks) || [];
  const rows = [];
  for (const g of gates) {
    const codes = g.codes || [];
    const mine = tasks.filter(t => codes.indexOf(t.code) !== -1 && !t.gate);
    // THE LAW: earned when the work is done, not on a calendar day
    const earnedOn = mine.length ? mine.map(t => t.EF).sort().slice(-1)[0] : null;
    const pct = parseFloat(String(g.pay || "").replace("%", ""));
    const gross = isFinite(pct) ? Math.round(total * pct / 100) : null;
    const retained = gross == null ? null : Math.round(gross * retentionPct / 100);
    rows.push({
      ra: g.ra, pay: g.pay, gross, retained,
      net: gross == null ? null : gross - retained,
      earnedOn,
      // the money arrives after the client's credit period, not on the day
      dueOn: earnedOn ? addDaysISO(earnedOn, creditDays) : null,
      tracked: mine.length,
      why: mine.length ? null : "no task in the plan carries this gate's codes, so it cannot be dated",
    });
  }
  return { rows, total: rows.reduce((s, r) => s + (r.net || 0), 0),
    retained: rows.reduce((s, r) => s + (r.retained || 0), 0), why: null };
}

// ---- money out ---------------------------------------------------------
// pos: [{ po, vendor, value, delivery }] . the commitment register.
// terms: { days, from:"delivery"|"invoice", advancePct }
function payments(pos, terms) {
  const t = terms || {};
  const days = t.days == null ? 30 : t.days;
  const from = t.from || "delivery";
  const advancePct = t.advancePct == null ? 0 : t.advancePct;
  const list = (pos && (pos.pos || pos)) || [];
  const rows = [];
  for (const p of list) {
    if (!p || !p.value) continue;
    const adv = Math.round(p.value * advancePct / 100);
    // an advance is paid to release the order, not against a delivery
    if (adv && p.orderedOn) rows.push({ po: p.po, vendor: p.vendor, kind: "advance",
      amount: adv, on: p.orderedOn, why: advancePct + "% advance on order release" });
    const base = from === "invoice" ? (p.invoicedOn || p.delivery) : p.delivery;
    if (!base) { rows.push({ po: p.po, vendor: p.vendor, kind: "balance", amount: p.value - adv,
      on: null, why: "no " + from + " date on this order, so it cannot be dated" }); continue; }
    rows.push({ po: p.po, vendor: p.vendor, kind: "balance", amount: p.value - adv,
      on: addDaysISO(base, days), why: days + " days from " + from });
  }
  return { rows, total: rows.reduce((s, r) => s + r.amount, 0),
    undated: rows.filter(r => !r.on).length };
}

// ---- the position ------------------------------------------------------
function position(rec, pay, opts) {
  const o = opts || {};
  const open = o.openingBalance || 0;
  const by = {};
  const touch = (m) => (by[m] = by[m] || { month: m, in: 0, out: 0 });

  for (const r of ((rec && rec.rows) || [])) if (r.dueOn && r.net) touch(monthOf(r.dueOn)).in += r.net;
  for (const p of ((pay && pay.rows) || [])) if (p.on && p.amount) touch(monthOf(p.on)).out += p.amount;

  const months = Object.keys(by).sort();
  if (!months.length) return { months: [], worst: null, closing: open,
    why: (rec && rec.why) || "nothing on either side of the ledger carries a date, so there is no position to draw" };

  let bal = open;
  const rows = months.map(m => {
    const e = by[m];
    bal += e.in - e.out;
    return { month: m, in: e.in, out: e.out, net: e.in - e.out, balance: bal };
  });
  return { months: rows, closing: bal, opening: open,
    worst: rows.reduce((w, r) => (!w || r.balance < w.balance) ? r : w, null),
    undatedPayments: (pay && pay.undated) || 0,
    untrackedGates: ((rec && rec.rows) || []).filter(r => !r.dueOn).length,
    why: null };
}

function worst(pos) { return pos && pos.worst ? pos.worst : null; }

function line(pos) {
  if (!pos || pos.why) return (pos && pos.why) ? "No cashflow can be drawn: " + pos.why + "." : "No cashflow yet.";
  const w = pos.worst;
  const L = (n) => (n < 0 ? "-" : "") + "₹" + Math.abs(n / 100000).toFixed(1) + "L";
  const head = w && w.balance < 0
    ? "Cash goes negative — " + L(w.balance) + " at its worst, in " + w.month + "."
    : "Cash stays positive throughout, lowest at " + L(w ? w.balance : 0) + " in " + (w ? w.month : "—") + ".";
  const gaps = [];
  if (pos.untrackedGates) gaps.push(pos.untrackedGates + " gate" + (pos.untrackedGates === 1 ? "" : "s") + " the plan cannot date");
  if (pos.undatedPayments) gaps.push(pos.undatedPayments + " order" + (pos.undatedPayments === 1 ? "" : "s") + " with no delivery date");
  return head + (gaps.length ? " Not counted: " + gaps.join(", ") + "." : "");
}

const CASHFLOW = { monthOf, receipts, payments, position, worst, line };
root.CORE_CASHFLOW = CASHFLOW;
if (typeof module !== "undefined" && module.exports) module.exports = CASHFLOW;

})(typeof window !== "undefined" ? window : globalThis);
