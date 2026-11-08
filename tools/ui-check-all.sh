#!/bin/bash
# 一次跑完所有界面检查（在仓库根目录运行）。任何一项失败就退出码 1。
cd "$(dirname "$0")/.."; bad=0
for t in ui-components-test ui-slots-test ui-world-test ui-blockviews-test ui-contract-test ui-compact-test ui-nbt-test ui-search-test ui-snapshot ui-lint; do
  node tools/$t.cjs >"/tmp/ck-$t.log" 2>&1; rc=$?; [ $rc -ne 0 ] && bad=1
  echo "$t exit=$rc $(tail -1 /tmp/ck-$t.log | cut -c1-90)"
done
for f in fabric/src/main/resources/assets/cadeditor/ui/js/*.js; do node --check "$f" 2>/dev/null || { echo "语法错误 $f"; bad=1; }; done
exit $bad
