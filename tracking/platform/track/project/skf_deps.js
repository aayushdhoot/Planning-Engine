// ===================================================================
// DnB-OS . platform/track/project/skf_deps.js
// THE DEPENDENCY REGISTER PACK . SKF Pune . standing, as of 18 Jul 2026
// The things somebody outside the crew owes the job. Sources:
//   . SKF Weekly Task Tracker Wk4 (design gates, client approvals, dates)
//   . GFC tracker (58 drawings, zero SKF side approvals)
//   . Signed GC agreement (site handover 08 Jun, statutory, insurance)
//   . Project schedule actuals (temporary power done 12 Jun)
// Plan dates are the dates the item was wanted by. Actual dates are only
// the ones on record; the rest are queried, never guessed. Aging counts
// on the real calendar. The dependency law scores this, and the open
// rows feed the Compare asks.
// ===================================================================

;(function (root) {

const DEPS = {
  project: "SKF Pune",
  asOf: "2026-07-18",
  queryPrefix: "dep ",

  deps: [
    // ---- client (SKF) ----
    { key: "dep_gfc_approve", ask: "SKF to approve the GFC drawing set", side: "client",
      owner: "Rajesh Pillai (SKF)", plan: "2026-06-15", actual: null, blocking: true,
      note: "58 drawings issued FS side, none approved SKF side per the GFC tracker. Gates client sign off on layouts and finishes." },
    { key: "dep_carpet", ask: "SKF to approve the carpet sample", side: "client",
      owner: "Rajesh Pillai (SKF)", plan: "2026-07-04", actual: null,
      note: "At 50 percent per Wk4. Carpet is on the critical chain and its install window has opened." },
    { key: "dep_sanitary", ask: "SKF to select sanitary fixtures and finish TDS", side: "client",
      owner: "Rajesh Pillai (SKF)", plan: "2026-07-04", actual: null,
      note: "Holds sanitary second fix." },
    { key: "dep_finishes", ask: "SKF to select blinds and skirting colours", side: "client",
      owner: "Rajesh Pillai (SKF)", plan: "2026-07-10", actual: null,
      note: "Finish selections still open per the Compare challenges." },
    { key: "dep_it", ask: "SKF to give IT and data inputs for handover", side: "client",
      owner: "Rajesh Pillai (SKF)", plan: null, actual: null,
      note: "IP scheme and network provisioning. No date on record. Needed before data termination and handover. The client deck kept this as a standing ask." },

    // ---- statutory ----
    { key: "dep_fire_noc", ask: "Fire NOC, provisional, from the authority", side: "statutory",
      owner: "Fire department", plan: "2026-07-06", actual: null,
      note: "Needs fire layouts F-100 to F-105 issued for submission (Wk4 design gate 4)." },
    { key: "dep_cfo", ask: "CFO, final fire clearance", side: "statutory",
      owner: "Fire department", plan: null, actual: null,
      note: "Closeout gate. Follows commissioning and inspection." },
    { key: "dep_occupancy", ask: "Occupancy audit and BMC approval", side: "statutory",
      owner: "BMC / building authority", plan: null, actual: null,
      note: "Closeout gate." },

    // ---- GC and builder (Phoenix / Alyssum) ----
    { key: "dep_access", ask: "Builder site handover and access", side: "GC",
      owner: "Phoenix / Alyssum", plan: "2026-06-08", actual: "2026-06-08",
      note: "Granted at commencement per the signed agreement (08 Jun)." },
    { key: "dep_power", ask: "Temporary power", side: "GC",
      owner: "Phoenix / Alyssum", plan: "2026-06-10", actual: "2026-06-12",
      note: "From the project schedule actuals: started 11 Jun, finished 12 Jun." },
    { key: "dep_water", ask: "Construction water supply", side: "GC",
      owner: "Phoenix / Alyssum", plan: null, actual: null,
      note: "No explicit record in the absorbed sources. Queried." },

    // ---- FS side standing compliance (feeds closeout too) ----
    { key: "dep_car_insurance", ask: "Contractor all risk insurance bound", side: "FS",
      owner: "Atish (FS)", plan: "2026-07-02", actual: null,
      note: "Wk4 flagged the site live and uninsured. Contract requires contract value plus 25 percent, copies before mobilisation. Confirm the policy is in force." }
  ],

  queries: [
    { about: "dep gfc approvals",
      question: "SKF side approvals stand at zero of 58 drawings. Which layouts has the client actually approved, and by when will the critical set (partition, RCP, MEP coordination, furniture) be signed? This gates every bay from closing.", blocking: false },
    { about: "dep carpet approval date",
      question: "The carpet sample is at 50 percent and the install window has opened. What is the date SKF will close the sample approval so the carpet can be ordered?", blocking: false },
    { about: "dep it inputs",
      question: "No date is on record for SKF IT and data inputs (IP scheme, network). When will these land? They are needed before data termination and handover.", blocking: false },
    { about: "dep fire noc",
      question: "The provisional Fire NOC needs the fire layouts submitted first. When are F-100 to F-105 issued, and what is the target NOC date?", blocking: false },
    { about: "dep water supply",
      question: "Construction water supply has no record in the absorbed sources. Is it in place, and since when? The register needs the actual date.", blocking: false },
    { about: "dep insurance binding",
      question: "Wk4 flagged the site live and uninsured. Has the contractor all risk policy been bound, and on what date? The register carries this until a dated confirmation lands.", blocking: false }
  ],

  apply: function (ledger) {
    if (ledger.state.queries.some(q => q.about === "dep gfc approvals")) {
      return { applied: false, reason: "dependency pack queries already raised" };
    }
    for (const q of DEPS.queries) ledger.addQuery(q);
    return { applied: true, queries: DEPS.queries.length };
  }
};

root.TRACK_DEPS_SKF = DEPS;
if (typeof module !== "undefined") module.exports = root.TRACK_DEPS_SKF;

})(typeof window !== "undefined" ? window : globalThis);
