# BUILD_REPORT — DnB Planning Engine (v2 rebuild)

Second pass against your 11 points. All Tier-1 gates green, **89 tests** passing,
Tier-2 weighted **93%**.

---

## 1. Your 11 points

| # | Request | Status |
|---|---|---|
| 1 | Light dashboard instead of black | ✅ Rebuilt on a light palette (white panels, `#0f6fff` accent, soft status colours). Gantt, PERT and both report templates re-coloured. |
| 2 | Add a project, link Drive, scan → list docs → ask permission → rescan | ✅ **New project** tab: paste a folder link → scan → inventory against the input checklist → per-file read approval → read log. Live OAuth *and* manifest fallback, both built. Rescan available on the inventory step. |
| 3 | Ask queries instead of assuming | ✅ 12 standing questions plus one per missing mandatory input. Blocking questions (start date, duration, area, work mode, week-off, phasing, scope split, approvals, milestones) **prevent** project creation until answered. |
| 4 | PERT in the Emirates format | ✅ MS-Project columns — ID, Task Name, Duration, Start, Finish, Actual Start, Actual Finish — plus % and status. The real 392-row Emirates programme is loaded. |
| 5 | Collapsible, with all four categories | ✅ Per-row twisties, expand-all/collapse-all, and filters for **Schedule & Milestones / Design / Procurement / Execution**. Projects without an issued PERT get the same four categories derived from their plan. |
| 6 | Manpower is wrong — fixed teams, not spikes | ✅ Rewritten as resource levelling. Electricians now **peak at 14** (was 30) and hold a core gang of 14 across the trade window. Every trade is capped by `crewCaps` and tested to stay inside its band. |
| 7 | Design: GFC/MEP/Sampling with layout closure + client approval | ✅ 44-row tracker in your format, dual internal/client date and status columns, criticality, revision, and an explicit "releases" link into procurement and execution. |
| 8 | Procurement: drop BOQ/BCS, show order-by and delivery | ✅ All commercial values removed (a test asserts the JSON contains no amounts). Columns are order-by, delivery-required, revised, vendor, order status, delivery status, responsibility, gated-by, feeds. |
| 9 | To-do sheet trackable | ✅ Description / Responsibility / Priority / Status / Start / End / Revised / Notes — every cell editable. |
| 10 | Dependency tracker trackable | ✅ Sr / Area / Description / Responsibility / Plan date / Actual date / **Delay (days, computed)** / Status / Remarks. |
| 11 | Emirates folder has data now | ✅ Re-scanned. Emirates is a fully planned project: 33,000 sft, ₹23.95 Cr, 245 days, 10 cost heads, 216 execution activities reproducing the issued PERT exactly. |

---

## 2. Tier-1 gates

| Gate | Result |
|---|---|
| T1-TYPES | ✅ `tsc --noEmit`, strict, 0 errors |
| T1-LINT | ✅ ESLint 9, 0 errors 0 warnings |
| T1-BUILD | ✅ single-file `dist/index.html`, 1.03 MB / 342 kB gzip |
| T1-CPM | ✅ golden hand-computed network (FS/SS/FF + lags) matches exactly |
| T1-SCHEMA | ✅ 6 documents valid across 3 projects × 2 audiences |
| T1-TRACE | ✅ SKF 164 / Emirates 457 traced fields, 0 orphans |
| T1-IE | ✅ SKF buffer 8 d, Emirates 1 d, both inside range |
| T1-DETERMINISM | ✅ byte-identical across runs |
| T1-DEGRADE | ✅ KOHLER stays `pending_inputs`, no fabricated numbers |

**89 tests / 7 files.** New this pass: `rebuild.test.ts` (25 — Emirates data, PERT hierarchy,
collapse/expand, manpower caps, tracker formats, intake) and `render.test.tsx` (7 — every screen
server-rendered so a UI crash fails the build).

---

## 3. Defects the gates caught this pass

1. **Emirates: 215 of 215 activities critical.** I had chained every PERT leaf into one sequence
   — dates were right, but the whole programme showed zero float, which is useless for
   mitigation. Fixed by chaining within each PERT section and hanging sections off a
   zero-duration project-start anchor. Now 7 critical of 216, with real parallelism.
2. **Emirates dates shifted 27 days.** The anchor task started later than the project start.
   Fixed by the explicit start milestone. A fidelity test now asserts all 216 activities land on
   their PERT dates.
3. Schema, report and deck generators all still referenced the old procurement shape after
   commercial values were removed — caught by typecheck, then re-tested.

---

## 4. Tier-2 rubric

| # | Dimension | Weight | Score |
|---|---|---|---|
| 1 | Requirements coverage | 25% | 4.5 |
| 2 | Intelligence quality | 20% | 4.5 |
| 3 | Architecture | 15% | 4.5 |
| 4 | Output fidelity | 15% | 5.0 |
| 5 | Robustness | 15% | 5.0 |
| 6 | Maintainability | 10% | 4.5 |

**Weighted 4.65 / 5 = 93%.** Robustness rose to 5.0 on the levelling caps, intake blocking and
UI render tests; coverage is held at 4.5 by the items below.

---

## 5. Known limitations

| # | Limitation | Effort to close |
|---|---|---|
| 1 | ~~Only the BOQ is parsed structurally on read.~~ **Closed for spreadsheet programmes** — `src/services/schedule-ingestion.ts` ingests an issued schedule sheet; KOHLER's 66-activity programme came in that way with zero hand-transcription. Contracts and drawings (PDF/DWG) are still logged as evidence only. | Remaining: a PDF/contract parser. |
| 2 | Intake answers set start date, duration and area, but do not yet auto-generate milestones from the free-text RA answer. | Low. |
| 3 | Tracker edits live in session state and export with the workspace JSON; there is no shared server, so two people editing simultaneously will not see each other. | Medium: needs a backend. |
| 4 | Productivity norms are calibrated on SKF only. Emirates now provides a second calibration point that has not yet been folded in. | Low. |
| 5 | Google OAuth needs a client ID you create; without it the manifest path is used. | Trivial, one-time. |
| 6 | ~~KOHLER remains a shortcut that does not resolve.~~ **Closed** — the folder was supplied and KOHLER OS, Pune is now a fully planned project (66 activities, 19 cost heads, ₹5.70 Cr, 120 days). `KOHLER OS (no inputs)` is retained as the T1-DEGRADE fixture. | Done. |
| 8 | KOHLER's issued programme has **29 of 88** dependencies whose planned dates contradict their own stated predecessor logic, and pins handover to day 120 (3-Nov) while an activity on it finishes 4-Nov. The engine reproduces the dates as issued and reports the conflicts. | Blocked on the project head reissuing the programme. |
| 9 | KOHLER's BOQ carries no BCS column, so margin and cash outflow rest on the 28% margin norm rather than costed packages. | Low: supply a BOQ_BCS. |
| 7 | `node_modules/` in this folder is a stale partial install the sandbox cannot delete. **`rm -rf` it before `npm install`.** | Trivial. |

---

## 6. Commands

```bash
cd planning-engine
rm -rf node_modules
npm install --legacy-peer-deps
npm run dev      # the app
npm run gates    # typecheck → lint → 89 tests → build → sample run
npm run pdf      # PDF reports (needs LibreOffice)
```
