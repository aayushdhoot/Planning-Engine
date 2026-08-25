// ===================================================================
// DnB-OS . platform/core/allocation.js . WHO OWNS WHAT
// Phase 2. A plan nobody is named on is a document, not a programme.
// This law turns the dated task list into a list with a person against
// every line, and a department behind every person.
//
//   departmentFor(task, norm) -> which side of the house owns this work
//   heads(roster)             -> the head of each department
//   assign(tasks, roster)     -> { rows, byPerson, unallocated, ... }
//   dayList(assigned, day)    -> what one person does on one day
//   publishCheck(assigned)    -> the blocking gate
//
// THE LAWS
//   . every task carries exactly ONE owner. Shared ownership is nobody's
//     ownership, which is how a task sits untouched for three weeks with
//     four people each assuming another had it.
//   . the head of a department owns its work. Where the head has team
//     members, they become CO OWNERS and the work is split between them.
//   . the split is BY ZONE, not by task. One person owns a zone's worth
//     of their trade end to end, because that is how a site actually
//     runs: a supervisor walks an area, not a spreadsheet row.
//   . no co owner means the head does the work themselves. A head with
//     no team is not an excuse for an unowned task.
//   . a task whose department has no head is UNALLOCATED, and that
//     BLOCKS the publish. It is not a warning. A programme issued with
//     unowned work is the thing this law exists to prevent.
//   . the assignment is DETERMINISTIC. Same roster and same tasks give
//     the same answer every time, so a re-plan does not reshuffle who
//     owns what and quietly hand a zone to somebody new.
//
// Pure: tasks and roster in, assignment out. No clock, no storage.
// ===================================================================

