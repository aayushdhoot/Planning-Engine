#!/bin/bash
# Double-click to run the Planning Engine.
#
# This builds the app and serves it locally. The local server also proxies Google Drive, so
# pasting a project folder link works here — opening dist/index.html straight off disk cannot
# do that, because Drive sends no CORS headers and a bare file has no server to proxy through.

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)..."
  npm install --legacy-peer-deps
fi

echo "Building and starting — the app will open at http://localhost:4173"
npm run build && (sleep 2 && open http://localhost:4173) & node scripts/serve.mjs
