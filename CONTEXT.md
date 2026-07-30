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

## Org: directory, teams, admin
`src/domain/org.ts` + `src/services/employee-directory.ts` + `src/ui/Admin.tsx`.
- The master imports as **.xlsx / .xls / .csv**. Workbooks are read as *formatted text*, not
  raw: employee codes like `FSD - 002` and `0044` must stay strings, and a raw read mangles
  anything that looks numeric. The importer finds the sheet with an "Employee Name" column
  rather than assuming the first tab.
- The directory is **imported at runtime, never checked in**. The master sheet is personal data
  and this repo is public; `source-documents/org/` is gitignored.
- `parseEmployeeCsv()` deliberately **drops Mobile NO, DOJ and Grade** and lists what it
  dropped. `DROPPED_COLUMNS` documents why, so nobody re-adds them casually. A test asserts no
  phone number survives the import.
- Teams and project lifecycle live in `localStorage` via `settings-store` — staffing metadata
  the planner never reads, so it stays inside that file's stated rule.
- `PROJECT_LIFECYCLE` (Planning / WIP / On hold / Handed over / Closed) is **not**
  `plan.project.status`. That one answers "do I have the inputs?"; this answers "is it live?".
- Archiving hides a project from the switcher and leaves its data intact; only user-created
  projects can be deleted outright.

## PERT view levels
`collapseForDepth()` seeds the collapse set; choosing a level **resets** it. The first version
layered the level on top of the mount-time collapse, so "Activity level" showed exactly the same
rows as "Summary" and looked broken. Hand expand/collapse still works — the level just seeds it.

## S-curve
`src/engine/scurve.ts` + `src/ui/SCurve.tsx`, shown as the third mode in the PERT section.
- Weighted by **man-days** (`duration × crew`), the same quantity manpower levels — never by
  activity count, or ten one-day snagging items outrank a twenty-day HVAC run.
- **Actual is recorded progress only.** There is deliberately no "assume it is on track"
  fallback: an activity whose window has passed with nothing recorded drags the curve down,
  which is the truth the chart exists to show. Future points carry `actual: null` so the line
  stops at today rather than being drawn flat.

## Trackers
- **Design carries two dates only** — `readyBy` (drawing ready to issue) and `approvalBy`
  (client must have approved). The old `startDate` / `revisedEndDateInt` /
  `revisedEndDateClient` columns are gone; nobody managed them. Slippage is tracked by status.
- **No row may be dateless.** When no gated site activity exists, `windowFor()` anchors to the
  project window and says so in `basis`, so a weak date is visibly weaker rather than absent.
- **`issues[]` validates each row**: readiness before approval, approval before the activity it
  gates, nothing before the project starts, nothing already past. The UI banners them.
- **TDs come from the BOQ, not a list.** Every carpentry / modular / partition cost head raises
  a `TD — <package>` row, so a project with more joinery gets more technical drawings.
  Elevations are one per zone.
- **Sampling is per zone** (`norms.projectZones`), because finishes vary by location. A spec is
  marked `perZone` only when it actually varies — switch sockets stay a single row.
- **Standard mobilisation to-dos** live in `norms.standardMobilisationTodos` (site marking,
  resource allocation, site verification, tool creation, Wispr onboarding, client group,
  welcome email…). They are seeded from the project start and, unlike the derived rows, are
  NOT horizon-filtered — a mobilisation task nobody did stays on the list until it is closed.

## Actual dates vs contract dates
`cfg.dates` (`ScheduleDates`) carries four optional overrides. A contract states a start and a
duration; site reality often differs, and the plan must follow the real dates.
- `internalStart` re-anchors the CPM baseline — every internal date moves with it.
- **`clientStart` falls back to the CONTRACT start, never to the overridden internal start.**
  A late site start is an internal fact; the date the client is held to does not move unless it
  is renegotiated, and the resulting squeeze is what the buffer and I/E invariant exist to show.
- `internalEnd` is a *target*. The engine reports `internal.varianceDays` against it and
  **never compresses durations to meet it** — shortening work to hit a date invents a pace
  nothing supports. Same reasoning as an overrun being a finding, not an error.
- `buildPertFromPlan()` must NOT require `plan.internal`. `clientView()` nulls it, and the old
  guard meant the client saw "no PERT programme available" — the schedule is the main thing a
  client is owed. It builds from `external` + activities, both of which survive redaction.

