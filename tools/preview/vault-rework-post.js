var fake = [{ id: 'a', kind: 'item', name: '钻石', tags: ['材料'], note: '', item: { id: 'minecraft:diamond', count: 1 }, summary: {} },
  { id: 'b', kind: 'item', name: '附魔钻石剑', tags: ['武器', '附魔'], note: '测试用', item: { id: 'minecraft:diamond_sword', count: 1 }, summary: { enchantCount: 3 } },
  { id: 'c', kind: 'item', name: '潜影盒', tags: [], note: '', item: { id: 'minecraft:shulker_box', count: 1 }, summary: { containerSize: 4 } },
  { id: 'd', kind: 'item', name: '金苹果', tags: ['食物'], note: '', item: { id: 'minecraft:golden_apple', count: 16 }, summary: {} },
  { id: 'e', kind: 'item', name: '下界合金镐', tags: ['工具'], note: '', item: { id: 'minecraft:netherite_pickaxe', count: 1 }, summary: {} }];
Vault.call = function (op, f, cb) {
  var r = { ok: true };
  if (op === 'list') { r.entries = fake; r.total = fake.length; r.done = true; }
  else if (op === 'tags') r.tags = [{ name: '武器', count: 1 }, { name: '材料', count: 1 }];
  else if (op === 'stats') { r.op = 'stats'; r.entries = fake.length; r.bytes = 1000; }
  setTimeout(function () { cb(r); }, 0);
};
Vault.undo = { token: 't', until: Date.now() + 29000 };
openVault();
setTimeout(function () { var hs = document.querySelectorAll('.k-xhead'); if (hs[1]) hs[1].dispatchEvent(new Event('click')); }, 400);
