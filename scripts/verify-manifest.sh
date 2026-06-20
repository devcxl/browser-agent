#!/bin/bash
set -euo pipefail
echo "Verifying manifests..."
# Find manifest files in dist
for dir in dist/*/; do
  if [ -f "${dir}manifest.json" ]; then
    BROWSER=$(basename "$dir")
    echo "  Checking $BROWSER..."
    if echo "$BROWSER" | grep -q "chrome"; then
      jq -e '.permissions | contains(["tabGroups"])' "${dir}manifest.json" > /dev/null && echo "    ✅ tabGroups present" || echo "    ❌ tabGroups missing"
    fi
    if echo "$BROWSER" | grep -q "firefox"; then
      jq -e '.browser_specific_settings.gecko.id' "${dir}manifest.json" > /dev/null && echo "    ✅ gecko.id present" || echo "    ❌ gecko.id missing"
      jq -e '.permissions | contains(["tabGroups"])' "${dir}manifest.json" > /dev/null && echo "    ❌ tabGroups should NOT be present" || echo "    ✅ tabGroups absent"
    fi
    jq -e '.manifest_version == 3' "${dir}manifest.json" > /dev/null && echo "    ✅ MV3" || echo "    ❌ Not MV3"
  fi
done
