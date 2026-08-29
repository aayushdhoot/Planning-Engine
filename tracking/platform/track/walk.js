// ===================================================================
// DnB-OS . platform/track/walk.js . THE DAILY WALK, LIVE
// One job: talk to the deployed capture link and fold what it says
// into a per pin state for the day. Three states, nothing else:
//   shot     a photo for this pin arrived today
//   blocked  the supervisor logged a reason, no later photo overrides it
//   dark     the pin was expected and nothing came
// Rules:
//   . the frozen register is the only list of pins, a stray number in
//     the feed is surfaced, never merged, never dropped
//   . a photo after a block flips the pin to shot, the walk view shows
//     what stands now, the ledger keeps the history
//   . fold() is pure so the guards can break it offline
//   . photos stay in Drive, the engine pulls bytes only when a pin is
//     clicked, one at a time
// ===================================================================

;(function (root) {

// The deployed /exec. One link serves the phone app, the day status,
// the file listing (?day=..&files=1) and photo bytes (?img=id).
// v3 deployed 17 Jul 2026. The link never changes across versions.
var EXEC = "https://script.google.com/macros/s/AKfycbxHhtS4dnl_tzPO-VqX_nk90_J4ewTxOKf-c_Xhak_jF_S_bVAIhr1X4DvoxnZ1UWq3Gw/exec";

// today in site time, Asia/Kolkata, as YYYY-MM-DD
function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// pure fold: register + day listing -> per pin state
// files:   [{no, id, name, by, time, size}]  (ascending time per pin)
// blocked: [{no, reason, by}]
function fold(pinsReg, files, blocked) {
  var pins = {}, strays = [];
  for (var i = 0; i < pinsReg.pins.length; i++) {
    var p = pinsReg.pins[i];
    pins[p.no] = { no: p.no, space: p.space, state: "dark" };
  }
  for (var j = 0; j < (blocked || []).length; j++) {
    var b = blocked[j];
    if (pins[b.no]) { pins[b.no].state = "blocked"; pins[b.no].reason = b.reason || ""; pins[b.no].by = b.by || ""; }
    else strays.push({ no: b.no, kind: "blocked", why: "blocked report for a pin not in the frozen register" });
  }
  for (var k = 0; k < (files || []).length; k++) {
    var f = files[k];
    if (pins[f.no]) {
      var o = pins[f.no];
      o.state = "shot"; // listing is time ascending, later entries are newer
      o.file = { id: f.id, name: f.name, by: f.by || "", time: f.time || "", size: f.size || 0 };
    }
    else strays.push({ no: f.no, kind: "photo", name: f.name, why: "photo for a pin not in the frozen register" });
  }
  var shot = 0, dark = 0, blockedN = 0;
  for (var no in pins) {
    if (pins[no].state === "shot") shot++;
    else if (pins[no].state === "blocked") blockedN++;
    else dark++;
  }
  return { pins: pins, shot: shot, dark: dark, blocked: blockedN, total: pinsReg.pins.length, strays: strays };
}

// ---- which days actually hold a photo for ONE pin --------------------
// dayFolds is { day -> fold }, folds already made by fold() above.
// Returns only the days that hold a photo for this pin, newest first.
//
// The law that matters here is what is NOT in the list. A day the link
// was never asked about is absent, and absent is not "dark": the date
// picker built on this may only offer days the engine has actually seen
// a photo for. Offering a day that turns out empty makes the engine look
// like it lost a photo it never had.
function daysForPin(dayFolds, pinNo) {
  var out = [];
  for (var day in (dayFolds || {})) {
    if (!Object.prototype.hasOwnProperty.call(dayFolds, day)) continue;
    if (fileForPin(dayFolds, pinNo, day)) out.push(day);
  }
  return out.sort(function (a, b) { return a < b ? 1 : (a > b ? -1 : 0); });
}

// the file one pin was shot with on one day, or null. Never a guess: a
// blocked pin and a dark pin both answer null, and so does a day that was
// never fetched, because none of the three is a photo.
function fileForPin(dayFolds, pinNo, day) {
  var f = (dayFolds || {})[day];
  var st = f && f.pins && f.pins[pinNo];
  return (st && st.state === "shot" && st.file) ? st.file : null;
}

// one line for the panel head
function summaryLine(s) {
  if (!s) return "walk link unreachable";
  var parts = [s.shot + " of " + s.total + " shot"];
  if (s.blocked) parts.push(s.blocked + " blocked");
  parts.push(s.dark + " dark");
  return parts.join(" · ");
}

// ---- network, browser only. Every call answers {ok:false,error} on
// failure, it never throws into the view.
function fetchJson(url, timeoutMs) {
  if (typeof fetch === "undefined") return Promise.resolve({ ok: false, error: "no fetch in this runtime" });
  var ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  var t = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 15000) : null;
  return fetch(url, ctl ? { signal: ctl.signal } : {})
    .then(function (r) { return r.json(); })
    .catch(function (e) { return { ok: false, error: String(e && e.name === "AbortError" ? "timed out" : e) }; })
    .finally(function () { if (t) clearTimeout(t); });
}

// 60s, not 15. Measured against the deployed link on 25 Aug 2026 the day
// listing answered in anything from 2.7s to 50s for the same day, the slow
// end being the Apps Script cold start plus the redirect to
// script.googleusercontent.com. At 15s the walk reported "timed out" and
// drew the layout with every pin dark, which reads as "the site did not
// shoot" when the truth was "the engine hung up first". The same correction
// was already made to fetchImg below, for the same reason.
function fetchDay(day) {
  return fetchJson(EXEC + "?day=" + encodeURIComponent(day) + "&files=1", 60000);
}

// 45s, not 30. The deployed link answers an image in anything from four
// to seventeen seconds on its own, and more when several are queued, so a
// 30s ceiling was cutting off calls that would have succeeded.
function fetchImg(id) {
  return fetchJson(EXEC + "?img=" + encodeURIComponent(id), 45000);
}

root.TRACK_WALK = { EXEC: EXEC, todayIST: todayIST, fold: fold, summaryLine: summaryLine,
  daysForPin: daysForPin, fileForPin: fileForPin, fetchDay: fetchDay, fetchImg: fetchImg };
if (typeof module !== "undefined") module.exports = root.TRACK_WALK;

})(typeof window !== "undefined" ? window : globalThis);
