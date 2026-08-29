// ===================================================================
// DnB-OS . platform/track/infer.js . THE INFERENCE LAW
// The engine's intelligence: when evidence proves one thing, physics
// and normal practice say other things are likely true too. The law:
//   . an inference is a guess with a named rule, a grade and a reason
//   . strict  = physically impossible otherwise
//   . likely  = normal practice, could differ, so it must be asked
//   . an inference NEVER counts as done in any rollup or percent
//   . it shows as "likely done", soft, beside the honest status
//   . every inference becomes a yes/no question for a human
//   . yes upgrades the target to claimed done as a dated confirmation
//     (still needs a photo or a measure to become verified)
//   . no kills the inference and the miss stays on record
// Nodes the engine reasons over, one shape for everything:
//   { tracker: "site"|"design"|"procure"|"grn"|"readings",
//     name, status, day, task? }
// ===================================================================

;(function (root) {

const GRADES = ["strict", "likely"];

// statuses that can fire a rule
const FIRE_ANY  = { in_progress: 1, claimed_done: 1, verified_done: 1, arrived: 1 };
const FIRE_DONE = { claimed_done: 1, verified_done: 1, arrived: 1 };
// statuses weak enough to receive an inference; anything stronger
// already speaks for itself and is never guessed about
const WEAK = { upcoming: 1, no_evidence: 1, commitment_only: 1, materials_on_site: 1 };

// ---------------- the rules ----------------
// when: what fires it (name regex + tracker + fire = "any"|"done")
// target: what it implies (name regex + tracker)
// reason: one plain sentence a site engineer would accept
const RULES = [

  // ---- site . construction sequence, strict ----
  { id: "plaster-proves-blockwork", grade: "strict",
    when: { name: /cement plaster/i, tracker: "site", fire: "any" },
    target: { name: /aac block|blockwork/i, tracker: "site" },
    reason: "plaster is applied on finished masonry, plastering under way means the wall behind it stands" },

  { id: "pop-proves-plaster", grade: "strict",
    when: { name: /pop punning/i, tracker: "site", fire: "any" },
    target: { name: /cement plaster/i, tracker: "site" },
    reason: "POP punning sits on cement plaster, punning under way means the plaster beneath is done" },

  { id: "tiles-prove-levelbase", grade: "strict",
    when: { name: /tile laying|tiling|vitrified tile works/i, tracker: "site", fire: "any" },
    target: { name: /self leveling/i, tracker: "site" },
    reason: "tiles sit on a finished level base, laying under way proves the base beneath it" },

  { id: "carpet-proves-levelbase", grade: "strict",
    when: { name: /carpet flooring/i, tracker: "site", fire: "any" },
    target: { name: /self leveling/i, tracker: "site" },
    reason: "carpet is laid only on a finished level floor" },

  { id: "gypsum-closes-conduit", grade: "strict",
    when: { name: /gypsum board.*partition|partition.*gypsum/i, tracker: "site", fire: "done" },
    target: { name: /gi conduiting/i, tracker: "site" },
    reason: "a closed gypsum partition can only close after the conduit inside it is laid" },

  { id: "ceiling-closes-ducting", grade: "strict",
    when: { name: /ceiling works/i, tracker: "site", fire: "done" },
    target: { name: /ducting fabrication|duct light testing/i, tracker: "site" },
    reason: "a ceiling closes only over finished and tested ducting above it" },

  { id: "ceiling-closes-sprinklers", grade: "strict",
    when: { name: /ceiling works/i, tracker: "site", fire: "done" },
    target: { name: /sprinkler piping/i, tracker: "site" },
    reason: "sprinkler piping above a ceiling must be complete before the ceiling closes" },

  { id: "ceiling-closes-wiring", grade: "strict",
    when: { name: /ceiling works/i, tracker: "site", fire: "done" },
    target: { name: /point wiring|cable trays/i, tracker: "site" },
    reason: "wiring and trays above a ceiling must be in before it closes" },

  { id: "grilles-prove-ducting", grade: "strict",
    when: { name: /grilles, diffusers/i, tracker: "site", fire: "any" },
    target: { name: /ducting fabrication/i, tracker: "site" },
    reason: "grilles and diffusers bolt onto finished ducting" },

  { id: "insulation-proves-ducttest", grade: "strict",
    when: { name: /thermal & acoustic insulation/i, tracker: "site", fire: "any" },
    target: { name: /duct light testing/i, tracker: "site" },
    reason: "duct light testing happens before insulation wraps the duct, insulation under way means the test happened" },

  { id: "idu-proves-refpiping", grade: "strict",
    when: { name: /indoor units installation/i, tracker: "site", fire: "any" },
    target: { name: /refrigerant piping/i, tracker: "site" },
    reason: "indoor units connect to refrigerant piping already routed to their positions" },

  { id: "secondfix-proves-piping", grade: "strict",
    when: { name: /sanitary fixtures.*second fix/i, tracker: "site", fire: "any" },
    target: { name: /internal water supply piping|upvc swr/i, tracker: "site" },
    reason: "second fix fittings mount on first fix piping already in the walls" },

  { id: "commissioning-proves-cabling", grade: "strict",
    when: { name: /panel installation, testing/i, tracker: "site", fire: "any" },
    target: { name: /lt panel cabling/i, tracker: "site" },
    reason: "a panel cannot be tested before its cables are pulled and terminated" },

  { id: "detectors-prove-fas-cabling", grade: "strict",
    when: { name: /detectors, hooters/i, tracker: "site", fire: "any" },
    target: { name: /armored cabling/i, tracker: "site" },
    reason: "detectors and hooters terminate on cabling already laid" },

  { id: "paint-proves-plaster", grade: "strict",
    when: { name: /acrylic emulsion paint/i, tracker: "site", fire: "any" },
    target: { name: /cement plaster|gypsum plaster/i, tracker: "site" },
    reason: "paint goes on finished plaster, painting under way proves the plaster beneath" },

  // ---- site . normal practice, likely ----
  { id: "toilet-finish-proves-waterproofing", grade: "likely",
    when: { name: /toilet wall & ceiling finishes|toilet.*tile/i, tracker: "site", fire: "any" },
    target: { name: /waterproofing/i, tracker: "site" },
    reason: "wet area finishes normally start only after waterproofing below them passed its ponding test" },

  { id: "cubicles-prove-toilet-finishes", grade: "likely",
    when: { name: /toilet cubicle installation/i, tracker: "site", fire: "any" },
    target: { name: /toilet wall & ceiling finishes/i, tracker: "site" },
    reason: "cubicles normally go in after the wet area walls and ceilings are finished" },

  { id: "skirting-proves-flooring", grade: "likely",
    when: { name: /skirting/i, tracker: "site", fire: "any" },
    target: { name: /carpet flooring|vitrified tile works/i, tracker: "site" },
    reason: "skirting normally runs after the floor finish it meets is laid" },

  { id: "workstations-prove-cabling", grade: "likely",
    when: { name: /workstation/i, tracker: "site", fire: "done" },
    target: { name: /cable laying termination/i, tracker: "site" },
    reason: "workstations normally land after the data cabling under them is laid and terminated" },

  { id: "cleaning-proves-finishes", grade: "likely",
    when: { name: /deep cleaning/i, tracker: "site", fire: "any" },
    target: { name: /acrylic emulsion paint|carpet flooring/i, tracker: "site" },
    reason: "deep cleaning normally starts only when paint and floor finishes are complete" },

  // ---- cross tracker . site work implies a design release, likely ----
  { id: "ductwork-proves-hvac-drawing", grade: "likely",
    when: { name: /ducting fabrication/i, tracker: "site", fire: "any" },
    target: { name: /^hvac layout$|hvac dbr/i, tracker: "design" },
    reason: "ducting is being fabricated on site, crews normally work to a released HVAC drawing even if the register says not started" },

  { id: "sprinklerwork-proves-drawing", grade: "likely",
    when: { name: /sprinkler piping/i, tracker: "site", fire: "any" },
    target: { name: /fire sprinkler layout/i, tracker: "design" },
    reason: "sprinkler piping is being run on site, the crew normally holds a released sprinkler layout" },

  { id: "electricalwork-proves-drawings", grade: "likely",
    when: { name: /gi conduiting|cable trays/i, tracker: "site", fire: "any" },
    target: { name: /raceway layout|cable tray layout/i, tracker: "design" },
    reason: "conduiting and trays are being fixed on site, the crew normally works to released electrical layouts" },

  { id: "plumbingwork-proves-drawings", grade: "likely",
    when: { name: /upvc swr|internal water supply piping/i, tracker: "site", fire: "any" },
    target: { name: /plumbing drainage layout|plumbing water supply layout/i, tracker: "design" },
    reason: "plumbing lines are being chased on site, the crew normally holds released plumbing layouts" },

  // ---- cross tracker . arrivals and site work imply procurement, strict ----
  { id: "arrival-proves-po", grade: "strict",
    when: { name: /./, tracker: "grn", fire: "any" },
    target: { name: /./, tracker: "procure" },
    pairs: [
      { sig: /plumbing/i, tgt: /^plumbing \(/i },
      { sig: /aac|block/i, tgt: /turnkey: civil/i },
      { sig: /tile/i, tgt: /tiles supply/i },
      { sig: /duct|hvac/i, tgt: /^hvac \(/i }
    ],
    reason: "material arrived on site, an order for it must have been released and dispatched" },

  { id: "sitework-proves-po", grade: "likely",
    when: { name: /./, tracker: "site", fire: "any" },
    target: { name: /./, tracker: "procure" },
    pairs: [
      { sig: /waterproofing/i, tgt: /water proofing/i },
      { sig: /sprinkler/i, tgt: /fire sprinkler \(/i },
      { sig: /ducting|hvac/i, tgt: /^hvac \(/i },
      { sig: /tile laying|vitrified/i, tgt: /tiles supply/i },
      { sig: /floor protection|pop on flooring/i, tgt: /floor protection sheets/i }
    ],
    reason: "a trade is working on site, its order was normally released even if the tracker is silent" },
];

// ---------------- the engine, pure ----------------
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

function fires(rule, n) {
  if (n.tracker !== rule.when.tracker) return false;
  if (!rule.when.name.test(n.name)) return false;
  const F = rule.when.fire === "done" ? FIRE_DONE : FIRE_ANY;
  return !!F[n.status];
}

// run(nodes) -> inferences. Pure: never mutates a node, never
// changes a status. One inference per rule and target, fired by
// the latest trigger. A strong target is never guessed about.
function run(nodes) {
  const out = [], seen = {};
  for (const rule of RULES) {
    const trig = nodes.filter(n => fires(rule, n));
    if (!trig.length) continue;
    const targets = nodes.filter(n =>
      n.tracker === rule.target.tracker && WEAK[n.status] && rule.target.name.test(n.name));
    for (const t of targets) {
      let from = null;
      if (rule.pairs) {
        for (const p of rule.pairs) {
          if (!p.tgt.test(t.name)) continue;
          const m = trig.filter(x => p.sig.test(x.name));
          for (const x of m) if (!from || (x.day || "") > (from.day || "")) from = x;
        }
      } else {
        for (const x of trig) if (x !== t && (!from || (x.day || "") > (from.day || ""))) from = x;
      }
      if (!from || from === t || from.name === t.name) continue;
      const qid = "infer:" + rule.id + ":" + slug(t.name);
      if (seen[qid]) continue;
      seen[qid] = 1;
      out.push({
        qid, rule: rule.id, grade: rule.grade, reason: rule.reason,
        from: { name: from.name, status: from.status, day: from.day || null, tracker: from.tracker },
        target: { name: t.name, status: t.status, tracker: t.tracker, task: t.task || null },
        question: t.name + " shows " + String(t.status).replace(/_/g, " ") + ", but " + from.name +
          (from.day ? " (seen " + from.day + ")" : "") +
          " says otherwise. Rule: " + rule.reason + ". Is " + t.name + " actually complete?"
      });
    }
  }
  return out;
}

// ---------------- answers: the human's yes or no ----------------
const KEY = "dnbos-track:skf:infer";
let mem = {};                       // fallback when localStorage is absent

function loadAnswers() {
  try { const s = root.localStorage && root.localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) {}
  return mem;
}
function saveAnswers(a) {
  mem = a;
  try { root.localStorage && root.localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {}
}
// answer(qid, "yes"|"no", day, inf) . the record keeps the whole story
function answer(qid, ans, day, inf) {
  const a = loadAnswers();
  a[qid] = { answer: ans, day: day,
    rule: inf ? inf.rule : null, grade: inf ? inf.grade : null,
    target: inf ? inf.target.name : null, reason: inf ? inf.reason : null,
    question: inf ? inf.question : null };
  saveAnswers(a);
  return a[qid];
}
function resetAnswers() { mem = {}; try { root.localStorage && root.localStorage.removeItem(KEY); } catch (e) {} }

// overlay(inferences, answers) . pending awaits a human, confirmed
// got a yes, killed got a no. byTarget indexes pending by name for
// the soft chip in every view.
function overlay(inferences, answers) {
  const a = answers || loadAnswers();
  const pending = [], confirmed = [], killed = [], byTarget = {};
  for (const inf of inferences) {
    const ans = a[inf.qid];
    if (!ans) { pending.push(inf); if (!byTarget[inf.target.name]) byTarget[inf.target.name] = inf; }
    else if (ans.answer === "yes") confirmed.push({ inf, ans });
    else killed.push({ inf, ans });
  }
  // answered records whose inference no longer regenerates (evidence
  // arrived and the target went strong) still deserve their history
  for (const qid of Object.keys(a)) {
    if (inferences.some(i => i.qid === qid)) continue;
    const ans = a[qid];
    (ans.answer === "yes" ? confirmed : killed).push({ inf: null, ans });
  }
  return { pending, confirmed, killed, byTarget };
}

// applyConfirmations(inferences, answers, asOf) . a yes becomes a
// dated claim on the target task: claimed done, never verified, the
// percent untouched. Idempotent by marker text.
function applyConfirmations(inferences, answers, asOf) {
  const a = answers || loadAnswers();
  let applied = 0;
  for (const inf of inferences) {
    const ans = a[inf.qid];
    if (!ans || ans.answer !== "yes" || !inf.target.task) continue;
    const t = inf.target.task;
    const marker = "confirmed by user, inference " + inf.rule;
    t.evidence = t.evidence || [];
    if (t.evidence.some(e => e.text && e.text.indexOf(marker) === 0)) continue;
    t.evidence.push({ day: ans.day || asOf, kind: "claim", completes: true,
      text: marker + ": " + inf.reason });
    applied++;
  }
  return applied;
}

root.TRACK_INFER = { GRADES, RULES, WEAK, run, overlay,
  loadAnswers, saveAnswers, answer, resetAnswers, applyConfirmations };
if (typeof module !== "undefined") module.exports = root.TRACK_INFER;

})(typeof window !== "undefined" ? window : globalThis);
