#!/bin/bash
# 截图基线 / 对比：重构前后各跑一次，按名字对比 logs/ui/<标签>/*.png（图片不入库，只存 logs/）。
#   bash tools/preview/baseline.sh baseline      重构前的基线（原来的 4 张）
#   bash tools/preview/baseline.sh after         改完后的对照
#   bash tools/preview/baseline.sh wide css0     更多场景（展开的卡片、弹窗、提示、世界页……）；改 CSS 前后各跑一次，标签不同
#   bash tools/preview/baseline.sh wide css1 css0   和 css0 逐张按字节比对
# 字节完全相同的会标出 same，不同的标 DIFF。
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; MODE="$1"; TAG="${2:-baseline}"; AGAINST="${3:-baseline}"
if [ "$MODE" != "wide" ]; then TAG="${1:-baseline}"; AGAINST="baseline"; MODE=basic; fi
OUT="$HERE/logs/ui/$TAG"; mkdir -p "$OUT"
DAY="$(bash "$HERE/../Oriel-UI-Workspace/tools/new-day.sh")"; SHOTS="$DAY/screenshots/editor-ui"
export SCALE=1 FRAMES=${FRAMES:-45}
P="$HERE/tools/preview"
run() { # 名字 尺寸 post.js [fixture.js]
  local name="$1" size="$2" post="$3" fixture="$4"
  if [ -n "$post" ]; then export POSTJS="$(cd "$(dirname "$post")" && pwd -W)/$(basename "$post")"; else unset POSTJS; fi
  if [ -n "$fixture" ]; then export FIXTURE="$(cd "$(dirname "$fixture")" && pwd -W)/$(basename "$fixture")"; else unset FIXTURE; fi
  bash "$P/shot.sh" "$size" "base-$name" >/dev/null 2>&1
  cp "$SHOTS/base-$name.png" "$OUT/$name.png" 2>/dev/null && echo "ok   $name" || echo "FAIL $name"
}
if [ "$MODE" = basic ]; then
  run item-default 760x560 ""
  run world-chest 760x560 "$P/world-post.js"
  run player 760x560 "$P/player-post.js"
  run player-narrow 400x330 "$P/player-post.js"
else
  run w-item-expanded 760x560 "$P/css-expand.js"
  run w-item-small 480x300 "$P/css-expand.js"
  run w-spawner-expanded 760x560 "$P/css-expand.js" "$P/spawn-stack.js"
  run w-toasts 760x300 "$P/css-toasts.js"
  run w-win-advanced 760x560 "$P/css-win-advanced.js"
  run w-win-add 760x560 "$P/css-win-add.js"
  run w-win-detail 760x560 "$P/css-win-detail.js"
  run w-win-pick 760x560 "$P/css-win-pick.js"
  run w-world-chest-small 480x300 "$P/world-post.js"
  run w-world-spawner 760x560 "$P/spawner-post.js"
  run w-world-pig 760x420 "$P/pig-post.js"
  run w-player-inv 760x420 "$P/player-post.js"
  run w-player-status 760x420 "$P/css-player-status.js"
  run w-vault 760x420 "$P/css-vault.js"
fi
if [ "$TAG" != "$AGAINST" ] && [ -d "$HERE/logs/ui/$AGAINST" ]; then
  for f in "$OUT"/*.png; do n="$(basename "$f")"; if [ -f "$HERE/logs/ui/$AGAINST/$n" ]; then if cmp -s "$f" "$HERE/logs/ui/$AGAINST/$n"; then echo "same $n"; else echo "DIFF $n"; fi; fi; done
fi
