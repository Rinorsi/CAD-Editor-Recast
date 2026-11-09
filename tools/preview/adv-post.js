/* 预览用：打开设置弹窗，切到「高级」页 */
setTimeout(function () {
  try {
    openSettings();
    var tabs = document.querySelectorAll('.k-modal .ed-tab'); if (tabs[1]) tabs[1].dispatchEvent(new Event('click'));
  } catch (e) { console.log('adv preview: ' + e); }
}, 300);
