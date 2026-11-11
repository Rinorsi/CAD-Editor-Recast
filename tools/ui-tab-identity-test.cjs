const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const { c, doc } = H.create();
c.snd = () => {}; c.toast = () => {}; c.Reg.meta = {};
c.Store.open({id:'minecraft:stone', count:1, comps:{}, removed:{}}, true);
c.rebuild();
let checked = 0;
for (const kind of Object.keys(c.PAGES)) {
  c.kindOfItem = () => kind;
  const tabs = c.tabsOfKind(kind);
  const ids = Array.from(tabs, t => t.id);
  assert.equal(new Set(ids).size, ids.length, kind + ': tab IDs must be unique');
  assert.equal(tabs[0].label, '物品栈');
  for (const tab of tabs) {
    c.UI.tab = tab.id;
    c.drawTabbar();
    const active = doc.getElementById('tabbar').querySelectorAll('.ed-tab.on');
    assert.equal(active.length, 1, kind + '/' + tab.id + ': exactly one selected tab');
    assert.equal(active[0].id, 'edtab-' + tab.id);
    checked++;
  }
}
c.kindOfItem = () => 'generic';
c.UI.tab = 'stack';
c.drawEdit();
assert.equal(c.UI.tab, 'stack', 'existing durability route remains available');
assert.equal(doc.getElementById('edtab-stack').textContent, '堆叠与耐久');
assert.equal(doc.getElementById('edbody').querySelectorAll('.item-raw').length, 0, 'durability must not render the raw stack editor');
console.log('PASS tab identities: ' + checked + ' selections, all item kinds, legacy durability route intact');
