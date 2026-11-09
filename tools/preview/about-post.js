/* 预览用：打开设置弹窗，切到「关于」页，带上宿主会给的版本号 */
setTimeout(function () {
  try {
    Prefs.about = { version: '0.99.5' }; openSettings();
    var tabs = document.querySelectorAll('.k-modal .ed-tab'); if (tabs[2]) tabs[2].dispatchEvent(new Event('click'));
  } catch (e) { console.log('about preview: ' + e); }
}, 300);
