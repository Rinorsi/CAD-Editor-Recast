#!/bin/bash
# 截图基线 / 对比：重构前后各跑一次，按名字对比 logs/ui/<标签>/*.png（图片不入库，只存 logs/）。
#   bash tools/preview/baseline.sh baseline      重构前的基线
#   bash tools/preview/baseline.sh after         改完后的对照
# 之后用肉眼或任意图片对比工具逐张看；字节完全相同的会标出来。
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; TAG="${1:-baseline}"
OUT="$HERE/logs/ui/$TAG"; mkdir -p "$OUT"
DAY="$(bash "$HERE/../Oriel-UI-Workspace/tools/new-day.sh")"; SHOTS="$DAY/screenshots/editor-ui"
export SCALE=1 FRAMES=${FRAMES:-30}
run() { # 名字 尺寸 post.js
  local name="$1" size="$2" post="$3"
  if [ -n "$post" ]; then POSTJS="$(cd "$(dirname "$post")" && pwd -W)/$(basename "$post")" bash "$HERE/tools/preview/shot.sh" "$size" "base-$name" >/dev/null 2>&1; else unset POSTJS; bash "$HERE/tools/preview/shot.sh" "$size" "base-$name" >/dev/null 2>&1; fi
  cp "$SHOTS/base-$name.png" "$OUT/$name.png" 2>/dev/null && echo "ok   $name" || echo "FAIL $name"
}
run item-default 760x560 ""
run world-chest 760x560 "$HERE/tools/preview/world-post.js"
run player 760x560 "$HERE/tools/preview/player-post.js"
run player-narrow 400x330 "$HERE/tools/preview/player-post.js"
if [ "$TAG" != "baseline" ] && [ -d "$HERE/logs/ui/baseline" ]; then
  for f in "$OUT"/*.png; do n="$(basename "$f")"; if cmp -s "$f" "$HERE/logs/ui/baseline/$n"; then echo "same $n"; else echo "DIFF $n"; fi; done
fi
