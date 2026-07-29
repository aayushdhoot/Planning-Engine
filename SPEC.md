# Planning Engine — Specification (self-defined)

> Replaces the missing `planning-engine-build-prompt.md`. Requirements were derived from:
> (a) the Planning-Engine-Structure sheet (inputs + 8 output modules),
> (b) real project data in the DnB Planning Engine Drive folder (SKF Pune schedule, priced BOQ_BCS, signed GC agreement),
> (c) the build protocol's gates (T1-CPM, T1-SCHEMA, T1-TRACE, T1-IE, T1-DETERMINISM, T1-DEGRADE).

## §1 Purpose
Given a fit-out project's inputs (BOQ, contract, layout metadata, etc.), deterministically generate a full project plan: baseline schedule with CPM dates, manpower, resources, procurement, design plan, to-dos, dependency tracker, and cashflow — each in an Internal (I) and External/client (E) view.

## §2 Inputs (from structure sheet)
Mandatory: project BOQ (priced, per package), project contract/PO (start date, duration, payment milestones, LD), layout/area. Optional: drawings, day-0 site images, 3D design, sales KT, make list, payment terms detail, fit-out guideline, DBR, tender docs, brand guideline, client policies.
Missing optional inputs → engine still plans, records an `assumptions[]` entry per gap (T1-DEGRADE). Missing mandatory inputs → project enters `pending_inputs` state listing what is needed; no fabricated numbers.

## §3 Norms (versioned data, not code)
`norms-v1.json`: per-trade productivity (duration drivers per unit qty), material lead times (seeded from SKF "Material Lead Time" sheet — 17 items, traceable), crew compositions per trade, default buffer policy. Every norm value carries `source`.

## §4 CPM rules (deterministic math)
- Activity network: nodes = activities, edges = dependencies (FS/SS/FF with lag in working days).
- Calendar: working-day arithmetic; configurable weekly off-days (default: Sundays working — Flipspaces convention; Saturdays working; i.e. 7-day week unless configured) plus holiday list.
- Forward pass: ES = max over predecessors (FS: EF_pred + lag; SS: ES_pred + lag; FF: EF_pred + lag − dur). Backward pass mirrors it. TF = LS − ES. Critical path = chain of TF = 0 activities from start to finish.
- Durations come ONLY from: existing schedule input, norms × quantity, or explicit input. AI/heuristics may map structure (which activities exist, their order) but never invent dates.

## §5 Internal / External views
- External (E) baseline anchored to contract dates: contract start + contract duration (e.g. SKF: 8-Jun-26 + 75 cal days). External milestones = contract RA milestones.
- Internal (I) plan = external minus a buffer: internal_end = external_end − buffer_days, buffer configurable within [0, 15] working days (default 7). Invariant: external_end ≥ internal_end (T1-IE).
- Client deck/JSON view must never expose: internal buffer, BCS (internal cost), margins, risk notes marked internal.

## §6 The 8 output modules
1. Timeline/Baseline schedule — phases → activities with CPM dates, float, critical flag; I and E views.
2. Manpower planning — per-activity crew from norms × duration → daily headcount histogram by trade.
3. Project resource planning — role slots (PM, site engineer, MEP engineer, design lead, procurement owner…) scaled by project value/area from norms.
4. Procurement plan — per BOQ package: long-lead flag, lead time (norms), order-by date = required-on-site − lead − buffer; PO package breakup with target order & delivery dates.
5. Design plan — layouts, GFC/TD/elevations, 3Ds, sampling, MEP design trackers with target dates back-scheduled from dependent site activities.
6. To-do list — team + individual, generated from plan (next 14 days' starts, overdue actuals, procurement order-bys).
7. Client/builder dependency tracker — clearances/approvals (from contract + fit-out manual categories) with need-by dates tied to blocked activities.
8. Cashflow plan — inflow: contract RA milestones applied to contract value at milestone dates; outflow: BCS cost distributed across packages' scheduled execution windows. Internal view shows both + margin; client view shows inflow schedule only.

## §7 Canonical JSON schema (§9 in protocol refs)
Top level: `{ engine: {name, version, normsVersion}, project, calendar, activities[], modules: {timeline, manpower, resources, procurement, design, todos, dependencies, cashflow}, assumptions[], confidence }`.
Every quantitative leaf is a `Traced<T>`: `{ value, provenance: 'input'|'norm'|'computed', source }` (T1-TRACE). Schema validated by the built-in validator (T1-SCHEMA). Serialization is key-sorted → byte-identical across runs (T1-DETERMINISM).

## §8 Application
Vite + React + TS single-page app. Project switcher (SKF / Emirates / KOHLER), 8 module tabs, I/E toggle, editable calendar + buffer + norms in-app, SVG Gantt, canonical JSON export, printable client & internal reports (differ per §5).

## §9 Quality gates
As per the build protocol §3/§4 — all Tier-1 must pass; Tier-2 weighted ≥ 90%, no dimension < 4.
