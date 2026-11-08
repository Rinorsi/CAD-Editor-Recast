#!/bin/bash
# 新生物视图的无头截图（掉落物 / 下落方块 / 狼的关系页 / 药水云）：bash tools/preview/entity-views.sh [标签]
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; TAG="${1:-ev}"
OUT="$HERE/logs/ui/$TAG"; mkdir -p "$OUT"
DAY="$(bash "$HERE/../Oriel-UI-Workspace/tools/new-day.sh")"; SHOTS="$DAY/screenshots/editor-ui"
export SCALE=1 FRAMES=${FRAMES:-45}
for n in falling wolf cloud dropped; do
  export POSTJS="$(cd "$HERE/tools/preview" && pwd -W)/entity-$n-post.js"
  bash "$HERE/tools/preview/shot.sh" 760x420 "$TAG-$n" >/dev/null 2>&1
  cp "$SHOTS/$TAG-$n.png" "$OUT/$n.png" 2>/dev/null && echo "ok   $n" || echo "FAIL $n"
done