;(function (root) {

// The sides of the house a task can belong to. These are the ones the
// brief names, plus statutory, which the sequence rulebook already
// carries as its own trade and which nobody else can be accountable for.
const DEPTS = ["operations", "mep", "design", "procurement", "commercial", "hse", "statutory", "client"];

const DEPT_LABEL = {
  operations: "Operations", mep: "MEP", design: "Design", procurement: "Procurement",
  commercial: "Commercial", hse: "HSE", statutory: "Statutory", client: "Client",
};

// trade -> department. The site trades are Operations; the services are
// MEP, because the MEP consultant is a distinct owner with distinct
// drawings and a distinct sign off.
const TRADE_DEPT = {
  demolition: "operations", civil: "operations", drywall: "operations",
  ceiling: "operations", flooring: "operations", painting: "operations",
  joinery: "operations", closeout: "operations",
  electrical: "mep", hvac: "mep", plumbing: "mep", fire: "mep", elv: "mep",
  statutory: "statutory",
};

// the enabling chain runs by STAGE, and each stage has a different owner:
// design draws it, the client approves it, procurement buys and chases it.
const ENABLING_DEPT = {
  pkg_design: "design", pkg_approval: "client",
  pkg_po: "procurement", pkg_submittal: "procurement",
  pkg_mfg: "procurement", pkg_delivery: "procurement",
};

// A coordination hold is a quality gate: somebody inspects and signs
// before the next trade closes the work up. That is HSE and quality, not
// the trade that happens to be waiting.
function departmentFor(task, norm) {
  if (!task) return null;
  if (task.gate) return "hse";
  const code = String(task.code || "");
  if (ENABLING_DEPT[code]) return ENABLING_DEPT[code];
  const trade = (task.trade || (norm && norm.trade) || "").toLowerCase();
  if (trade === "enabling") return "procurement";       // an enabling task with no known stage
  return TRADE_DEPT[trade] || "operations";
}

// ---- the roster ----------------------------------------------------
// A person: { id, name, dept, role, reportsTo, head, email, phone, active }
// The head of a department is the person flagged head, or failing that
// the one in it who reports to nobody. Two heads is a data error and the
// law names it rather than silently picking one.
function heads(roster) {
  const live = (roster || []).filter(p => p && p.id && p.active !== false);
  const out = {}, clashes = [];
  for (const d of DEPTS) {
    const inDept = live.filter(p => p.dept === d);
    const flagged = inDept.filter(p => p.head === true);
    const rootless = inDept.filter(p => !p.reportsTo);
    const pick = flagged.length ? flagged : rootless;
    if (pick.length > 1) clashes.push({ dept: d, names: pick.map(p => p.name) });
    out[d] = pick.length ? pick.slice().sort((a, b) => a.id < b.id ? -1 : 1)[0] : null;
  }
  return { byDept: out, clashes: clashes };
}

// the co owners of a department: everyone who reports to its head.
// Sorted by id so the split below is stable across re-plans.
function coOwners(roster, dept, head) {
  if (!head) return [];
  return (roster || [])
    .filter(p => p && p.id && p.active !== false && p.dept === dept && p.reportsTo === head.id)
    .sort((a, b) => a.id < b.id ? -1 : 1);
}

// ---- the assignment ------------------------------------------------
function assign(tasks, roster) {
  const H = heads(roster);
  const rows = [], unallocated = [], byPerson = {}, byDept = {};

  // zones first, sorted, so the round robin below is deterministic
  const zonesOf = {};
  for (const t of (tasks || [])) {
    const d = departmentFor(t);
    (zonesOf[d] = zonesOf[d] || {})[t.zone || "site"] = 1;
  }
  const zoneOrder = {};
  for (const d of Object.keys(zonesOf)) zoneOrder[d] = Object.keys(zonesOf[d]).sort();

  for (const t of (tasks || [])) {
    const dept = departmentFor(t);
    const head = H.byDept[dept];
    (byDept[dept] = byDept[dept] || { dept, label: DEPT_LABEL[dept], n: 0, head: head ? head.name : null }).n++;

    if (!head) {
      unallocated.push({ id: t.id, name: t.name, zone: t.zone, dept: dept, why: "no head for " + DEPT_LABEL[dept] });
      rows.push({ id: t.id, name: t.name, zone: t.zone, code: t.code, ES: t.ES, EF: t.EF,
        dept: dept, deptLabel: DEPT_LABEL[dept], ownerId: null, owner: null, coOwner: null, unallocated: true });
      continue;
    }

    const co = coOwners(roster, dept, head);
    let ownerPerson = head, coPerson = null;
    if (co.length) {
      // split BY ZONE: one person owns a zone's worth of this department's
      // work, so a supervisor walks an area rather than chasing scattered rows
      const zones = zoneOrder[dept] || [];
      const idx = Math.max(0, zones.indexOf(t.zone || "site"));
      coPerson = co[idx % co.length];
      ownerPerson = coPerson;                 // the co owner IS the owner of the line
    }
    const rec = { id: t.id, name: t.name, zone: t.zone, code: t.code, ES: t.ES, EF: t.EF,
      dept: dept, deptLabel: DEPT_LABEL[dept],
      ownerId: ownerPerson.id, owner: ownerPerson.name,
      headId: head.id, head: head.name,
      coOwner: coPerson ? coPerson.name : null, unallocated: false };
    rows.push(rec);
    (byPerson[ownerPerson.id] = byPerson[ownerPerson.id] ||
      { id: ownerPerson.id, name: ownerPerson.name, dept: dept, deptLabel: DEPT_LABEL[dept], tasks: [] })
      .tasks.push(rec);
  }

  return { rows, byPerson, byDept: Object.values(byDept), unallocated,
    heads: H.byDept, clashes: H.clashes,
    total: rows.length, allocated: rows.length - unallocated.length };
}

// ---- one person, one day -------------------------------------------
// What is live for this person on this date: anything whose window
// contains the day. Sorted so the earliest finishing work is first,
// because that is the work most likely to slip today.
function dayList(assigned, personId, dayISO) {
  const p = assigned && assigned.byPerson ? assigned.byPerson[personId] : null;
  if (!p) return { person: null, day: dayISO, tasks: [] };
  const live = p.tasks.filter(t => t.ES && t.EF && t.ES <= dayISO && dayISO <= t.EF);
  live.sort((a, b) => a.EF < b.EF ? -1 : a.EF > b.EF ? 1 : (a.zone < b.zone ? -1 : 1));
  return { person: { id: p.id, name: p.name, dept: p.dept, deptLabel: p.deptLabel },
    day: dayISO, tasks: live };
}

// ---- the gate ------------------------------------------------------
// Unallocated work BLOCKS. Two heads in one department blocks too: the
// engine cannot know which of them to hand the work to, and guessing
// would put a name on a line that person never agreed to.
function publishCheck(assigned) {
  const problems = [];
  if (assigned.unallocated.length) {
    const depts = [...new Set(assigned.unallocated.map(u => u.dept))].map(d => DEPT_LABEL[d]);
    problems.push({ id: "ALLOC-1", blocking: true,
      what: assigned.unallocated.length + " task" + (assigned.unallocated.length > 1 ? "s have" : " has") + " nobody against them",
      detail: "No head named for: " + depts.join(", "),
      fix: "Name a head for each of those departments on the Team screen." });
  }
  for (const c of assigned.clashes) {
    problems.push({ id: "ALLOC-2", blocking: true,
      what: "Two heads in " + DEPT_LABEL[c.dept],
      detail: c.names.join(" and ") + " both read as the head",
      fix: "Mark one of them as the head, or set who the other reports to." });
  }
  return { ok: problems.length === 0, blocking: problems.some(p => p.blocking), problems };
}

const ALLOC = { DEPTS, DEPT_LABEL, TRADE_DEPT, ENABLING_DEPT,
  departmentFor, heads, coOwners, assign, dayList, publishCheck };

root.CORE_ALLOC = ALLOC;
if (typeof module !== "undefined" && module.exports) module.exports = ALLOC;

})(typeof window !== "undefined" ? window : globalThis);
