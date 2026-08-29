# SKF Pin Walk . live deployment

Deployed 17 Jul 2026, 4:21 PM from sourabh.surage@flipspaces.com.

App link (phone and status, same link):
https://script.google.com/macros/s/AKfycbxHhtS4dnl_tzPO-VqX_nk90_J4ewTxOKf-c_Xhak_jF_S_bVAIhr1X4DvoxnZ1UWq3Gw/exec

Status check (JSON, the engine reads this):
https://script.google.com/macros/s/AKfycbxHhtS4dnl_tzPO-VqX_nk90_J4ewTxOKf-c_Xhak_jF_S_bVAIhr1X4DvoxnZ1UWq3Gw/exec?day=YYYY-MM-DD

Deployment id: AKfycbxHhtS4dnl_tzPO-VqX_nk90_J4ewTxOKf-c_Xhak_jF_S_bVAIhr1X4DvoxnZ1UWq3Gw
Project editor: https://script.google.com/home/projects/1ktb9sTkKvoJcGQhfbYx20F_7VHjw3c6sqrLEG9YJKpUSJBeAfiDkNuQT/edit
Config: Web app . Execute as Me . Anyone with the link. Description: SKF Pin Walk v1.
Photos land in Drive: 13 Site Tracking / pins / YYYY-MM-DD (folder id 1gHPIBkynXzHRmR1tkWZv59WN6tLBpkYR).

Verified 17 Jul 2026:
- GET /exec serves the Pin Walk app. Header shows Pin Walk . SKF Pune, 0 of 81 shot, online badge, name only setup.
- GET /exec?day=2026-07-17 returns {"ok":true,"day":"2026-07-17","present":[],"count":0,"blocked":[]}

To update the app later: edit Code.gs or app.html in the editor, then Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy. The link stays the same.

## Version 2 . 17 Jul 2026, 5:10 PM

App v2 pushed as a new version on the same deployment. Link unchanged.

What changed:
- Shoot screen now shows a map guide: the room outline, nearby spaces, blue dot where to stand, red arrow which way to face, blue cone what the photo must cover. Same snippet as the camera brief, drawn from embedded plan geometry, works offline.
- Day 1 the map is the framing guide. From day 2 yesterday's ghost photo takes over, with a Map and Ghost toggle on the shoot screen.
- Pin list rows show a small direction arrow per pin.

Verified 17 Jul 2026, 5:12 PM:
- app.html in the editor is byte identical to capture/index.html (50,988 chars, checksum verified chunk by chunk before save).
- GET /exec serves v2: new help line "the map shows where to stand and which way to face" visible, all 49 spaces listed, no console errors on load.
- GET /exec?day=2026-07-17 returns {"ok":true,"day":"2026-07-17","present":[1,2],"count":2,"blocked":[]} (the two v1 test photos).

## Version 3 . 17 Jul 2026, 5:35 PM

Code.gs v3 pushed as a new version on the same deployment. Link and
app.html unchanged. The two v1 test photos (P01, P02, not real site
images) were moved to Drive trash the same day, the day folder is clean.

What changed (backend only, the engine reads photos through the link):
- GET /exec?day=YYYY-MM-DD&files=1 lists the day with file detail:
  {"ok","day","files":[{no,id,name,by,time,size}],"count","blocked":[{no,reason,by}]}
- GET /exec?img=FILE_ID returns one photo as base64 JSON: {"ok","id","name","b64"}.
  img only serves files inside the pins folder, anything else is refused.
- Legacy ?day= response is byte identical to v2, the dark list is untouched.

Verified 17 Jul 2026:
- Code.gs in the editor byte identical to capture/Code.gs (7,118 chars, djb2 checksum 2007088216 matched).
- ?day=2026-07-17&files=1 returns {"ok":true,"day":"2026-07-17","files":[],"count":0,"blocked":[]}
- ?day=2026-07-17 (legacy) returns {"ok":true,...,"present":[],"count":0,"blocked":[]}
- ?img=INVALID_TEST_ID fails safely as JSON {"ok":false,"error":...}, never an exception page.

Who reads the link now:
- The tracking engine's Site tab (Today's walk panel) pulls ?day=&files=1
  live and ?img= per clicked pin. Module: platform/track/walk.js.
- The daily AI read follows engines/tracking/data/skf/site_readings/READING_LAW.md
  and drops a dated readings json on the engine's Inputs tab.

## Known issue . 20 Jul 2026 . blank page on open, Google side

Symptom: the /exec link sometimes opens as a blank white page under the
Google banner. Reported by Sourabh on 20 Jul. Reproduced on desktop
Chrome: three blank loads, then two clean loads, then blank again,
minutes apart, nothing changed between them.

