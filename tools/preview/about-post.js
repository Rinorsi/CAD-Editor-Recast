/* 预览用：打开设置弹窗，带上宿主会给的版本号，看底部的「关于」区 */
setTimeout(function () {
  try { Prefs.about = { version: '0.99.5' }; openSettings(); } catch (e) { console.log('about preview: ' + e); }
}, 300);
