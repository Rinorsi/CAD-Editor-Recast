const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { create } = require('./lib/ui-harness.cjs');

for (const value of [0, 1, 2, 3, 4]) {
  const h = create(), c = h.c;
  c.Prefs.init({ hostPrefs: true, prefs: { uiScale: value } });
  assert.equal(c.UI.uiScale, value, 'saved native scale restored');
  assert.equal(c.UI.uiScaleActive, value);
  assert.equal(c.uiScaleFactor(), 1, 'DOM dimensions require no second coordinate conversion');
  c.openSettings();
  assert.match(h.root.textContent, /编辑器界面比例/);
  assert.match(h.root.textContent, /自动跟随 Minecraft GUI/);
  assert.match(h.root.textContent, /编辑器和提示框/);
  const choices = h.root.querySelectorAll('.k-segi');
  const scale = choices.filter(e => ['自动', '1', '2', '3', '4'].includes(e.textContent));
  assert.equal(scale.length, 5, 'all native scale choices visible in existing settings');
  for (const choice of scale) choice.click();
  assert.ok(h.sent.some(x => x[0] === 'prefs' && x[1].key === 'uiScale' && x[1].value === 4));
}
for (const value of [-1, 5, 100, 2.5, '2', true, null]) {
  const { c } = create();
  c.Prefs.init({ hostPrefs: true, prefs: { uiScale: value } });
  assert.equal(c.UI.uiScale, 0, 'invalid/legacy percentages fall back to automatic');
}
{
  const h = create(), c = h.c;
  c.Prefs.init({ hostPrefs: true, prefs: {} });
  assert.equal(c.UI.uiScale, 0, 'default follows Minecraft');
  c.Store.open({ id: 'minecraft:stone', count: 1, comps: { custom_name: '保留草稿' } }, true);
  const draft = c.Store.doc(), baseline = draft.base, history = draft.hist;
  c.UI.uiScale = 3; c.Prefs.set('uiScale', 3); c.applyUiScale();
  assert.equal(c.Store.doc(), draft, 'scale does not replace draft');
  assert.equal(c.Store.doc().base, baseline, 'scale never changes item baseline');
  assert.equal(c.Store.doc().hist, history, 'undo history survives scale change');
}
const ui = path.resolve(__dirname, '../common/src/main/resources/assets/cadeditor/ui');
const css = fs.readFileSync(path.join(ui, 'editor.css'), 'utf8');
assert.doesNotMatch(css, /\.k-(?:xrow|en):hover[^}]*transform\s*:/, 'list hover must not move its hit boundary');
assert.doesNotMatch(css, /--ui-scale|--ui-logical-size/, 'no CSS workspace scaling remains');
const host = fs.readFileSync(path.resolve(ui, '../../../../java/dev/rinorsi/editor/client/EditorPageHost.java'), 'utf8');
assert.ok(host.includes('driver.uiScale(uiScalePreference())'), 'page-load hook uses official API');
assert.ok(host.includes('EditorPrefs.accept(value);') && host.includes('screen.driver().uiScale(uiScalePreference())'), 'live prefs resize same driver');
const toastHost = fs.readFileSync(path.resolve(ui, '../../../../java/dev/rinorsi/editor/client/EditorToast.java'), 'utf8');
assert.match(toastHost, /OrielHud\.show\(ID\)\.uiScale\(value\)/);
assert.match(host, /EditorToast\.refreshScale\(\)/);
console.log('PASS native editor scale: auto/1..4, strict settings, preference channel, reopen, draft identity, no CSS transform.');
for (const mode of ['remember', 'maximized', 'windowed', 'invalid', null]) {
  for (const savedMax of [false, true]) {
    const h = create(), c = h.c;
    const saved = { windowMode: mode, windowMax: savedMax, winW: 720, winH: 410, heroWidth: 150 };
    c.Prefs.init({ hostPrefs: true, prefs: saved });
    const expected = mode === 'maximized' || (mode !== 'windowed' && mode !== 'maximized' && savedMax);
    assert.equal(c.UI.maxed, expected, 'opening mode applied to remembered geometry');
    assert.equal(c.UI.winW, 720); assert.equal(c.UI.winH, 410); assert.equal(c.UI.heroW, 150);
    c.openSettings();
    const choices = h.root.querySelector('#editor-window-mode').querySelectorAll('.k-segi');
    assert.equal(choices.length, 3);
    choices[1].click();
    assert.equal(c.UI.maxed, expected, 'opening mode changes next opening, not current window');
    assert.equal(c.Prefs.vals.windowMode, 'maximized');
    assert.ok(h.sent.some(x => x[0] === 'prefs' && x[1].key === 'windowMode' && x[1].value === 'maximized'));
    c.Prefs.init({ hostPrefs: true, prefs: c.Prefs.vals });
    assert.equal(c.UI.maxed, true, 'reopen applies selected mode');
  }
}
{
  const h = create(), c = h.c;
  const input = c.h('input', { class: 'k-input', placeholder: '搜索效果名称或 ID；也可直接输入 模组id::效果id' });
  let searched; const control = c.kSearchBox(input, q => { searched = q; });
  assert.equal(input.getAttribute('placeholder'), '搜索效果名称或 ID');
  assert.match(input.getAttribute('data-tip') || input.getAttribute('title'), /模组id::效果id/);
  input.value = 'minecraft:speed'; control.el.querySelector('.k-sbtn').click();
  assert.equal(searched, 'minecraft:speed');
}
console.log('PASS window opening modes: defaults, migration, native preference channel, reopen, geometry retained; compact searchable hints and stable row hover.');
for (const [width, height] of [[320, 180], [4096, 2160]]) {
  const h = create({ width, height }), c = h.c;
  c.Prefs.init({ hostPrefs: true, prefs: {} });
  const hero = h.doc.createElement('div'); hero.id = 'hero'; h.root.appendChild(hero);
  // Exercise the actual drag handlers; close may happen as soon as mouseup returns.
  c.dragTrack = (event, move, end) => { move({ clientX: 4000, clientY: 4000 }); end(); };
  c.startResize({ clientX: 0, clientY: 0, button: 0 });
  c.startSplit({ clientX: 0, button: 0 });
  for (const [key, min, max] of [['winW', 320, 1600], ['winH', 200, 1000], ['heroWidth', 100, 320]]) {
    const saved = h.sent.filter(x => x[0] === 'prefs' && x[1].key === key);
    assert.equal(saved.length, 1, 'mouseup immediately submits geometry without a disposable page timer');
    assert(saved[0][1].value >= min && saved[0][1].value <= max, 'page geometry obeys host persistence limits');
  }
}
console.log('PASS geometry persistence: immediate mouseup channel, tiny and large viewport values inside host limits.');
