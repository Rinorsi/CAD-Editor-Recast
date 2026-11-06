// Folder-preview fixture only. Not part of the distributable mod.
// A real Editor host owns both the stack and apply handler, including after reload.
if (!(typeof oriel !== 'undefined' && oriel.data && oriel.data.stack)) {
var ORIEL_STACK = {
  id: 'minecraft:diamond_sword', count: 1, comps: {}, removed: {},
  label: '演示钻石剑（仅界面预览）', slot: { kind: 'preview', index: 0 }
};
applyToGame = function () {
  toast('当前是文件夹界面预览：草稿不会写入真实物品', 'info');
};
}
