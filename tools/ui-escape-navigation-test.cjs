const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const H = require('./lib/ui-harness.cjs');
const events = {};
const t = H.create({ documentEvents: events });
const c = t.c, doc = t.doc;
const app = fs.readFileSync(path.join(t.dir, 'js/app.js'), 'utf8');
vm.runInContext(app.slice(0, app.lastIndexOf('boot();')), c, { filename: 'js/app.js' });
c.snd = () => {}; c.toast = () => {};
let closes = 0;
c.oriel.close = () => { closes++; };
c.Store.open({ id: 'minecraft:stone', count: 1, comps: {}, removed: {} }, true);
c.rebuild();
function escape(target, extra = {}) {
  const start = t.timers.length;
  const e = Object.assign({ key: 'Escape', target: target || doc.body, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} }, extra);
  if (target) for (const fn of target.events.keydown || []) fn(e);
  for (const fn of events.keydown || []) fn(e);
  for (const timer of t.timers.slice(start)) if (timer.ms === 0) timer.fn();
  return e.defaultPrevented;
}

// Real windows, their DOM/scroll/focus and three levels of modal ancestry.
c.openAdvanced('all');
const advanced = doc.getElementById('modal');
advanced.scrollTop = 73;
c.openSettings();
const settings = doc.getElementById('modal');
assert.notEqual(settings, advanced);
assert.equal(c.ModalParents.length, 1, 'settings keeps advanced page');
const focus = c.h('input'); settings.appendChild(focus); focus.focus();
c.openModal(c.modalShell('第三级', '', [], []), true);
assert.equal(c.ModalParents.length, 2);
assert.equal(escape(null, { repeat: true }), true, 'holding Escape must not skip levels');
assert.equal(c.ModalParents.length, 2);
assert.equal(escape(), true);
assert.equal(doc.getElementById('modal'), settings);
assert.equal(doc.activeElement, focus);
assert.equal(c.ModalParents.length, 1);

// A local input handler consumes Escape before the same event bubbles to app.js.
const input = c.h('input'); settings.appendChild(input);
c.kPopover(input, c.h('div', { text: '候选' }));
c.onKey(input, { Escape() { c.kPopClose(); } });
assert.equal(escape(input, { repeat: true }), true);
assert.ok(c.KPop.el, 'held Escape cannot close an input popup either');
assert.equal(escape(input), true);
assert.equal(c.KPop.el, null);
assert.equal(doc.getElementById('modal'), settings, 'local popup closure cannot also close its parent');
assert.equal(escape(), true);
assert.equal(doc.getElementById('modal'), advanced);
assert.equal(advanced.scrollTop, 73);
assert.equal(escape(), true);
assert.equal(doc.getElementById('modal'), null);
assert.equal(escape(), false, 'only root Escape reaches the native inventory-return screen');

// Detail entry used to replace (and destroy) the window that opened it.
c.openSettings();
const detailParent = doc.getElementById('modal');
c.openDetail({ cid: 'custom_model_data' });
assert.equal(c.ModalParents.length, 1);
assert.ok(doc.getElementById('detailwin'));
escape(); assert.equal(doc.getElementById('modal'), detailParent);
escape();

// Ordinary vault opening keeps its parent, just like the existing picker variant.
c.openSettings();
const vaultParent = doc.getElementById('modal');
c.openVault();
assert.equal(c.ModalParents.length, 1);
escape(); assert.equal(doc.getElementById('modal'), vaultParent);
escape();

// Two actual nested item documents return one at a time, keeping parent drafts.
const main = c.Store.doc();
const options = { render() {}, commit() { throw Error('Escape must not silently save'); } };
c.openNestedItem({ id: 'minecraft:chest', count: 1, comps: {}, removed: {} }, options);
const child = c.Store.doc(), firstSession = c.NestedItem;
c.openNestedItem({ id: 'minecraft:stone', count: 1, comps: {}, removed: {} }, options);
c.Store.setCount(3);
assert.equal(escape(), true);
assert.match(doc.getElementById('modal').textContent, /返回父页面/);
assert.equal(c.Store.doc().count, 3);
assert.equal(escape(), true, 'Escape in unsaved prompt continues editing');
assert.equal(doc.getElementById('modal'), null);
assert.equal(c.Store.doc().count, 3);
escape();
const discard = doc.getElementById('modal').querySelectorAll('.k-btn').find(b => b.textContent === '放弃并返回');
assert.ok(discard); discard.fire('click');
assert.equal(c.Store.doc(), child);
assert.equal(c.NestedItem, firstSession);
assert.equal(escape(), true);
assert.equal(c.Store.doc(), main);
assert.equal(c.NestedItem, null);
assert.equal(escape(), false);
assert.equal(closes, 0, 'no inner Escape directly closes the native screen');
assert.equal(t.sent.filter(([key]) => ['apply', 'apply_world', 'open_world'].includes(key)).length, 0);
console.log('PASS Escape navigation: three modal levels, focus/scroll, consumed input, held key, detail parent, two nested documents, dirty guard and native root boundary.');