Where the fault sits, checked layer by layer on 20 Jul:
- Deployment untouched: active deployment matches this id, Version 3 of
  17 Jul 5:35 PM, nobody redeployed.
- Server healthy: every execution in the log says Completed.
  ?day=2026-07-20 returned clean JSON while the page was blank.
- The served page is whole: the /exec response was fetched raw both
  signed in and anonymous, 75 KB, both contain the full app HTML.
- The failure is the last hop: Google's outer page must hand the app
  into its sandbox iframe, and that hand off intermittently never
  happens. Our code never runs on a blank load, so no app change can
  prevent it. Known Google bug, tracker issue 390138133, apps worldwide.

What the field does about it:
- If the link opens blank, pull down to refresh once or twice. It
  loads within a try or two.
- Once loaded, keep that tab open all day and across days. Add to home
  screen. The dice is only rolled when the page is freshly opened.
- The engine side (?day=, &files=, ?img=) never had the problem, only
  the app page. Photo upload from an open app is also unaffected.

## Version 4 . pending . live day rollover

Template patched 20 Jul 2026 (capture/_template.html, rebuilt into
capture/index.html, 52,066 bytes, headless smoke test passed). Not yet
pushed to the Apps Script editor or redeployed.

Why: the keep the tab open guidance above makes a frozen boot date
dangerous. v3 fixes DAY at first load, so a tab kept overnight would
file photos under the old date.

What changed (app only, Code.gs untouched):
- DAY is live. The app rechecks the date on every render, camera open,
  shot, and block, plus on tab wake and a minute tick. On a new day it
  swaps to that day's state, closes the camera, and shows a toast.
- Help line now tells the field to keep the page open and to refresh
  once or twice if the link ever opens blank.

To push v4: paste capture/index.html into app.html in the editor, then
Deploy > Manage deployments > edit (pencil) > Version: New version >
Deploy. The link stays the same.

## Code.gs v4 . the day index . NOT DEPLOYED YET

Code.gs gained one read only endpoint so the engine's Drive tab can ask
what Drive holds without probing dates one by one:

    GET ?days=1  ->  { ok, days:[{day,pins,files,blocked,first,last,by}], count }

It walks the day folders under the pins folder, counts distinct pins and
files in each, reads blocked.txt, and returns them newest first. It never
calls folderFor_, which makes a folder when one is missing. That matters:
probing ?day= for a date the site never walked CREATES an empty folder, so
a client side scan across a month would litter Drive. This endpoint only
lists what already exists.

Nothing else in Code.gs changed. The app (app.html) is untouched, so the
phone side needs no attention.

To push v4: open the project editor, replace Code.gs with this file, then
Deploy > Manage deployments > edit (pencil) > Version: New version >
Deploy. The link stays the same.

Verify after deploying:

    curl -sL "<EXEC>?days=1" | head -c 400

Expect ok:true and one row per day folder. Until this is live the engine's
Drive tab stays empty on purpose and names the missing endpoint as the
reason, rather than showing a guess.

## Code.gs v5 . the approved renders . DEPLOYED 29 Jul 2026, 7:25 PM

The design team's 76 approved renders live in their own Drive folder
(1nPponiA51lqVccL9jpr1KdLGC36-yVCz). The engine pairs a render beside the
site photo, so ?img= has to be allowed to serve from that folder as well as
the pins folder. One constant and one line in inPins_ changed:

    var RENDERS_FOLDER_ID = "1nPponiA51lqVccL9jpr1KdLGC36-yVCz";
    ...
    if (p.getId() === RENDERS_FOLDER_ID) return true;

Nothing else changed. It stays read only: nothing is ever written into the
renders folder, and ?img= still refuses every other file in the drive.

The renders are NOT copied into the repo. They are 0.75 to 7 MB PNGs, about
120 MB in total, so the register carries the Drive file id and the engine
pulls one render at a time when a pin is opened, exactly the way it already
pulls pin photos.

Pushed as Version 5 on the same deployment, link unchanged, app.html
untouched. Verified the same day:

- GET ?img=<render id>  -> ok:true, P01.png, 1,520,608 base64 chars
- GET ?img=<pin photo>  -> ok:true, still serves the walk photos
- GET ?days=1           -> ok:true, 13 day folders, v4 intact
- The engine's Today tab paints the render beside the site photo, both
  boxes the same size, and pin 37 still pairs to nothing.

To roll back: Deploy > Manage deployments > edit (pencil) > Version 4.
