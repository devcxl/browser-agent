#!/bin/bash
MAX_SIZE_KB=2048
for f in dist/*.zip; do
  SIZE_KB=$(du -k "$f" | cut -f1)
  NAME=$(basename "$f")
  if [ "$SIZE_KB" -gt "$MAX_SIZE_KB" ]; then
    echo "❌ $NAME: ${SIZE_KB}KB (exceeds ${MAX_SIZE_KB}KB)"
    exit 1
  else
    echo "✅ $NAME: ${SIZE_KB}KB"
  fi
done
