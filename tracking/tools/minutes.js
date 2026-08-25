#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/minutes.js . THE MEETING REGISTER
//   node tools/minutes.js
//
// Builds minutes.json from minutes-held.json.
//
// The MoM folder on this project is empty. Not one meeting has been
// recorded, so the register starts with nothing in it — same as the snag
// list, and for the same reason: there is no honest way to invent a meeting
// that did not happen.
//
// WHAT IT CAN DO BEFORE THE FIRST MEETING
//   It can write the agenda. Every other register on this engine already
//   knows what is unresolved and who owns it — 58 drawings with no client
//   approval, three packages nobody has ordered, ten client dependencies
//   open, a date that lands a fortnight late. That is not a guess at an
//   agenda, it is the agenda, and it is assembled from live files rather
//   than from somebody's memory of last week.
//
//   THE AGENDA IS PROPOSED, NEVER MINUTED. Nothing on it is a point until
//   a meeting happens and somebody takes it. An engine that pre-writes the
//   minutes is worse than no minutes at all.
//
// THE LAWS, all in platform/kb/minutes.js
//   . AN OBSERVATION ALWAYS LANDS, owned and dated. What the room did not
//     say is defaulted and the row says which parts.
//   . OPEN POINTS CARRY FORWARD, keeping the meeting they were raised at
//     and their age. Nobody re-types one.
//   . A POINT IS CLOSED BY A DECISION, with a date. Not by falling off.
//   . AN ACTION ON SOMEBODY WHO WAS NOT IN THE ROOM is flagged.
// ===================================================================
const fs = require("fs"), path = require("path");
const MIN = require(path.join(__dirname, "../platform/kb/minutes.js"));

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const held = read("minutes-held.json") || [];
const TD = read("todo.json"), G = read("registers.json"), R = read("resources.json");
const T = read("target.json"), S = read("schedule.json"), SG = read("snags.json");

const today = new Date().toISOString().slice(0, 10);

const reg = MIN.register(held, today);
const counts = MIN.summary(held, today);
const carried = MIN.carriedForward(held, today);

// ---- who should be in the room -----------------------------------------
// Read off the registers rather than guessed: whoever owns something open.
const owners = {};
((TD && TD.rows) || []).filter(r => !r.done).forEach(r => {
  const k = r.owner || "unassigned";
  (owners[k] = owners[k] || { side: k, items: 0, blocking: 0 });
  owners[k].items++; if (r.blocking) owners[k].blocking++;
});
((G && G.deps.rows) || []).filter(d => d.open && d.owner).forEach(d => {
  const k = d.owner;
  (owners[k] = owners[k] || { side: "client", items: 0, blocking: 0, named: true });
  owners[k].items++; if (d.blocking) owners[k].blocking++;
});
const room = Object.keys(owners).map(k => Object.assign({ who: k }, owners[k]))
  .sort((a, b) => b.blocking - a.blocking || b.items - a.items);

// ---- what the next meeting has to get through ---------------------------
// THE AGENDA IS PROPOSED, NEVER MINUTED.
const agenda = [];
const add = (a) => agenda.push(Object.assign({ from: null, owner: "unassigned" }, a));

if (carried.length) add({ heading: "Carried forward",
  what: carried.length + " point" + (carried.length === 1 ? "" : "s") +
    " still open from earlier meetings" +
    (counts.overdue ? ", " + counts.overdue + " past their date" : ""),
  from: "the register itself", owner: "the room",
  detail: carried.slice(0, 6).map(p => p.text) });

if (T && T.built && T.built.conditionsBy > T.target) add({ heading: "The date",
  what: "The programme lands " + T.built.conditionsBy + " against a contract date of " + T.target,
  from: "target.json", owner: "client",
  detail: [S ? "built to " + (S.progress[S.days[S.days.length - 1]] || {}).overall.actual + "%" : null]
    .filter(Boolean) });

if (G && G.drawings.counts.approvedByClient === 0) add({ heading: "Drawings",
  what: "Not one of the " + G.drawings.counts.total +
    " drawings has a client approval, so none is usable to buy against",
  from: "registers.json", owner: "client",
  detail: [G.drawings.counts.throughInternally + " are complete on our side",
           G.drawings.counts.critical + " are marked critical"] });

if (R) { const pending = R.rows.filter(r => r.state === "pending");
  const overdue = R.rows.filter(r => r.state === "overdue");
  if (pending.length) add({ heading: "Material with no order",
    what: pending.length + " packages have no purchase order at all",
    from: "resources.json", owner: "procurement",
    detail: pending.map(r => r.name) });
  if (overdue.length) add({ heading: "Material promised and not seen",
    what: overdue.length + " packages are past the date the vendor gave",
    from: "resources.json", owner: "procurement",
    detail: overdue.slice(0, 6).map(r => r.name + " — " +
      (r.bought.pos[0].vendor || "") + ", promised " + r.bought.pos[0].promisedOn) }); }

if (G) { const dep = G.deps.rows.filter(d => d.open && d.overdue);
  if (dep.length) add({ heading: "What we are waiting on you for",
    what: dep.length + " client dependencies are past the date agreed",
    from: "registers.json", owner: "client",
    detail: dep.map(d => d.ask + " — " + d.age + " days") }); }

if (SG && !SG.empty && SG.counts.open) add({ heading: "Defects",
  what: SG.counts.open + " open, " + SG.counts.overdue + " past their date",
  from: "snags.json", owner: "the room", detail: [] });

const out = {
  builtAt: new Date().toISOString(), today,
  counts, meetings: reg.meetings, points: reg.points, carried,
  agenda, room,
  empty: reg.meetings.length === 0,
  why: "the MoM folder on this project is empty and no meeting has been invented. What the engine " +
       "can do before the first one is write the agenda from the registers that already know what " +
       "is unresolved and who owns it. That agenda is proposed and never minuted — nothing on it " +
       "is a point until a meeting happens and somebody takes it",
};
fs.writeFileSync(path.join(ENGINE, "minutes.json"), JSON.stringify(out));

console.log("\n  THE MEETING REGISTER  (as on " + today + ")");
if (out.empty) console.log("    empty — not one meeting recorded, and none invented");
else {
  console.log("    " + counts.meetings + " meetings · " + counts.points + " points · " +
    counts.open + " open · " + counts.overdue + " past their date");
  console.log("    " + counts.defaulted + " points the room did not fully specify · " +
    counts.absentOwners + " owned by somebody who was not there");
  if (counts.meanToClose != null) console.log("    a point takes " + counts.meanToClose +
    " days to be decided, on average");
  if (counts.carriedMost) console.log("    the oldest open point has survived " +
    counts.carriedMost + " meetings");
}
console.log("\n  THE AGENDA FOR THE NEXT MEETING  (" + agenda.length + " items, proposed)");
agenda.forEach(a => { console.log("    " + a.heading.toUpperCase() + " · " + a.owner);
  console.log("      " + a.what);
  (a.detail || []).slice(0, 4).forEach(d => console.log("        · " + String(d).slice(0, 84))); });
console.log("\n  WHO OWNS SOMETHING OPEN");
room.slice(0, 8).forEach(r => console.log("    " + String(r.who).padEnd(26) +
  String(r.items).padStart(3) + " open, " + r.blocking + " blocking"));
console.log("\n→ engines/skf/minutes.json\n");
