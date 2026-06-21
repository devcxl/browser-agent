#!/bin/bash
set -euo pipefail
echo "Cleaning dist..."
rm -rf dist/
echo "Building Chrome..."
npm run build:chrome
echo "Building Firefox..."
npm run build:firefox
echo "Creating zip packages..."
npm run zip:chrome
npm run zip:firefox
echo "Build complete!"
ls -lh dist/
