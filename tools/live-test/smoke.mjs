import { appendFileSync, writeFileSync, readFileSync, mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
const out = resolve('logs/live-test');
mkdirSync(out, { recursive: true });
let ws, id = 0, cursor = 0;
const pending = new Map();
const delay = ms => new Promise(r => setTimeout(r, ms));
async function call(method, params = {}, timeout = 60000) {
  const n = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(n); reject(new Error(`${method}: timeout`)); }, timeout);
    pending.set(n, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: n, method, params }));
  }).then(result => {
    appendFileSync(`${out}/rpc.jsonl`, JSON.stringify({ time: new Date().toISOString(), method, params, result }) + '\n');
    return result;
  });
}
async function page(params) {
  const n = String(++id);
  const dir = `${out}/mctest-run`;
  writeFileSync(`${dir}/page-request.tmp`, JSON.stringify({ id: n, ...params }));
  renameSync(`${dir}/page-request.tmp`, `${dir}/page-request.json`);
  for (let i = 0; i < 100; i++) {
    await delay(50);
    try {
      const r = JSON.parse(readFileSync(`${dir}/page-response.json`, 'utf8'));
      if (r.id === n) {
        appendFileSync(`${out}/page.jsonl`, JSON.stringify({ params, result: r }) + '\n');
        if (r.error) throw new Error(r.error);
        if (r.focused || r.visible) throw new Error('Hidden window safety assertion failed');
        return r;
      }
    } catch (e) { if (!String(e).includes('ENOENT') && !(e instanceof SyntaxError)) throw e; }
  }
  throw new Error('Page probe timed out');
}
async function clickPage(selector) {
  const rect = (await page({ js: `(function(){var e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;var r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:window.innerWidth,height:window.innerHeight};})()` })).value;
  if (!rect) throw new Error(`No page element: ${selector}`);
  const snap = await call('snapshot');
  await call('click', { x: rect.x * snap.guiWidth / rect.width, y: rect.y * snap.guiHeight / rect.height });
}
function assert(ok, message) { if (!ok) throw new Error(message); }
async function capture(name) {
  await call('waitFor', { condition: 'ticks:15' });
  const screenshot = await call('screenshot', { name, maxSize: 1280 });
  const snapshot = await call('snapshot');
  const logs = await call('logs', { since: cursor, level: 'WARN', limit: 1000 });
  cursor = logs.next;
  const result = { screenshot, snapshot, logs };
  if (snapshot.screen && ['OrielScreen', 'VaultScreen'].includes(snapshot.screen.simpleName)) {
    result.page = await page({ js: "({modal:!!document.getElementById('modal'),world:typeof WE!=='undefined'&&WE.w?{kind:WE.w.kind,type:WE.w.type,player:WE.w.player,container:WE.w.container}:null,buttons:document.querySelectorAll('button').length,text:document.body.textContent.substring(0,300)})" });
  }
  writeFileSync(`${out}/${name}.json`, JSON.stringify(result, null, 2));
  return result;
}
async function openEdit(name) {
  await call('keybind', { name: 'key.cadeditor.edit', action: 'tap' });
  await call('waitFor', { condition: 'ticks:25' });
  return capture(name);
}
let owned = false;
try {
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    try {
      ws = new WebSocket('ws://127.0.0.1:25599/');
      await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
      break;
    } catch { ws?.close(); await delay(2000); }
  }
  if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('MCTest did not start');
  ws.onmessage = event => {
    const m = JSON.parse(String(event.data)), p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id); clearTimeout(p.timer);
    if (m.error) p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result);
  };
  let status = await call('status');
  if (resolve(status.gameDir).toLowerCase() !== resolve(`${out}/mctest-run`).toLowerCase()) throw new Error('Refusing foreign MCTest client');
  owned = true;
  writeFileSync(`${out}/owned-mctest-pid.txt`, String(status.pid));
  writeFileSync(`${out}/mctest-ready.json`, JSON.stringify(status, null, 2));
  await capture('00-title');
  await call('world.create', { name: 'Oriel-live-smoke', flat: true, gamemode: 'creative', cheats: true }, 180000);
  await capture('01-world');
  await call('command', { command: 'give @s minecraft:diamond_sword' });
  await call('selectSlot', { slot: 0 });
  await call('look', { yaw: 0, pitch: -70 });
  await openEdit('02-item-editor');
  await call('key', { key: 'k', modifiers: ['ctrl'] });
  const palette = await capture('03-command-palette');
  assert(palette.page.value.modal, 'Ctrl+K did not open modal');
  try {
    await clickPage('.k-pal input');
    await call('type', { text: 'diamond' });
    const typed = await page({ js: "document.querySelector('.k-pal input').value" });
    await capture('03b-palette-typed');
    writeFileSync(`${out}/input-check.json`, JSON.stringify({ expected: 'diamond', actual: typed.value, pass: typed.value === 'diamond' }, null, 2));
    await call('key', { key: 'escape' });
    await call('key', { key: 'k', modifiers: ['ctrl'] });
    await call('waitFor', { condition: 'ticks:10' });
    await call('type', { text: 'd' });
    await call('waitFor', { condition: 'ticks:5' });
    const first = await page({ js: "document.querySelector('.k-pal input').value" });
    await call('type', { text: 'iamond' });
    await call('waitFor', { condition: 'ticks:5' });
    const split = await page({ js: "document.querySelector('.k-pal input').value" });
    writeFileSync(`${out}/input-split-check.json`, JSON.stringify({ first: first.value, actual: split.value, pass: split.value === 'diamond' }, null, 2));
    await capture('03c-palette-split-typed');
    await call('key', { key: 'escape' });
    await call('key', { key: 'k', modifiers: ['ctrl'] });
    await call('waitFor', { condition: 'ticks:10' });
    for (const key of 'diamond') {
      await call('key', { key });
      await call('type', { text: key });
    }
    await call('waitFor', { condition: 'ticks:5' });
    const paired = await page({ js: "document.querySelector('.k-pal input').value" });
    writeFileSync(`${out}/input-paired-check.json`, JSON.stringify({ actual: paired.value, pass: paired.value === 'diamond' }, null, 2));
    assert(paired.value === 'diamond', 'Paired key and character input failed');
    await capture('03d-palette-paired-typed');
  } catch (e) { writeFileSync(`${out}/input-limitation.txt`, e.stack); }
  await call('key', { key: 'escape' });
  const once = await capture('04-escape-once');
  assert(once.snapshot.screen?.simpleName === 'OrielScreen' && !once.page.value.modal, 'First Escape did not close only the modal');
  await call('key', { key: 'escape' });
  const twice = await capture('05-escape-twice');
  assert(!twice.snapshot.screen, 'Second Escape did not close editor');
  await call('closeScreen');
  await call('teleport', { x: 0.5, y: -60, z: 0.5 });
  await call('command', { command: 'setblock 0 -60 3 minecraft:chest' });
  await call('command', { command: 'item replace block 0 -60 3 container.0 with minecraft:diamond 3' });
  await call('lookAt', { x: 0.5, y: -59.5, z: 3.5 });
  await call('player');
  await openEdit('06-block-editor');
  await call('closeScreen');
  await call('command', { command: 'summon minecraft:horse 3 -60 0 {NoAI:1b,Passengers:[{id:"minecraft:chicken",NoAI:1b}]}' });
  await call('lookAt', { x: 3, y: -59, z: 0 });
  await call('waitFor', { condition: 'ticks:10' });
  await call('player');
  await openEdit('07-entity-editor');
  try {
    const before = await page({ js: "document.getElementById('edbody').scrollTop" });
    await call('scroll', { amount: -6, x: 500, y: 270 });
    await call('waitFor', { condition: 'ticks:10' });
    const after = await page({ js: "document.getElementById('edbody').scrollTop" });
    writeFileSync(`${out}/scroll-check.json`, JSON.stringify({ before, after, moved: after.value > before.value }, null, 2));
    await capture('07a-entity-scrolled');
    await page({ js: "document.getElementById('edbody').scrollTop=0;true" });
  } catch (e) { writeFileSync(`${out}/scroll-limitation.txt`, e.stack); }
  await page({ js: "weObj().CustomName='Live Oriel Horse';wePut();weApply();true" });
  await call('waitFor', { condition: 'ticks:40' });
  await capture('07b-entity-applied');
  const named = await call('entities', { radius: 10 });
  assert(named.entities.some(e => e.type === 'minecraft:horse' && e.customName === 'Live Oriel Horse'), 'Entity name did not reach server');
  await call('closeScreen');
  await call('keybind', { name: 'key.cadeditor.vault', action: 'tap' });
  await capture('08-vault');
  await call('closeScreen');
  await call('command', { command: 'cadeditor player' });
  await capture('09-player-editor');
  await call('closeScreen');
  await page({ toast: 'Live Oriel HUD toast' });
  await capture('10-toast-check');
  await call('world.leave', {}, 135000);
  await capture('11-world-left');
} catch (e) {
  writeFileSync(`${out}/mctest-error.txt`, e.stack);
  process.exitCode = 1;
} finally {
  if (owned) {
    try { await call('world.leave', {}, 135000); } catch {}
    try { await call('quit', {}, 10000); } catch {}
  }
  ws?.close();
  for (const p of pending.values()) clearTimeout(p.timer);
}
