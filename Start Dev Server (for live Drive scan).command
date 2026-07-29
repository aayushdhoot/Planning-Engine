#!/bin/bash
# Double-click this file to run the Planning Engine in dev mode.
# Use this only if you've set up a Google OAuth client ID and want live
# Drive folder scanning (Option B on the New Project tab) to work.
#
# First run will take a minute or two (installs dependencies).

cd "$(dirname "$0")"

if [ -d node_modules ]; then
  echo "Removing stale node_modules (known issue — see README.md)..."
  rm -rf node_modules
fi

echo "Installing dependencies..."
npm install --legacy-peer-deps

echo "Starting dev server — the app will open at http://localhost:5173"
npm run dev -- --open
