// ===================================================================
// DnB-OS . platform/track/delay.js . THE DELAY LEDGER LAW
// The site sheets named, on every delay row, the vendor and the hours
// lost, so the final bill could charge it. Our slips said what slipped,
// not who is chargeable. This law adds the who, carefully:
//   . a slipped task shows the vendor on its package, read from the PO it
//     is committed to. That is a plain fact: this vendor holds this scope.
//   . it never marks that vendor chargeable on its own. Most slips on this
//     job are gates, a drawing not released, an order not placed, a
//     selection pending, not the vendor's fault. Chargeability is a
//     judgement, and it needs a dated human answer.
//   . a slip with no PO still lists, with the vendor left open and a query
//     asking who owns the delay.
// Pure: it reads the scored tasks and the commitments, it holds no data.
// ===================================================================

;(function (root) {

// chargeability arrives only as a dated answer on the ledger, kind
// "delay_charge" { task, vendor, day }. The engine never sets it.
function chargeFor(taskName, facts) {
  let best = null;
  for (const f of (facts || [])) {
    if (f.kind !== "delay_charge" || f.task !== taskName || !f.day) continue;
    if (!best || f.day >= best.day) best = { vendor: f.vendor || null, day: f.day };
  }
  return best;
}

// scoredTasks: [{ name, slipDays, commitments:[po], group? }]
// commitments registry: [{ po, vendor, scope, value }]
function build(scoredTasks, commitments, facts) {
  const byPo = {};
  for (const c of (commitments || [])) byPo[c.po] = c;
  const rows = [];
  for (const t of (scoredTasks || [])) {
    if (!(t.slipDays > 0)) continue;
    const vendors = [];
    for (const po of (t.commitments || [])) {
      const c = byPo[po];
      if (c) vendors.push({ po: c.po, vendor: c.vendor, scope: c.scope });
    }
    const charge = chargeFor(t.name, facts);
    rows.push({ task: t.name, group: t.group || null, slipDays: t.slipDays,
      vendors: vendors, hasVendor: vendors.length > 0,
      chargeable: charge ? charge.vendor : null, chargedOn: charge ? charge.day : null });
  }
  rows.sort((a, b) => b.slipDays - a.slipDays);
  return { rows: rows, total: rows.length, worst: rows.length ? rows[0].slipDays : 0,
    withVendor: rows.filter(r => r.hasVendor).length,
    charged: rows.filter(r => r.chargeable).length };
}

root.TRACK_DELAY = { chargeFor: chargeFor, build: build };
if (typeof module !== "undefined") module.exports = root.TRACK_DELAY;

})(typeof window !== "undefined" ? window : globalThis);
