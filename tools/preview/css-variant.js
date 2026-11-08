/* 预览用：切到「附加设置」页（物品带了变种类组件时才有），展开全部卡片 */
setTimeout(function () {
  try {
    UI.tab = 'more'; drawTabbar(); drawTabBody();
    (UI.page && UI.page.cards || []).forEach(function (c) { try { c.setCollapsed(false); } catch (e) {} });
  } catch (e) { console.log('variant preview: ' + e); }
}, 300);