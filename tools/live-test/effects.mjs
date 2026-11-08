import { readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCTest, PageProbe, clickPage, fillPage, delay } from './lib.mjs';
import { cases, controls, referencedControls } from './effects.cases.mjs';
import { parseSnbt, assertSubset } from './effects.nbt.mjs';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ui = join(root, 'fabric/src/main/resources/assets/cadeditor/ui');
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]); }
export function plan(tier = 'quick', only) {
  const schema = JSON.parse(readFileSync(join(root, 'docs/component-schema-26.1.2.json')));
  if (schema.mc_version !== '26.1.2') throw new Error('Unexpected component schema version');
  const ids = new Set(schema.components.map(c => c.id.replace('minecraft:', '')));
  for (const c of cases) for (const id of c.components) if (!ids.has(id)) throw new Error(`Unknown 26.1.2 component: ${id}`);
  const all = [...cases];
  if (tier === 'full') {
    const covered = new Set(cases.flatMap(c => c.components));
    for (const id of ids) if (!covered.has(id)) all.push({ name: `pending-${id.replaceAll('/', '-')}`, tier: 'full', page: 'item', components: [id], skip: '待补真实控件路径与独立游戏断言；不计为已覆盖，不代替 tools/accept 数据三轮验收' });
  }
  const selected = only ? all.filter(c => c.name === only) : all;
  if (!selected.length) throw new Error(`Unknown case: ${only}`);
  return selected;
}
export function validateControls(selected) {
  const sources = files(ui).filter(p => /\.(js|html|css)$/.test(p)).map(p => readFileSync(p, 'utf8')).join('\n');
  const used = new Set(selected.flatMap(referencedControls));
  // Food preparation uses the very same player form, never a packet or /data on the player.
  if (selected.some(c => c.effect?.kind === 'eat')) ['state', 'current', 'food', 'saturation', 'apply'].forEach(k => used.add(k));
  if (selected.some(c => c.edit?.kind === 'world-data')) used.add('fullData');
  for (const key of used) {
    const loc = controls[key]; if (!loc) throw new Error(`Undefined control: ${key}`);
    const classes = [...loc.selector.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
    const attrs = [...loc.selector.matchAll(/\[(\w+)="([^"]+)"\]/g)];
    for (const token of [...classes, ...attrs.map(m => m[2]), loc.text, loc.contains, loc.label].filter(Boolean)) {
      if (!sources.includes(token)) throw new Error(`Missing UI source token for ${key}: ${token}`);
    }
    if (!classes.length && !attrs.length) throw new Error(`Unverifiable selector: ${loc.selector}`);
  }
  return [...used];
}
function expect(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}
function includes(actual, expected, label) {
  if (!JSON.stringify(actual).includes(expected)) throw new Error(`${label}: expected contains=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}
export function patchWorld(text, edit) {
  let out = text;
  if (edit.insert) {
    if (/CustomName\s*:/.test(text)) throw new Error('Fixture unexpectedly already has CustomName');
    out = text.replace(/}\s*$/, ',' + edit.insert + '}');
  } else {
    const re = new RegExp(edit.replace.pattern);
    if (!re.test(text)) throw new Error(`World field not found: ${edit.replace.pattern}; actual=${text}`);
    out = text.replace(re, edit.replace.value);
  }
  if (out === text) throw new Error('World edit made no change');
  // Remove formatting whitespace only outside quoted strings, preserving escapes and NBT types.
  let quote = '', escaped = false, compact = '';
  for (const c of out) {
    if (quote) { compact += c; if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; }
    else if (c === '"' || c === "'") { quote = c; compact += c; }
    else if (!/\s/.test(c)) compact += c;
  }
  return compact;
}
export class Runner {
  constructor(mc, probe, out) { this.mc = mc; this.probe = probe; this.out = out; this.steps = []; }
  async step(name, fn) {
    const s = { name, started: new Date().toISOString() }, start = Date.now(); this.steps.push(s);
    try { s.result = await fn(); return s.result; } catch (e) { s.error = e.message; throw e; } finally { s.ms = Date.now() - start; }
  }
  call(m, p = {}, t) { return this.mc.call(m, p, t); }
  command(command) { return this.call('command', { command, ticks: 1 }); }
  wait(ticks = 4) { return this.call('waitFor', { condition: `ticks:${ticks}` }); }
  async close() {
    for (let i = 0; i < 5; i++) {
      if (!(await this.call('snapshot')).screen) return;
      await this.call('key', { key: 'escape' }); await this.wait(2);
    }
    throw new Error('Escape did not return to world');
  }
  async open() { await this.call('key', { key: 'i' }); await this.call('waitFor', { condition: 'screen:OrielScreen', timeoutTicks: 80 }); }
  async control(key, value, expand = false) {
    return this.step(`${value !== undefined ? 'fill' : expand ? 'expand' : 'click'} ${key}`, async () => {
      const l = controls[key];
      if (expand && !(await this.probe.inspect(l)).collapsed) return;
      if (value !== undefined) await fillPage(this.mc, this.probe, l, value);
      else await clickPage(this.mc, this.probe, l);
      await this.wait(2);
    });
  }
  async fields(fields) { for (const f of fields) await this.step(`control ${f.control}`, () => this.control(f.control, f.value, f.expand)); }
  async apply(item = false) {
    await this.step('click 应用修改', () => this.control('apply'));
    if (item) await this.step('click 应用到游戏', () => this.control('confirm'));
    await this.wait(6); await this.close();
  }
  async prepare(c) {
    await this.close();
    for (const cmd of ['gamemode creative', 'effect clear @s', 'clear @s', 'kill @e[tag=effects]', 'kill @e[type=item,distance=..16]', 'fill -1 -60 2 1 -58 4 air', 'tp @s 0.5 -60 0.5 0 -80']) await this.command(cmd);
    await this.call('key', { key: '1' });
    if (c.effect.kind === 'eat') {
      await this.open();
      await this.fields([{ control: 'state' }, { control: 'current', expand: true }, { control: 'saturation', value: '0' }, { control: 'food', value: String(c.effect.initialFood) }]);
      await this.apply(); expect((await this.call('player')).food, c.effect.initialFood, 'food fixture');
    }
    if (c.base) await this.command(`item replace entity @s hotbar.0 with minecraft:${c.setupItem || c.base}`);
    for (const cmd of c.setup || []) await this.command(cmd);
    if (c.page === 'block') await this.command('tp @s 0.5 -60 0.5 0 20.5');
    if (c.page === 'entity') await this.command('tp @s 0.5 -60 0.5 0 25');
    await this.open();
  }
  async edit(c) {
    const e = c.edit;
    if (e.kind === 'stack') {
      await this.control('advanced'); await this.control('itemData'); await this.control('snbt', e.stack);
      await this.control('stage'); await this.call('key', { key: 'escape' }); await this.wait(2); await this.apply(true);
    } else if (e.kind === 'world-data') {
      await this.control('data'); await this.control('fullData', undefined, true);
      const text = (await this.probe.inspect(controls.snbt)).value;
      await this.control('snbt', patchWorld(text, e)); await this.apply();
    } else if (e.kind === 'fields') { await this.fields(e.fields); await this.apply(); }
    else if (e.kind === 'vault') {
      await this.control('vault'); await this.control('saveItem'); await this.control('save');
      await this.wait(6); await this.control('give'); await this.wait(6); await this.close();
    } else throw new Error(`Unknown edit: ${e.kind}`);
  }
  async held() { return (await this.call('player')).inventory.find(i => i.slot === 0); }
  async effect(c) {
    const e = c.effect;
    if (e.kind === 'tooltip') includes(await this.call('tooltip', { slot: 0, advanced: true }), e.contains, 'tooltip');
    else if (e.kind === 'component' || e.kind === 'rarity') {
      // Copy the edited stack without changing any components, then read authoritative block NBT.
      await this.command('setblock 2 -60 0 chest');
      await this.command('item replace block 2 -60 0 container.0 from entity @s weapon.mainhand');
      const b = await this.call('block', { x: 2, y: -60, z: 0, source: 'server' });
      const nbt = parseSnbt(b.blockEntity?.nbt || '{}'), split = e.predicate.indexOf('=');
      const key = e.predicate.slice(0, split), value = parseSnbt(e.predicate.slice(split + 1));
      assertSubset(nbt.Items?.find(i => i.Slot === 0)?.components?.[key], value, key);
      if (e.kind === 'rarity') includes(await this.call('tooltip', { slot: 0 }), e.contains, 'tooltip name line');
    } else if (e.kind === 'attack') {
      await this.command('summon minecraft:pig 0.5 -60 3 {NoAI:1b,Tags:["effects"]}');
      await this.command('tp @s 0.5 -60 0.5 0 25'); await this.command('gamemode survival'); await this.wait(22);
      const before = (await this.call('entities', { type: 'minecraft:pig', radius: 6 })).entities;
      expect(before.length, 1, 'attack target count');
      await this.call('keybind', { name: 'attack', action: 'tap' }); await this.wait(4);
      const after = (await this.call('entities', { type: 'minecraft:pig', radius: 6 })).entities.find(x => x.id === before[0].id);
      if (!after) throw new Error('Attack target disappeared; cannot assert exact damage');
      expect(before[0].health - after.health, e.damage, 'attack health delta');
      if (e.wear !== undefined) expect((await this.held()).damage, e.wear, 'attack durability');
    } else if (e.kind === 'mine') {
      await this.command('setblock 0 -60 3 stone'); await this.command('tp @s 0.5 -60 0.5 0 20.5'); await this.command('gamemode survival');
      await this.call('keybind', { name: 'attack', action: 'press' });
      try { await this.call('waitFor', { condition: 'block:0,-60,3=minecraft:air', timeoutTicks: 80 }); }
      finally { await this.call('keybind', { name: 'attack', action: 'release' }); }
      expect((await this.call('block', { x: 0, y: -60, z: 3 })).id, 'minecraft:air', 'mined block');
      const held = await this.held(); expect(held?.damage, e.damage, 'mining durability');
      if (e.maxDamage) expect(held?.maxDamage, e.maxDamage, 'maximum durability');
    } else if (e.kind === 'eat' || e.kind === 'drink') {
      await this.command('gamemode survival'); await this.call('keybind', { name: 'use', action: 'hold', ticks: e.ticks || 36 }); await this.wait(3);
      const p = await this.call('player');
      if (e.kind === 'eat') { expect(p.food, e.food, 'food after consuming'); if (e.remainder) expect(p.inventory.find(i => i.slot === 0)?.item, e.remainder, 'use remainder'); }
      else { const effect = p.effects.find(x => x.id === e.effect); if (!effect) throw new Error(`Expected effect ${e.effect}; actual=${JSON.stringify(p.effects)}`); if (e.minDuration && !(effect.duration >= e.minDuration)) throw new Error(`Expected duration >=${e.minDuration}; actual=${JSON.stringify(effect)}`); }
    } else if (e.kind === 'equip') {
      await this.call('keybind', { name: 'use', action: 'tap' }); await this.wait(4);
      expect((await this.call('player')).inventory.find(i => i.slot === e.slot)?.item, e.item, 'equipped item');
    } else if (e.kind === 'pickup') {
      await this.command('item replace entity @s hotbar.1 from entity @s hotbar.0');
      await this.command('tp @s 0.5 -60 0.5 0 45');
      await this.call('key', { key: '2' }); await this.wait(2);
      await this.call('key', { key: 'q', modifiers: ['ctrl'] }); await this.call('key', { key: '1' });
      await this.command('tp @s 0.5 -60 0.5 0 0');
      await this.call('keybind', { name: 'forward', action: 'hold', ticks: 4 }); await this.wait(45);
      const p = await this.call('player'), stacks = p.inventory.filter(i => i.item === 'minecraft:ender_pearl');
      expect(stacks.length, 1, 'merged stack count'); expect(stacks[0]?.count, e.count, 'picked-up stack size');
    } else if (e.kind === 'place-container') {
      await this.command('setblock 0 -60 3 stone'); await this.command('tp @s 0.5 -60 0.5 0 20.5');
      await this.call('keybind', { name: 'use', action: 'tap' }); await this.wait(5);
      const b = await this.call('block', { x: 0, y: -60, z: 2, source: 'server' });
      const stack = parseSnbt(b.blockEntity?.nbt || '{}').Items?.find(i => i.Slot === 0);
      assertSubset(stack, { id: e.contains, count: e.count }, 'placed chest slot 0');
    } else if (e.kind === 'block') includes(await this.call('block', { x: 0, y: -60, z: 3 }), e.contains, 'block entity NBT');
    else if (e.kind === 'entity') { const a = (await this.call('entities', { type: 'minecraft:pig', radius: 6 })).entities; expect(a.length, 1, 'entity count'); expect(a[0][e.field], e.expected, e.field); }
    else if (e.kind === 'player') expect((await this.call('player'))[e.field], e.expected, e.field);
    else if (e.kind === 'inventory-count') expect((await this.call('player')).inventory.filter(i => i.item === e.item).reduce((n, i) => n + i.count, 0), e.expected, 'vault inventory count');
    else throw new Error(`No independent assertion for ${e.kind}`);
  }
}
function report(out, rows, meta) {
  writeFileSync(join(out, 'report.json'), JSON.stringify({ ...meta, cases: rows }, null, 2));
  const lines = ['# 功能生效测试', '', `模式：${meta.mode}；${meta.tier}；时间：${meta.started}`, '', 'PASS 只表示该断言通过；SKIP 不计入覆盖。静态计划不是实机验收。', ''];
  if (meta.error) lines.push(`运行错误：${meta.error}`, '');
  for (const r of rows) {
    lines.push(`## ${r.name} — ${r.status}`, '', `页面：${r.page}；组件：${r.components.join(', ') || '—'}；耗时：${r.ms || 0}ms`, '', `断言：\`${JSON.stringify(r.effect || r.skip)}\``, '');
    if (r.error) lines.push('```text', r.error, '```', '');
    if (r.screenshot) lines.push(`截图：[${r.name}.png](${r.name}.png)；[回执](${r.name}.screenshot.json)`, '');
    lines.push('| 步骤 | 耗时 ms | 结果 |', '|---|---:|---|');
    for (const s of r.steps || []) lines.push(`| ${s.name.replaceAll('|', '\\|')} | ${s.ms} | ${s.error ? 'FAIL: ' + s.error.replaceAll('|', '\\|').replaceAll('\n', ' ') : 'PASS'} |`);
    lines.push('');
  }
  writeFileSync(join(out, 'report.md'), lines.join('\n'));
}
export async function main(args = process.argv.slice(2)) {
  const option = k => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
  if (args.includes('--quit-only')) {
    const out = option('--out'), run = option('--run');
    if (!out || !run) throw new Error('Shutdown requires owned run and evidence directories');
    writeFileSync(join(out, 'quit-attempted.json'), JSON.stringify({ time: new Date().toISOString(), source: 'launcher cleanup' }));
    const client = new MCTest();
    try {
      await client.connect(2000);
      const status = await client.call('status', {}, 2000);
      expect(resolve(status.gameDir).toLowerCase(), resolve(run).toLowerCase(), 'shutdown ownership');
      await client.call('quit', {}, 10000);
    } finally { client.close(); }
    return;
  }
  const tier = option('--tier') || 'quick'; if (!['quick', 'full'].includes(tier)) throw new Error('Tier must be quick or full');
  const selected = plan(tier, option('--only')), used = validateControls(selected);
  const out = resolve(option('--out') || join(root, 'logs/live-test/effects', new Date().toISOString().replaceAll(/[:.]/g, '-')));
  mkdirSync(out, { recursive: true });
  const meta = { started: new Date().toISOString(), tier, mode: args.includes('--dry-run') ? 'DRY RUN — 未连接游戏' : 'LIVE', controls: used };
  const rows = [];
  if (args.includes('--dry-run')) {
    for (const c of selected) { console.log(`${c.skip ? 'SKIP' : 'PLAN'} ${c.name}: ${c.components.join(',') || c.page} -> ${JSON.stringify(c.effect || c.skip)}`); rows.push({ ...c, status: 'SKIP', error: c.skip || 'DryRun：源码引用检查通过，未执行游戏动作' }); }
    report(out, rows, meta); console.log(`Validated ${used.length} control references; ${out}/report.md`); return;
  }
  const run = option('--run'); if (!run) throw new Error('Live run requires --run from effects.ps1');
  let mc, owned = false;
  try {
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      mc = new MCTest('ws://127.0.0.1:25599/', row => appendFileSync(join(out, 'rpc.jsonl'), JSON.stringify(row) + '\n'));
      try { await mc.connect(2000); break; } catch { mc.close(); await delay(1000); }
    }
    const status = await mc.call('status');
    expect(resolve(status.gameDir).toLowerCase(), resolve(run).toLowerCase(), 'owned game directory'); owned = true;
    writeFileSync(join(out, 'mctest-ready.json'), JSON.stringify(status));
    await mc.call('world.create', { name: 'Effects', flat: true, gamemode: 'creative', cheats: true }, 180000);
    const runner = new Runner(mc, new PageProbe(run, out), out);
    await runner.command('gamerule natural_health_regeneration false');
    for (const c of selected) {
      const start = Date.now(), r = { ...c, status: c.skip ? 'SKIP' : 'PASS', steps: [] }; rows.push(r); runner.steps = r.steps;
      if (!c.skip) {
        try { await runner.step('scene setup + I', () => runner.prepare(c)); await runner.step('visible UI edit', () => runner.edit(c)); await runner.step('game effect assertion', () => runner.effect(c)); }
        catch (e) { r.status = 'FAIL'; r.error = e.stack; }
        try { r.screenshot = await mc.call('screenshot', { name: c.name, maxSize: 1280 }); copyFileSync(r.screenshot.path, join(out, `${c.name}.png`)); writeFileSync(join(out, `${c.name}.screenshot.json`), JSON.stringify(r.screenshot, null, 2)); }
        catch (e) { r.status = 'FAIL'; r.error = (r.error || '') + '\nScreenshot: ' + e.message; }
      }
      r.ms = Date.now() - start; report(out, rows, meta);
    }
    if (rows.some(r => r.status === 'FAIL')) process.exitCode = 1;
    else if (rows.some(r => r.status === 'SKIP')) process.exitCode = 2;
  } catch (e) { meta.error = e.stack; process.exitCode = 1; }
  finally {
    if (owned) {
      // quit is the wire method behind mc_quit; always attempt it before launcher cleanup.
      writeFileSync(join(out, 'quit-attempted.json'), JSON.stringify({ time: new Date().toISOString() }));
      try { await mc.call('quit', {}, 10000); } catch (e) { meta.quitError = e.message; }
    }
    mc?.close();
    for (const c of selected) if (!rows.some(r => r.name === c.name)) rows.push({ ...c, status: 'SKIP', error: 'Run aborted before case: ' + (meta.error || 'unknown error'), steps: [] });
    report(out, rows, meta);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.stack); process.exitCode = 1; });
