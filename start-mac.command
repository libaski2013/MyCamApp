#!/bin/bash
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required. Install it from nodejs.org and run this file again."
  read -r -p "Press Return to close..."
  exit 1
fi
if [ ! -d node_modules ]; then
  npm ci || { echo "Install failed. Read the error above."; read -r -p "Press Return to close..."; exit 1; }
fi
npm run launch
read -r -p "MyCam stopped. Press Return to close..."
