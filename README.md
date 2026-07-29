# DnB Planning Engine

Turns a fit-out project's inputs — priced BOQ, contract, programme — into a full plan:
PERT schedule, manpower, resources, design tracker, procurement tracker, to-do list,
client/builder dependencies and cashflow. Every plan exists in an **Internal** and a
**Client** view, and the two are genuinely different documents.

## Try it in 10 seconds

Open **`dist/index.html`** in a browser. The whole app is one self-contained file — no install.

## Run from source

```bash
rm -rf node_modules            # a stale partial install ships in this folder; delete it first
npm install --legacy-peer-deps
npm run dev                    # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run gates` | The full bar: typecheck → lint → 185 tests → build → sample run |
| `npm run sample` | Regenerates `sample-output/` for all projects (JSON, reports, decks) |
| `npm run pdf` | Converts the HTML reports to PDF (needs LibreOffice on PATH) |

## What's in it

**Three real projects, plus a degraded-input fixture.** *SKF, Pune* — 69 activities, 18 BOQ
packages, ₹8.21 Cr, 75-day contract. *Emirates Mumbai* — the issued 392-row MS-Project
programme, 216 execution activities, 10 cost heads, ₹23.95 Cr over 245 days. *KOHLER OS, Pune*
— 66 activities, 19 cost heads, ₹5.70 Cr over 120 days, **ingested** from its Drive documents
rather than transcribed (`npx vite-node scripts/generate-kohler.ts`). *KOHLER OS (no inputs)*
stays in `pending_inputs` as the degrade fixture; the engine will not invent numbers for it.

**PERT view.** MS-Project format — ID, Task Name, Duration, Start, Finish, Actual Start,
Actual Finish — with collapsible summary rows, roll-up progress, delay flags and inline bars.
Filter by **Schedule & Milestones / Design / Procurement / Execution**. Projects without an
issued programme get the same four-category view derived from their computed plan.

**Manpower that a contractor would recognise.** Work content is levelled across each trade's
engagement window against realistic gang caps, so trades hold a stable core team and surge
only where activities genuinely overlap. Electricians now peak at 14, not 30.

**Actual dates.** Settings carries internal and client start/finish overrides. Setting the real
site start re-drives every internal date; the client baseline stays on the contract unless you
change it, so a slip shows up as buffer erosion rather than quietly moving the client's date. An
internal target finish is reported as a variance — the engine never compresses durations to hit
a date. The Gantt marks today, draws recorded progress, and flags activities past their planned
finish that nobody has signed off.

**Sections.** Overview · PERT (with the Gantt behind a toggle) · Manpower · Design ·
Procurement · To-do · Dependencies · RA Milestones · New project · Settings (resource plan,
calendar, norms, Drive access and the canonical JSON live here).

**Five live trackers**, in the working formats:

| Tracker | Columns |
|---|---|
| Design | Category (GFC/MEP/Sampling) · Sub Category · **Zone** · Drawing · Criticality · Revision · **Ready by** · Status (INT) · **Client approval by** · Status (Client) · Releases — two targets only, each validated against the activity it gates |
| Procurement | Category · Sub Category · Criticality · **Order by** · **Delivery required** · Revised · Vendor · Order status · Delivery status · Responsibility · Gated by · Feeds |
| To-do | Description · Responsibility · Priority · Status · Start · End · Revised · Notes |
| Dependencies | Sr · Area · Description · Responsibility · Plan date · Actual date · Delay · Status · Remarks |
| RA milestones | RA · Due · Revised · % · Amount · Readiness · Status · Invoice no. · Invoice date, each expanding into the contract clauses that must be true before billing |

Every status, date and note is editable in the app. Procurement deliberately carries **no BOQ
or BCS value** — only when to order and when it must land on site.

**GFC covers what actually has to be drawn.** Technical drawings are raised from the BOQ — every
carpentry, modular and partition cost head gets a TD — and elevations are raised per zone.
Sampling is split by zone too, because paint, laminate and tile shades vary by location. The
to-do list is seeded with the standard mobilisation tasks (site marking, resource allocation,
site verification, tool creation, Wispr onboarding, client group, welcome email) alongside the
project-specific ones.

