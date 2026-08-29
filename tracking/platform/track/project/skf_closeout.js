// ===================================================================
// DnB-OS . platform/track/project/skf_closeout.js
// THE CLOSEOUT PACK . SKF Pune . handover ~20 to 22 Aug 2026
// The checklist that carries the project from verified done to handover.
// Sources:
//   . Signed GC agreement: RA billing (RA1 to RA6), DLP 12 months,
//     warranties endorsed before handover, performance and DLP BGs,
//     completion ~22 Aug (75 days from 08 Jun commencement)
//   . Plan T&C tasks (skf_site): sprinkler, HVAC, panel, integrated fire
//     trip and evacuation testing
//   . Critical rooms from the registry: server, UPS and electrical,
//     battery
// Nothing here is done yet: the site is mid execution. Every item reads
// pending until a dated fact or answer closes it. The closeout law arms
// this only inside the window before handover or when a package hits
// testing and commissioning; until then it shows "not started yet".
// ===================================================================

;(function (root) {

const CLOSE = {
  project: "SKF Pune",
  asOf: "2026-07-18",
  handover: "2026-08-20",
  windowDays: 21,
  queryPrefix: "closeout ",

  items: [
    // ---- commissioning ----
    { key: "co_spr_tc", pkg: "Fire fighting", kind: "commissioning",
      text: "Sprinkler testing and commissioning", note: "Plan 18 to 21 Jul, piping near done." },
    { key: "co_hvac_tc", pkg: "HVAC", kind: "commissioning",
      text: "HVAC testing and commissioning", note: "Plan 28 to 31 Jul." },
    { key: "co_panel_tc", pkg: "Electrical", kind: "commissioning",
      text: "Panel installation, testing and commissioning", note: "Plan 30 Jul to 02 Aug." },
    { key: "co_fas_tc", pkg: "Fire detection and PA", kind: "commissioning",
      text: "Detectors, hooters and PAVA rack commissioning", note: "Plan 20 to 29 Jul." },
    { key: "co_integrated_tc", pkg: "Integrated systems", kind: "commissioning",
      text: "Integrated fire trip and evacuation testing", note: "Plan 09 to 12 Aug." },
    { key: "co_prelv", pkg: "Integrated systems", kind: "commissioning",
      text: "Pre-HVAC and pre-LV commissioning", note: "RA5 milestone, day 70." },

    // ---- critical room handover ----
    { key: "co_server", pkg: "Critical rooms", kind: "handover",
      text: "Server room handover", note: "Registry: Server Room. Services not started at the 18 Jul walk." },
    { key: "co_ups", pkg: "Critical rooms", kind: "handover",
      text: "UPS and electrical room handover", note: "Registry: UPS And Elec Room." },
    { key: "co_battery", pkg: "Critical rooms", kind: "handover",
      text: "Battery room handover", note: "Registry: Battery Room." },

    // ---- documents register ----
    { key: "co_warranties", pkg: "Documents", kind: "document",
      text: "Warranty certificates assigned to SKF", note: "Agreement: warranties endorsed to the client before handover." },
    { key: "co_testreports", pkg: "Documents", kind: "document",
      text: "Test reports (pressure, insulation, earthing, HVAC air balance)", note: "Each RA bill needs measurement and test support." },
    { key: "co_asbuilt", pkg: "Documents", kind: "document",
      text: "As-built drawings", note: "Handover document set." },
    { key: "co_om", pkg: "Documents", kind: "document",
      text: "Operation and maintenance manuals", note: "Handover document set." },

    // ---- compliance (statutory, mirrors the dependency register) ----
    { key: "co_cfo", pkg: "Compliance", kind: "compliance",
      text: "Fire CFO received", note: "Statutory. Tracked as a dependency too." },
    { key: "co_occupancy", pkg: "Compliance", kind: "compliance",
      text: "Occupancy audit and BMC approval", note: "Statutory." },
    { key: "co_builder_audit", pkg: "Compliance", kind: "compliance",
      text: "Builder pre-occupancy audit sign off (Phoenix)", note: "Phoenix building guidelines." },

    // ---- billing verification ----
    { key: "co_ra_todate", pkg: "Billing", kind: "billing",
      text: "RA bills certified to date (RA1 to RA5)", note: "RA2 day 20, RA3 day 40, RA4 day 55, RA5 day 70." },
    { key: "co_final_bill", pkg: "Billing", kind: "billing",
      text: "Final bill and re-measurement", note: "Item rate re-measurable contract." },
    { key: "co_dlp_bg", pkg: "Billing", kind: "billing",
      text: "DLP bank guarantee lodged (RA6, 5 percent, 12 months)", note: "Releases the RA6 retention." },
    { key: "co_perf_bg", pkg: "Billing", kind: "billing",
      text: "Performance bank guarantee closed out", note: "5 percent, valid to handover plus 30 days." }
  ],

  // closeout raises only its own specific unknowns. The statutory items
  // (CFO, occupancy) are already queried by the dependency register, so
  // they are not duplicated here.
  queries: [
    { about: "closeout commissioning plan",
      question: "Closeout needs a commissioning plan per package: sprinkler, HVAC, electrical panel, FAS and PA, and the integrated fire trip test. Who owns each, and what is the target date and the sign off authority? Nothing is closed until a dated result lands.", blocking: false },
    { about: "closeout documents owner",
      question: "The handover document register (warranties assigned to SKF, test reports, as-builts, O and M manuals) has no owner yet. Who compiles it, and by when? Warranties must be endorsed to the client before handover per the agreement.", blocking: false },
    { about: "closeout billing status",
      question: "Which RA bills (RA1 to RA5) are raised, certified and collected to date? The register needs the billing status to verify closeout, and the DLP and performance bank guarantees have to be tracked to release retention.", blocking: false }
  ],

  apply: function (ledger) {
    if (ledger.state.queries.some(q => q.about === "closeout commissioning plan")) {
      return { applied: false, reason: "closeout pack queries already raised" };
    }
    for (const q of CLOSE.queries) ledger.addQuery(q);
    return { applied: true, queries: CLOSE.queries.length };
  }
};

root.TRACK_CLOSEOUT_SKF = CLOSE;
if (typeof module !== "undefined") module.exports = root.TRACK_CLOSEOUT_SKF;

})(typeof window !== "undefined" ? window : globalThis);