## RA milestones replaced cashflow
Laid out to match the client's own payment-schedule sheet: **RA → Milestone → Sub-milestone**,
with Amount (excl. tax) / Incl. GST / Post retention / Invoice raised / Received / Payment date.
- `RaCheckpoint.group` is the milestone heading ("Civil Work", "Electrical", "Key Order
  Closures"); `groupFor()` files a clause by discipline so twenty clauses read as five groups.
- GST is a norm (18%, statutory). **Retention defaults to 0** so nothing is invented for a
  contract that has none — set it per project when the contract defines one.
- Invoice raised / received / payment date are **entered, never computed**. The engine cannot
  know what a client paid.

`modules.cashflow` is gone; `modules.raMilestones` took its slot in `REQUIRED_MODULES`.
- A milestone is a list of physical things that must be true on site, not a monthly money
  projection. `parseMilestoneClauses()` splits the contract prose ("Execution: a, b. Material
  delivery: c.") into checkpoints, and each execution clause is matched to the activity that
  evidences it. Readiness comes from ticked clauses, never from the due date arriving.
- **Margin moved to `plan.margin`** (top level, internal-only). It used to hang off
  `modules.cashflow.margin`; `clientView()` and `validatePlan()` both still enforce it.
- The Gantt is no longer a tab — it is a toggle inside the PERT section. Resources and the
  canonical JSON moved into Settings.

## Drive without OAuth
`PublicLinkDriveService` scans a link-shared folder with no credential at all — it reads Drive's
public folder-listing HTML and downloads via `uc?export=download`.
- Neither endpoint sends CORS headers, so the browser cannot call them. `vite.config.ts` proxies
  them under `/gdrive`, with **`followRedirects: true`** — downloads 302 to
  `drive.usercontent.google.com`, and without that the browser gets the redirect and is blocked.
- Do not probe the proxy with a fake folder id: Drive answers 404 for it, which is
  indistinguishable from "no proxy". `listing()` detects the SPA shell in the response instead.
- `DriveFolderNotPublic` is the *only* error that should fall through to OAuth. Everything else
  must report itself, or the app goes back to demanding a client ID it does not need.

## Drive coverage — "What is in Drive"
`src/engine/coverage.ts` + `src/ui/DriveCoverage.tsx`. The screen answers "is the engine reading
all my input data?", so its whole value is in **not overstating what was read**.
- `extracted` ≠ `logged`. Opening a contract PDF is not reading it. Never collapse these into
  one "read" badge — a contract shown as READ is exactly the false assurance this replaces.
- `extractorFor()` is deliberately conservative and checks the **path as well as the filename**:
  KOHLER's real BOQ is `KOHLER_PUNE_FS_26TH JUNE_V5.xlsx`, identified only by its parent folder
  `BOQ & Project Plan`. Filename-only matching hid the project's most important document.
- `slotFor()` is the opposite way round — **name beats path** — or the programme sitting in that
  same BOQ folder gets labelled as the BOQ.
- Adding an extractor means adding it here *and* in `applyBytes()` in `Intake.tsx`, or the row
  will offer "Read now" and then mark the file `logged`.

## Schedule ingestion (closes the old limitation #1)
`src/services/schedule-ingestion.ts` parses an issued programme sheet
(`Activity No | Section | Description | Pred. | Dur | Start | Finish | Float | Critical`) into
activities. Emirates had to be transcribed by hand; KOHLER did not.
- Predecessor notation `2.1 SS+1`, `9.6 SS+3, 11.1`, `-` is read for **logic**; lags are then
  **derived** from the planned Start column, same as `deriveLags()` in `skf.ts`. CPM therefore
  reproduces the issued dates instead of the stated logic — in real programmes they disagree.
- Where they disagree the parser records a `LogicConflict` rather than absorbing it silently.
  KOHLER has **29 of 88** dependencies whose dates contradict their stated predecessor.
- `tradeForSection()` must only ever return a trade that exists in `norms.crewByTrade`, or
  manpower levelling silently falls back to the default cap. Watch the word boundaries: without
  `\bduct`, "site induction" books an HVAC gang.
- **Dates out of xlsx are a trap.** Read raw and `"14.10"` becomes the number `14.1`, silently
  corrupting activity ids. Read formatted and a real date cell becomes a locale `"7/7/26"`,
  ambiguous between 7-Jul and 7-Oct. `gridOf()` therefore takes formatted text first and the
  typed `Date` only where the text will not parse. And a SheetJS date is not clean midnight —
  KOHLER's 7-Jul arrives as `2026-07-06T18:29:50Z`, the wrong day under both local *and* UTC
  getters — so `parseScheduleDate()` rounds the instant to the nearest whole day.
- Regenerate KOHLER with `npx vite-node scripts/generate-kohler.ts`; sources are in
  `source-documents/kohler/`. `src/data/kohler.ts` is generated — do not hand-edit it. It must
  come out byte-identical unless a source document changed.

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
