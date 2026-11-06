/* 仅浏览器预览加载（不进游戏）：补字体、引擎 UA 样式差异，并提供游戏图标索引。
   本文件由 tools/extract-mc-icons.mjs 生成：此头部来自 tools/mock.head.js，末尾追加 ED_MC 索引。 */
(function () {
  var me = document.currentScript && document.currentScript.src || '';
  window.ED_MC_BASE = me.replace(/browser\/mock\.js.*$/, 'browser/mc/');
  var font = me.replace(/browser\/mock\.js.*$/, 'assets/oriel/font/fusion_pixel_12.ttf');
  var s = document.createElement('style');
  s.textContent = [
    '@font-face { font-family: "Fusion12"; src: url("' + font + '"); }',
    'html { font-size: 12px !important; font-family: "Fusion12", "Microsoft YaHei UI", "PingFang SC", "Noto Sans CJK SC", sans-serif !important; }',
    'body { margin: 0; }',
    'input, textarea, button { font: inherit; }',
    '.k-ico, .slot img { image-rendering: pixelated; }',
    /* -mc-tint 浏览器不认：亮色主题下把白色图标压暗 */
    '[data-theme=light] .o-ico { filter: invert(1) brightness(0.35); }',
    '[data-theme=light] .k-btn.pri .o-ico { filter: none; }',
  ].join('\n');
  document.head.appendChild(s);
})();
