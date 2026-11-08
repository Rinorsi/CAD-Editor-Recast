#!/bin/bash
# 无头截图物品工坊页面（不启动游戏）。每次都从 Editor/ui 现取源码，截图写进当天 daily。
#   bash tools/preview/shot.sh <尺寸 如 640x360> <名字> [动作文件绝对路径]
#   环境变量：SCALE（默认 2）FRAMES（默认 30，大尺寸时调小）PAGE（默认 index.html）
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODS="$(cd "$HERE/.." && pwd -W)"; MODS_U="$(cd "$HERE/.." && pwd)"
DAY="$(bash "$MODS_U/Oriel-UI-Workspace/tools/new-day.sh")"; DAYW="$(cygpath -w "$DAY")"
S="$DAY/scratch/editor-page"; rm -rf "$S"; mkdir -p "$S/assets/cadeditor" "$DAY/screenshots/editor-ui"
cp -R "$MODS_U/Oriel-UI/kit/src/main/resources/assets/oriel" "$S/assets/"
cp -R "$HERE/common/src/main/resources/assets/cadeditor/ui" "$S/assets/cadeditor/ui"; cp "${FIXTURE:-$HERE/tools/preview/legacy/preview-stack.js}" "$S/assets/cadeditor/ui/preview-stack.js"
sed -i 's#<script src="js/app.js">#<script src="preview-stack.js"></script>\n<script src="js/app.js">#' "$S/assets/cadeditor/ui/index.html"
[ -n "$POSTJS" ] && cp "$POSTJS" "$S/assets/cadeditor/ui/post.js" && sed -i 's#<script src="js/app.js"></script>#<script src="js/app.js"></script><script src="post.js"></script>#' "$S/assets/cadeditor/ui/index.html"
[ "$THEME" = light ] && sed -i 's/data-theme="dark"/data-theme="light"/' "$S/assets/cadeditor/ui/index.html"
export JAVA_HOME="$(cygpath -u "$USERPROFILE")/.jdks/jdk-25.0.5+8"; export PATH="$JAVA_HOME/bin:$PATH"
export ORIEL_MC_JAR="$MODS/Oriel-UI/common/versions/26.1/build/moddev/artifacts/vanilla-26.1.2-1-merged.jar"
cd "$MODS_U/Oriel-UI"
A=${3:+--actions $3}
MSYS_NO_PATHCONV=1 java -cp "preview/build/install/preview/lib/*" dev.oriel.preview.Preview "$(cygpath -w "$S")/assets/cadeditor/ui/${PAGE:-index.html}" \
  --size "$1" --scale ${SCALE:-2} --frames ${FRAMES:-30} $A --out "$DAYW/screenshots/editor-ui/$2" --snapshot "$DAYW/screenshots/editor-ui/$2.png" 2>&1 | grep -v "^Minecraft assets" | head -20
