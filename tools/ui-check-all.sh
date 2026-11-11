#!/bin/bash
# 一次跑完所有界面及自身玩家契约检查。任何一项失败就退出码 1；缺脚本也必须失败。
# 参数1（或 UI_CHECK_LOG_DIR）指定完整日志目录；默认保留原 /tmp 位置。
# self-player-document / self-player-next-codec 会调用 PATH 中的 java 执行生产代码提取，需 JDK 25。
cd "$(dirname "$0")/.." || exit 1
bad=0
log_dir="${1:-${UI_CHECK_LOG_DIR:-/tmp}}"
mkdir -p -- "$log_dir" || exit 1
for t in ui-components-test ui-tool-batch-test ui-picker-selection-test ui-code-toolbar-test ui-slots-test ui-nested-item-test ui-nested-container-test ui-consume-effects-refresh-test code-indent-test ui-world-test ui-blockviews-test ui-playerx-test ui-player-actions-test ui-genericview-test ui-vaultworld-test ui-entity-vault-picker-test ui-mobsound-test ui-code-test ui-stack-page-test ui-tab-identity-test ui-bucket-test ui-problem-loading-test ui-quick-special-number-test ui-entityviews-test ui-spawnequip-test ui-contract-test ui-compact-test ui-nbt-test ui-special-float-preview-test ui-nbt-entry-test ui-nbt-reload-test ui-nbt-validation-route-test ui-live-registry-test ui-search-test ui-diagnostics-test ui-snapshot ui-lint ui-sidebar-layout-test ui-scale-test ui-self-player-capabilities-test self-player-document-test ui-self-player-next-test self-player-next-codec-test ui-self-player-inflight-test ui-self-player-permission-hints-test; do
  node "tools/$t.cjs" >"$log_dir/ck-$t.log" 2>&1; rc=$?; [ $rc -ne 0 ] && bad=1
  echo "$t exit=$rc $(tail -1 "$log_dir/ck-$t.log" | cut -c1-90)"
done
node tools/ui-linked-limits-test.cjs >"$log_dir/ck-ui-linked-limits-test.log" 2>&1; rc=$?; [ $rc -ne 0 ] && bad=1
echo "ui-linked-limits-test exit=$rc $(tail -1 "$log_dir/ck-ui-linked-limits-test.log" | cut -c1-90)"
node tools/ui-escape-navigation-test.cjs >"$log_dir/ck-ui-escape-navigation-test.log" 2>&1; rc=$?; [ $rc -ne 0 ] && bad=1
echo "ui-escape-navigation-test exit=$rc $(tail -1 "$log_dir/ck-ui-escape-navigation-test.log" | cut -c1-90)"
node tools/ui-item-drafts-test.cjs >"$log_dir/ck-ui-item-drafts-test.log" 2>&1; rc=$?; [ $rc -ne 0 ] && bad=1
echo "ui-item-drafts-test exit=$rc $(tail -1 "$log_dir/ck-ui-item-drafts-test.log" | cut -c1-90)"
node tools/ui-nbt-nested-routes-test.cjs >"$log_dir/ck-ui-nbt-nested-routes-test.log" 2>&1; rc=$?; [ $rc -ne 0 ] && bad=1
echo "ui-nbt-nested-routes-test exit=$rc $(tail -1 "$log_dir/ck-ui-nbt-nested-routes-test.log" | cut -c1-90)"
: >"$log_dir/ck-ui-syntax.log"
for f in common/src/main/resources/assets/cadeditor/ui/js/*.js; do node --check "$f" >>"$log_dir/ck-ui-syntax.log" 2>&1 || { echo "语法错误 $f"; bad=1; }; done
exit $bad
