# CONTEXT — handoff for the next session

## Where this stands
v2 rebuild complete: all 9 Tier-1 gates green, Tier-2 **93%**, **89 tests**. See `BUILD_REPORT.md`
for the point-by-point response to the 11 change requests.

## What changed in v2
- Light theme throughout (`src/styles.css` is the single source of colour).
- **PERT** module: `src/domain/pert.ts` (types, flatten, roll-up), `src/ui/Pert.tsx` (collapsible
  view), `src/data/emirates-pert.ts` (the real 392-row programme), `src/engine/pert-build.ts`
  (derives the same four-category tree for projects with no issued PERT).
- **Manpower** rewritten as levelling in `src/engine/manpower.ts` against `norms.crewCaps`.
- **Four trackers** in `src/domain/trackers.ts` + `src/engine/trackers.ts`, all editable in the UI.
- **Intake** in `src/engine/intake.ts` + `src/ui/Intake.tsx`, Drive in `src/services/drive.ts`.
  Three `DriveService` implementations — `LocalFolderDriveService` (a picked directory; the only
  path needing no Google setup, and the only fallback that yields real file bytes),
  `GoogleDriveService` (OAuth, the only path that accepts a pasted link), `ManifestDriveService`.
  Adding a fourth source means implementing `DriveService`; nothing else in the app changes.
- Emirates is now a real project (`src/data/emirates.ts`).

## What this is
A deterministic planning engine for interior fit-out projects. Inputs (priced BOQ, contract, schedule)
produce the 8 output modules from the Planning-Engine-Structure sheet, in both an Internal (I) and an
External/client (E) view.

**The one rule that governs the design:** the AI maps *structure* (which activities exist, which trade
waits on which); the CPM engine computes *every date*. Nothing quantitative is guessed. Every numeric
leaf in the output is `{ value, provenance: 'input'|'norm'|'computed', source }` and an audit asserts
there are no orphans.

## Layout
```
src/domain/types.ts        Traced<T>, Activity, BoqPackage, EngineConfig …
src/engine/calendar.ts     working-day arithmetic (off-days, holidays)
src/engine/cpm.ts          forward/backward pass, FS/SS/FF + lags, float, critical path
src/engine/wbs.ts          scope → WBS when no schedule is supplied (per-unit norms, value fallback)
src/engine/planner.ts      orchestrator → Plan (8 modules) + clientView() redaction
src/engine/schema.ts       canonical key-sorted JSON, validation, traceability audit
src/norms/norms-v1.json    ALL norms — versioned data, never code
src/services/ingestion.ts  IngestionService: xlsx/CSV BOQ parser
src/services/persistence.ts PersistenceService: memory + file-based workspace
src/reports/render.ts      branded HTML reports (client ≠ internal)
src/reports/deck.ts        branded PPTX decks (client ≠ internal)
src/App.tsx, src/ui/       React app: 11 tabs, I/E toggle, SVG Gantt
tests/                     54 tests — the Tier-1 gates live here
scripts/sample-run.ts      end-to-end run over all 3 projects + gate assertions
```

## Conventions worth knowing before you edit
- **EF is exclusive.** An activity occupies working days `[ES, EF)`; `endDate` is day `EF-1`.
  The golden test in `tests/gates.test.ts` documents the whole convention with hand-computed numbers.
- **Dependency lags are derived, not authored.** `deriveLags()` in `src/data/skf.ts` and
  `activitiesFromPert()` in `src/data/emirates.ts` compute each lag from the source programme's
  planned start dates, so CPM reproduces the issued schedule exactly.
- **Chain within sections, not across the whole project.** Emirates originally chained every task
  into one sequence: dates were right but all 215 activities came out critical. Tasks are chained
  within their PERT parent and each section hangs off a zero-duration `e0` anchor. Keep it that way —
  `tests/fidelity.test.ts` asserts both exact dates *and* that fewer than half the activities are critical.
- **Manpower is levelled, never summed.** Adding a trade means adding its `crewCaps` entry;
  `tests/rebuild.test.ts` fails if any day exceeds a cap.
- **Redaction is schema-enforced.** `clientView()` strips internal data and `validatePlan()` *fails*
  a client document that still carries margin, BCS, float or internal-only assumptions. Add a new
  internal-only field → add it to both.
- **An overrun is a finding, not an error.** If the CPM finish passes the contract date, the plan stays
  schema-valid but `ieInvariant.holds` goes false and a `schedule` assumption must explain it. The
  schema rejects a *silent* breach.
- **Calendar default is a 7-day week** (Sundays working — Flipspaces convention). Toggle in Settings.

## Continuing the loop
1. `npm run gates` — must be green before you start.
2. Pick from the remaining-defects table in `BUILD_REPORT.md` §5; it is ranked with score recovery.
   The best next item is **#1, schedule-file ingestion** — it is the last thing forcing new projects
   to be transcribed by hand.
3. Write the test first (that is how all seven defects in this build were caught), fix, re-run gates,
   re-score against the Tier-2 rubric, and update this file plus `BUILD_REPORT.md`.

## Two things to be careful about
- `node_modules/` in this folder is a **stale partial install** the build sandbox could not delete.
  `rm -rf node_modules` before `npm install --legacy-peer-deps`.
- Productivity norms are calibrated against **one** project. They reproduce SKF's 75-day programme, but
  treat derived (BOQ-only) programmes as indicative until a second project is used to calibrate.

## Open question for the business
Emirates and KOHLER have no readable inputs in Drive — the folders are scaffolds only. The engine
correctly refuses to invent a plan for them. To make those two real, drop a priced BOQ into the Ingest
tab, or point the next session at folders that actually contain the BOQ, contract and schedule.
