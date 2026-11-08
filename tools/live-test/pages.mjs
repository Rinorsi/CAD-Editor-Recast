import { appendFileSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { MCTest, PageProbe, clickPage, delay, publishProbe } from './lib.mjs';
import { parseSnbt } from './effects.nbt.mjs';
const out = resolve(process.env.EDITOR_LIVE_TEST_EVIDENCE || 'logs/live-test/pages');
const run = join(out, 'mctest-run');
mkdirSync(out, { recursive: true });
const entity = (name, tab, nbt = '', extra = {}) => ({ name, kind: 'entity', type: name, tabs: [tab, '属性'], nbt, ...extra });
const block = (name, tab, extra = {}) => ({ name, kind: 'block', type: name, tabs: [tab], ...extra });
const cases = [
  entity('wolf', '关系', 'Owner:[I;1,2,3,4],Sitting:1b'),
  entity('wolf-untamed', '关系', '', { type: 'wolf' }),
  entity('donkey', '实体设置', 'Tame:1b,ChestedHorse:1b,equipment:{saddle:{id:"minecraft:saddle",count:1}}', { text: ['驯服与骑乘', '驮兽箱子'] }),
  entity('horse', '驯服与骑乘', 'Tame:1b,equipment:{saddle:{id:"minecraft:saddle",count:1}}'),
  entity('llama', '实体设置', 'Tame:1b,ChestedHorse:1b,Strength:3', { text: ['驯服与骑乘', '驮兽箱子'] }),
  entity('item', '掉落物', 'Item:{id:"minecraft:diamond",count:1},PickupDelay:32767s,Age:-32768s,Motion:[0d,0d,0d]', { aimY: -59.875 }),
  entity('item-behind-chest', '名称', 'Item:{id:"minecraft:diamond",count:1},PickupDelay:32767s', { type: 'item', tabs: ['名称', '容器'], aimY: -59.8, commands: ['setblock 0 -60 2 chest'] }),
  entity('item-out-of-reach', '背包', 'Item:{id:"minecraft:diamond",count:1},PickupDelay:32767s', { type: 'item', tabs: ['背包', '状态'], z: 8, aimY: -59.8 }),
  entity('falling_block', '下落方块', 'BlockState:{Name:"minecraft:sand"},Time:-100000,NoGravity:1b', { y: -59, aimY: -58.5 }),
  entity('tnt', 'TNT', 'fuse:30000,NoGravity:1b'),
  entity('creeper', '苦力怕'), entity('enderman', '末影人', 'carriedBlockState:{Name:"minecraft:stone"}'),
  entity('area_effect_cloud', '药水云', 'Duration:100000,Radius:1f,WaitTime:100000', { aimY: -59.9 }),
  entity('experience_orb', '经验球', 'Value:5s,Age:-30000s', { aimY: -59.8 }),
  entity('arrow', '箭', 'NoGravity:1b,pickup:0b', { y: -59, aimY: -58.9 }),
  entity('interaction', '交互实体', 'width:1f,height:2f'),
  entity('chest_minecart', '实体设置'), entity('command_block_minecart', '实体设置'), entity('furnace_minecart', '矿车显示的方块'),
  entity('oak_boat', '船', '', { aimY: -59.8 }), entity('oak_chest_boat', '实体设置', '', { aimY: -59.8 }),
  entity('zombie_villager', '僵尸村民转化'), entity('villager', '交易'), entity('armor_stand', '姿势'),
  entity('team-leash', '关系', 'leash:[I;2,-60,3]', { type: 'cow', before: ['setblock 2 -60 3 oak_fence'], commands: ['team add pages', 'team join pages @e[tag=pages]'], text: ['队伍', '拴绳', '被拴着'] }),
  block('beacon', '方块设置'), block('hopper', '方块设置'), block('crafter', '方块设置'), block('chest', '容器'),
  block('chest-double', '容器', { type: 'chest', double: true }), block('trapped_chest-double', '容器', { type: 'trapped_chest', double: true }),
  block('end_gateway', '折跃门'), block('structure_block', '结构方块'), block('jigsaw', '拼图方块'),
  block('vault', '宝库'), block('vault-ominous', '宝库', { type: 'vault', state: '[ominous=true]' }),
  block('sculk_sensor', '幽匿感测体'), block('calibrated_sculk_sensor', '幽匿感测体'), block('sculk_shrieker', '幽匿尖啸体'),
  block('sculk_catalyst', '幽匿催生体'), block('bell', '钟'), block('conduit', '潮涌核心'), block('decorated_pot', '纹饰陶罐'),
  block('enchanting_table', '名称', { nbt: '{CustomName:"PagesTable"}' }),
  block('spawner', '刷怪设置', { nbt: '{Delay:30000s,SpawnData:{entity:{id:"minecraft:pig"}},SpawnPotentials:[{weight:1,data:{entity:{id:"minecraft:pig"}}}]}' }),
  block('trial_spawner', '刷怪设置', { nbt: '{normal_config:{spawn_potentials:[{weight:1,data:{entity:{id:"minecraft:pig"}}}]},ominous_config:{spawn_potentials:[{weight:1,data:{entity:{id:"minecraft:zombie"}}}]}}' }),
  { name: 'mob-spawner-item', kind: 'item', item: 'minecraft:spawner[minecraft:block_entity_data={id:"minecraft:mob_spawner",SpawnData:{entity:{id:"minecraft:pig"}},SpawnPotentials:[{weight:1,data:{entity:{id:"minecraft:pig"}}}]}]', tabs: ['刷怪设置'] },
  { name: 'variant-item', kind: 'item', item: 'minecraft:bucket[minecraft:cat/variant="minecraft:black"]', tabs: ['附加设置'], variant: true }
];
let mc, owned = false, seq = 0;
const rows = [], started = new Date().toISOString();
const assert = (ok, message) => { if (!ok) throw new Error(message); };
async function dom() {
  const id = `pages-${process.pid}-${++seq}`;
  const js = "({tabs:Array.prototype.map.call(document.querySelectorAll('#tabbar .ed-tab'),function(e){return e.querySelector('span').textContent.trim();}),text:document.body.textContent,slots:document.querySelectorAll('#edbody .k-cgrid .slot').length,slotTitles:Array.prototype.map.call(document.querySelectorAll('#edbody .k-cgrid .slot'),function(e){return e.getAttribute('title');}),variants:Array.prototype.map.call(document.querySelectorAll('.k-vent'),function(e){var r=e.getBoundingClientRect();return {type:e.getAttribute('type'),components:e.getAttribute('components'),x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:window.innerWidth,viewportHeight:window.innerHeight};})})";
  await publishProbe(run, { id, js });
  for (let i = 0; i < 100; i++) {
    await delay(50);
    let r;
    try { r = JSON.parse(readFileSync(join(run, 'page-response.json'), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) continue; throw e; }
    if (r.id !== id) continue;
    appendFileSync(join(out, 'page.jsonl'), JSON.stringify(r) + '\n');
    assert(!r.visible && !r.focused, 'Hidden window safety assertion failed');
    assert(!r.error, r.error); return r.value;
  }
  throw new Error('Read-only DOM probe timeout');
}
function previewPixels(path, box) {
  const png = readFileSync(path), chunks = []; let width, height, channels;
  for (let p = 8; p < png.length;) {
    const n = png.readUInt32BE(p), type = png.toString('ascii', p + 4, p + 8), data = png.subarray(p + 8, p + 8 + n); p += n + 12;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      assert(data[8] === 8 && channels && data[12] === 0, 'Unsupported screenshot PNG format');
    }
    if (type === 'IDAT') chunks.push(data);
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels, pixels = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]; assert(f <= 4, 'Invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0, b = y ? pixels[(y - 1) * stride + x] : 0, c = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][f]) & 255;
    }
  }
  const colors = new Set();
  const x0 = Math.max(0, Math.floor(box.x * width / box.viewportWidth)), x1 = Math.min(width, Math.ceil((box.x + box.width) * width / box.viewportWidth));
  const y0 = Math.max(0, Math.floor(box.y * height / box.viewportHeight)), y1 = Math.min(height, Math.ceil((box.y + box.height) * height / box.viewportHeight));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = y * stride + x * channels; colors.add(pixels.subarray(p, p + 3).toString('hex')); }
  return { crop: [x0, y0, x1, y1], colors: colors.size, nonUniform: colors.size > 1, note: 'Pixel variation only; does not establish appearance correctness' };
}
function report() {
  writeFileSync(join(out, 'report.json'), JSON.stringify({ started, cases: rows }, null, 2));
  writeFileSync(join(out, 'report.md'), ['# 新页面实机 smoke', '', '通过仅代表列出的 DOM/游戏数据断言。截图不代表人工视觉验收。', '', '| Target | Status | Seconds | Tabs | Evidence / error |', '|---|---|---:|---|---|', ...rows.map(r => `| ${r.name} | ${r.status} | ${((r.ms || 0) / 1000).toFixed(2)} | ${(r.dom?.tabs || []).join('、')} | [截图](${r.name}.png) ${(r.error || '').replaceAll(/[\r\n|]/g, ' ')} |`)].join('\n'));
}
const call = (m, p, t) => mc.call(m, p, t);
const command = command => call('command', { command, ticks: 1 });
const wait = (ticks = 5) => call('waitFor', { condition: `ticks:${ticks}` });
async function close() {
  for (let i = 0; i < 5; i++) { if (!(await call('snapshot')).screen) return; await call('key', { key: 'escape' }); await wait(2); }
  throw new Error('Escape did not close page');
}
try {
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    mc = new MCTest('ws://127.0.0.1:25599/', r => appendFileSync(join(out, 'rpc.jsonl'), JSON.stringify(r) + '\n'));
    try { await mc.connect(2000); break; } catch { mc.close(); await delay(1000); }
  }
  const status = await call('status');
  assert(resolve(status.gameDir).toLowerCase() === run.toLowerCase(), 'Refusing foreign Minecraft'); owned = true;
  writeFileSync(join(out, 'mctest-ready.json'), JSON.stringify(status));
  writeFileSync(join(out, 'owned-client-pid.txt'), String(status.pid));
  await call('world.create', { name: 'Pages', flat: true, gamemode: 'creative', cheats: true }, 180000);
  const probe = new PageProbe(run, out);
  for (const c of cases) {
    const begin = Date.now(), row = { name: c.name, expectedTabs: c.tabs, status: 'PASS' }; rows.push(row);
    let cursor;
    try {
      await close();
      for (const cmd of ['clear @s', 'tp @e[tag=pages] 100 -60 100', 'kill @e[tag=pages]', 'fill -1 -60 2 2 -58 4 air', 'tp @s 0.5 -60 0.5 0 -70']) await command(cmd);
      await call('selectSlot', { slot: 0 });
      if (c.kind === 'entity') {
        for (const cmd of c.before || []) await command(cmd);
        await command(`summon minecraft:${c.type} 0.5 ${c.y || -60} ${c.z || 3} {Tags:["pages"],NoAI:1b,Invulnerable:1b,PersistenceRequired:1b${c.nbt ? ',' + c.nbt : ''}}`);
        for (const cmd of c.commands || []) await command(cmd);
        await call('lookAt', { x: 0.5, y: c.aimY || -59.3, z: (c.z || 3) + 0.5 });
      } else if (c.kind === 'block') {
        if (c.double) {
          await command(`setblock 0 -60 3 minecraft:${c.type}[facing=north,type=left]`);
          await command(`setblock 1 -60 3 minecraft:${c.type}[facing=north,type=right]`);
          await command('item replace block 0 -60 3 container.0 with minecraft:diamond 3');
          await command('item replace block 1 -60 3 container.0 with minecraft:emerald 5');
        } else await command(`setblock 0 -60 3 minecraft:${c.type}${c.state || ''}${c.nbt || ''}`);
        await call('lookAt', { x: 0.5, y: -59.5, z: 3.5 });
      } else await command(`give @s ${c.item}`);
      await wait(5);
      row.player = await call('player');
      cursor = (await call('logs', { level: 'INFO', limit: 1 })).next;
      await call('keybind', { name: 'key.cadeditor.edit', action: 'tap' });
      await call('waitFor', { condition: 'screen:OrielScreen', timeoutTicks: 80 }); await wait(10);
      row.dom = await dom();
      for (const tab of c.tabs) assert(row.dom.tabs.includes(tab), `Missing tab ${tab}; actual=${JSON.stringify(row.dom.tabs)}`);
      await clickPage(mc, probe, { selector: '#tabbar .ed-tab', contains: c.tabs[0] }); await wait(5);
      row.dom = await dom();
      for (const text of c.text || []) assert(row.dom.text.includes(text), `Missing section ${text}`);
      if (c.variant) assert(row.dom.variants.some(v => v.width > 0 && v.height > 0), 'Missing nonempty .k-vent entity preview');
      if (c.double) {
        assert(row.dom.slots === 54, `Expected 54 slots, got ${row.dom.slots}`);
        // Clear a real slot in the opposite half through its popup, then read BOTH server blocks.
        row.before = await Promise.all([0, 1].map(x => call('block', { x, y: -60, z: 3, source: 'server' })));
        const opposite = row.dom.slotTitles.findIndex(t => t && t.startsWith('绿宝石'));
        assert(opposite >= 0, 'Opposite-half emerald slot missing from DOM');
        await clickPage(mc, probe, { selector: '#edbody .k-cgrid .slot', index: opposite }); await delay(350); await wait(3);
        await clickPage(mc, probe, { selector: '.k-pickbox .k-btn', text: '清空这一格' }); await wait(3);
        await clickPage(mc, probe, { selector: '.k-apply' }); await wait(10); await close();
        row.after = await Promise.all([0, 1].map(x => call('block', { x, y: -60, z: 3, source: 'server' })));
        const stacks = row.after.map(b => parseSnbt(b.blockEntity?.nbt || '{}').Items || []);
        assert(stacks[0].some(s => s.id === 'minecraft:diamond' && s.count === 3), 'First half changed unexpectedly');
        assert(stacks[1].length === 0, 'Opposite half was not cleared');
        await call('keybind', { name: 'key.cadeditor.edit', action: 'tap' }); await wait(10);
      }
    } catch (e) { row.status = 'FAIL'; row.error = e.stack; }
    try {
      row.screenshot = await call('screenshot', { name: c.name, maxSize: 1280 }); copyFileSync(row.screenshot.path, join(out, `${c.name}.png`));
      if (c.variant && row.dom?.variants.length) row.previewPixels = previewPixels(row.screenshot.path, row.dom.variants[0]);
      row.logs = await call('logs', { since: cursor, level: 'INFO', limit: 1000 });
      assert(Array.isArray(row.logs.lines), 'Unrecognized MCTest log response');
      const entries = row.logs.lines.filter(e => /WARN|ERROR/.test(e.level) || /Exception|(?:JavaScript|JS).*error/i.test(e.message + ' ' + (e.exception || '')));
      assert(entries.length === 0, `New WARN/ERROR logs: ${JSON.stringify(entries)}`);
    } catch (e) { row.status = 'FAIL'; row.error = (row.error || '') + '\n' + e.message; }
    row.ms = Date.now() - begin;
    writeFileSync(join(out, `${c.name}.json`), JSON.stringify(row, null, 2)); report();
    try { await close(); } catch {}
  }
} catch (e) { writeFileSync(join(out, 'mctest-error.txt'), e.stack); process.exitCode = 1; }
finally {
  for (const c of cases) if (!rows.some(r => r.name === c.name)) rows.push({ name: c.name, status: 'SKIP', error: 'Run aborted before this target' });
  report();
  if (rows.some(r => r.status !== 'PASS')) process.exitCode = 1;
  if (owned) { try { await call('quit', {}, 10000); } catch {} }
  mc?.close();
}
