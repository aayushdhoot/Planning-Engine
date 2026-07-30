#!/bin/bash
# Double-click for development mode (hot reload). Drive link scanning works here too.
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)..."
  npm install --legacy-peer-deps
fi
npm run dev -- --open