**Design → procurement → execution are linked.** Each drawing's client-approval date is
back-scheduled from the site activity it releases; each package shows the design approval that
gates it and the activity it feeds.

**New project intake.** Point the engine at a project folder — pick it off this machine, or
paste a Drive link once OAuth is configured → **What is in Drive** lists every document against
the required-input checklist and shows, per file, whether the engine actually turned it into
numbers → then puts questions to the project head and refuses to plan until the blocking ones
are answered.

**What is in Drive** exists to answer one question: *is the engine reading all my input data?*
It separates two outcomes that a plain "read" badge would blur:

| Badge | Means |
|---|---|
| **READ** | Structurally extracted — its numbers are in the plan (`4 packages · 14,905 sft · ₹5.70 Cr`) |
| **EVIDENCE ONLY** | Bytes were opened, but there is no extractor for this format. Nothing reached the plan |
| **NOT READ** | Untouched. The amber tile counts the ones the engine *could* parse but has not |
| **DROPPED** | Excluded by you. The required input it matched then counts as uncovered |

Per document: **Read now** (parse it), **Prepare by hand** (upload a file to stand in for it),
**Drop reading** (exclude it). A contract PDF therefore never reads as "READ" — the engine holds
it as evidence and makes you answer its dates in the questions step.

## Drive access

Four paths. All land in the same coverage → queries flow.

- **Paste a folder link (no setup).** A folder shared as *"Anyone with the link"* is scanned
  with **no Google account, no OAuth client ID and no API key**. The engine reads Drive's own
  public folder listing and downloads files through the public endpoint. Both are proxied by the
  dev server (`/gdrive` in `vite.config.ts`) because Drive sends no CORS headers — so this path
  needs `npm run dev`, not the single-file build. Only a genuinely private folder falls through
  to OAuth.
- **Local folder (no setup).** Pick the project folder off this machine. If Google Drive for
  Desktop is running, that folder *is* the Drive folder, so you are reading live Drive contents
  with no Google API involved. File contents are real, so the BOQ is genuinely parsed.
  Drive-for-Desktop placeholders (`.gsheet`, `.gdoc`, …) hold no content until downloaded — the
  engine excludes them and says so rather than parsing a 100-byte pointer as a BOQ.
- **Live OAuth.** Enable the Drive API, then in **Google Auth Platform** set Branding, set
  Audience (Internal for Workspace, else External + yourself as a test user), and create a
  **Web application** client with this app's origin under *Authorised JavaScript origins*.
  Paste the client ID into Settings; it persists in `localStorage` (a client ID is a public
  identifier, not a secret). Scanning uses read-only scope. This is the only path that accepts
  a pasted Drive *link*, because Google requires a credential to read private files.
- **Manifest.** Import a JSON file with a `files[]` array of
  `{ id, name, mimeType, sizeBytes, path }`. Lists documents but carries no contents, so the
  BOQ cannot be parsed from it.

## The design rule

> The AI maps structure. The CPM engine computes every date.

Durations come from the issued programme, from norms × quantity, or from norms × value — never
from a guess. Each number carries `{ value, provenance, source }` and a traceability audit fails
the build if anything is orphaned. Hover a figure to see where it came from.

## Internal vs client

| | Internal | Client |
|---|---|---|
| SKF JSON | 191 kB | 125 kB |
| Emirates JSON | 352 kB | 230 kB |
| Shows | float, critical path, buffer, BCS, margin, cash position, manpower, vendors | contract dates, phase programme, milestones, design approval dates, delivery dates, what's needed from the client |

`validatePlan()` **rejects** a client document that still carries margin, outflow, float, vendors
or manpower, so the separation cannot rot.

---

See `BUILD_REPORT.md` for the scorecard and known limitations, `SPEC.md` for the specification,
and `CONTEXT.md` to pick the work back up.
