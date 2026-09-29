#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required. Install it from nodejs.org, then run this file again."
  read -r -p "Press Return to close..."
  exit 1
fi
if [ ! -d node_modules ]; then npm ci || exit 1; fi
(sleep 2; open http://127.0.0.1:3000) &
npm start
