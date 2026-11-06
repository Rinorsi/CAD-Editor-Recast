#!/bin/bash
# 用最近一次 oriel_check 生成的页面包，按动作脚本在无头预览器里截图（不启动游戏）。
#   bash tools/shot.sh <尺寸 如 640x360> <动作文件> <输出名前缀> [lang]
# 动作文件语法见 Oriel-UI/docs/zh/validation.md（wait/move/click/key/type/shot）。图片输出到工作区 daily/<今天>/screenshots/editor-ui/。
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -W)"
MODS="$(cd "$HERE/.." && pwd -W)"
DAY="$(date +%F)"
export JAVA_HOME="$(cygpath -u "$USERPROFILE")/.jdks/jdk-25.0.5+8"; export PATH="$JAVA_HOME/bin:$PATH"
export ORIEL_MC_JAR="$MODS/Oriel-UI/common/versions/26.1/build/moddev/artifacts/vanilla-26.1.2-1-merged.jar"
REV="$(ls -dt "$MODS"/Oriel-UI-Workspace/daily/2026-11-05/scratch/mcp-editor-ui/revisions/rev-*/ | head -1)"
PAGE="${REV}pack/assets/cadeditor/ui/index.html"
OUT="$MODS/Oriel-UI-Workspace/daily/$DAY/screenshots/editor-ui/$3"
mkdir -p "$OUT"
LANGARG=${4:+--lang $4}
MSYS_NO_PATHCONV=1 java -cp "$MODS/Oriel-UI/preview/build/install/preview/lib/*" dev.oriel.preview.Preview "$PAGE" \
  --size "$1" --scale ${SCALE:-2} $LANGARG --actions "$2" --out "$OUT" 2>&1 | grep -v "^Minecraft assets" | head -20
echo "out: $OUT"; ls "$OUT"
