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
| `npm run gates` | The full bar: typecheck → lint → 104 tests → build → sample run |
| `npm run sample` | Regenerates `sample-output/` for all projects (JSON, reports, decks) |
| `npm run pdf` | Converts the HTML reports to PDF (needs LibreOffice on PATH) |

## What's in it

**Three projects, two of them real.** *SKF, Pune* — 69 activities, 18 BOQ packages, ₹8.21 Cr,
75-day contract. *Emirates Mumbai* — the issued 392-row MS-Project programme, 216 execution
activities, 10 cost heads, ₹23.95 Cr over 245 days. *KOHLER* stays in `pending_inputs` until
its folder has readable documents; the engine will not invent numbers for it.

**PERT view.** MS-Project format — ID, Task Name, Duration, Start, Finish, Actual Start,
Actual Finish — with collapsible summary rows, roll-up progress, delay flags and inline bars.
Filter by **Schedule & Milestones / Design / Procurement / Execution**. Projects without an
issued programme get the same four-category view derived from their computed plan.

**Manpower that a contractor would recognise.** Work content is levelled across each trade's
engagement window against realistic gang caps, so trades hold a stable core team and surge
only where activities genuinely overlap. Electricians now peak at 14, not 30.

**Four live trackers**, in the working formats:

| Tracker | Columns |
|---|---|
| Design | Category (GFC/MEP/Sampling) · Sub Category · Drawing · Criticality · Revision · Start · End (INT) · Revised (INT) · Status (INT) · End (Client) · Revised (Client) · Status (Client) |
| Procurement | Category · Sub Category · Criticality · **Order by** · **Delivery required** · Revised · Vendor · Order status · Delivery status · Responsibility · Gated by · Feeds |
| To-do | Description · Responsibility · Priority · Status · Start · End · Revised · Notes |
| Dependencies | Sr · Area · Description · Responsibility · Plan date · Actual date · Delay · Status · Remarks |

Every status, date and note is editable in the app. Procurement deliberately carries **no BOQ
or BCS value** — only when to order and when it must land on site.

**Design → procurement → execution are linked.** Each drawing's client-approval date is
back-scheduled from the site activity it releases; each package shows the design approval that
gates it and the activity it feeds.

**New project intake.** Point the engine at a project folder — pick it off this machine, or
paste a Drive link once OAuth is configured → it scans → lists every document against the
required-input checklist → asks permission before reading anything → then puts questions to the
project head and refuses to plan until the blocking ones are answered.

## Drive access

Three paths. All three land in the same inventory → permission → queries flow.

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
