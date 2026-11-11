const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');

for (const reduced of [false, true]) {
  const t = H.create(), c = t.c;
  const timers = new Map();
  let timerId = 0;
  c.setTimeout = (fn, ms) => { const id = ++timerId; timers.set(id, {fn, ms}); return id; };
  c.clearTimeout = id => timers.delete(id);
  function settle() {
    while (timers.size) {
      const next = [...timers.keys()][0], timer = timers.get(next);
      timers.delete(next); timer.fn();
    }
  }
  if (reduced) t.doc.documentElement.setAttribute('data-motion', 'reduced');
  c.Prefs.about = {version:'0.99.7', changelog:true};
  c.ReleaseNotes.index = ['0.99.7', '0.99.6'].map(version => ({version, date:'2026-11-10', count:1}));
  for (const {version} of c.ReleaseNotes.index) {
    c.ReleaseNotes.releases[version] = {version, sections:[{title:'改进与修复', items:['更新日志折叠']} ]};
  }
  const state = {open:{}, groups:{}};
  const host = c.h('div'); t.doc.body.appendChild(host);
  const view = c.changelogSection(host, state);
  function blocks() { return host.querySelectorAll('.release-version-block'); }
  function parts(block) { return {head:block.querySelector('.release-head'), body:block.querySelector('.release-content')}; }
  function expectFold(head, body, open) {
    assert.equal(head.getAttribute('aria-expanded'), String(open));
    assert.equal(body.style.display === 'none', !open, 'visibility must agree with the arrow after animation');
    assert.ok(!body.classList.contains('x-sliding'), 'animation must finish');
    assert.ok(!body.style.height && !body.style.opacity, 'temporary animation styles must be cleared');
  }
  let current = parts(blocks()[0]), previous = parts(blocks()[1]);
  expectFold(current.head, current.body, true);
  expectFold(previous.head, previous.body, false);

  // Current version collapses and stays hidden after the height animation ends.
  current.head.click(); settle(); expectFold(current.head, current.body, false);
  // A data notification must not re-open a user-collapsed version.
  c.ReleaseNotes.notify(); settle();
  current = parts(blocks()[0]); expectFold(current.head, current.body, false);
  current.head.fire('keydown', {key:'Enter'}); settle(); expectFold(current.head, current.body, true);

  // Historical versions start hidden and must become visible before measurement.
  previous = parts(blocks()[1]);
  previous.body.getBoundingClientRect = () => ({height:previous.body.style.display === 'none' ? 0 : 300});
  previous.head.click();
  assert.notEqual(previous.body.style.display, 'none');
  settle(); expectFold(previous.head, previous.body, true);

  const section = previous.body.querySelector('.release-section-head');
  const items = previous.body.querySelector('.release-items');
  section.click(); settle(); expectFold(section, items, false);
  section.fire('keydown', {key:' '}); settle(); expectFold(section, items, true);

  // Reversing direction during animation must honor the last click.
  section.click(); section.click(); settle(); expectFold(section, items, true);
  previous.head.click(); previous.head.click(); previous.head.click();
  settle(); expectFold(previous.head, previous.body, false);
  previous.head.click(); settle(); expectFold(previous.head, previous.body, true);

  // Independent category state also survives an asynchronous redraw.
  previous.body.querySelector('.release-section-head').click(); settle();
  c.ReleaseNotes.notify(); settle();
  previous = parts(blocks()[1]);
  expectFold(previous.body.querySelector('.release-section-head'), previous.body.querySelector('.release-items'), false);
  view.dispose();
  assert.equal(c.ReleaseNotes.listeners.length, 0);
  console.log('PASS | changelog version/category folding, keyboard, rapid clicks, redraw | motion=' + !reduced);
}
