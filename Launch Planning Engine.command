#!/bin/bash
# Double-click this file to open the Planning Engine in your browser.
# This opens the pre-built app (dist/index.html) directly — no install needed.
# Use this for everyday use, including Option A (import a folder manifest).
#
# Note: Google Drive live-scan (Option B on the New Project tab) needs the app
# served over http://, not opened as a file. If you want to use live scanning,
# double-click "Start Dev Server (for live Drive scan).command" instead.

cd "$(dirname "$0")"
open "dist/index.html"
