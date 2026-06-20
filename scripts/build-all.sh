#!/bin/bash
set -euo pipefail
echo "Cleaning dist..."
rm -rf dist/
echo "Building & packaging Chrome..."
npx wxt zip -b chrome
echo "Building & packaging Firefox..."
npx wxt zip -b firefox --mv3
echo "Build complete!"
ls -lh dist/
