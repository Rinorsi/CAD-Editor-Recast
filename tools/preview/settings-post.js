/* 预览用：打开设置弹窗（常规页） */
setTimeout(function () {
  try { Prefs.about = { version: '0.99.5' }; openSettings(); } catch (e) { console.log('settings preview: ' + e); }
}, 300);
