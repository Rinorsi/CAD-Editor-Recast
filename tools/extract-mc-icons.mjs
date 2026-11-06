// 从本机 26.1.2 资源 jar 抽取"网页预览专用"图标，输出到 dev/browser/mc/（不进游戏，不进仓库）。
//   node tools/extract-mc-icons.mjs
// 产物：
//   dev/browser/mc/item/<id>.png        物品图（原版 item 贴图）或由方块贴图合成的等距方块图
//   dev/browser/mc/effect/<id>.png      状态效果图标
//   dev/browser/mc/sprite/...           少量界面精灵
//   dev/browser/mc/index.json           { items: {id: 相对路径}, effects: [...] }
// 说明：这些是 Mojang 的资源，只在本机预览用；游戏里直接用 minecraft: 引用，不复制。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jar = path.resolve(root, '../Oriel-UI/common/versions/26.1/build/moddev/artifacts/vanilla-26.1.2-1-merged.jar');
const out = path.join(root, 'dev/browser/mc');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-icons-'));
if (!fs.existsSync(jar)) { console.error('缺少资源 jar：' + jar); process.exit(1); }

// ---- 解出需要的目录 ----
execFileSync('unzip', ['-q', '-o', jar, 'assets/minecraft/textures/item/*', 'assets/minecraft/textures/block/*', 'assets/minecraft/textures/mob_effect/*', 'assets/minecraft/textures/gui/sprites/container/*', 'assets/minecraft/textures/gui/sprites/hud/*', 'assets/minecraft/textures/gui/sprites/widget/*', '-d', tmp], { stdio: 'inherit' });
const tex = p => path.join(tmp, 'assets/minecraft/textures', p);
const exists = p => fs.existsSync(tex(p));

// ---- 最小 PNG 编解码（8 位，灰度/RGB/调色板/RGBA） ----
function readPng(file) {
  const b = fs.readFileSync(file);
  let o = 8, w = 0, h = 0, depth = 8, ct = 6, idat = [], plte = null, trns = null;
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('latin1', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; }
    else if (type === 'PLTE') plte = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    o += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  if (!ch || ![1, 2, 4, 8].includes(depth)) return null;
  const bits = depth * ch, bpp = Math.max(1, bits >> 3), stride = Math.ceil((w * bits) / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? up : c); }
      px[y * stride + x] = v & 255;
    }
  }
  const sample = (y, x, k) => { // 取第 k 个通道的值（低位深时按位解包）
    if (depth === 8) return px[y * stride + x * ch + k];
    const bit = x * depth, byte = px[y * stride + (bit >> 3)], shift = 8 - depth - (bit & 7);
    return (byte >> shift) & ((1 << depth) - 1);
  };
  const rgba = Buffer.alloc(w * h * 4), scale = depth === 8 ? 1 : 255 / ((1 << depth) - 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let r, g, bl, al = 255;
    if (ct === 6) { r = sample(y, x, 0); g = sample(y, x, 1); bl = sample(y, x, 2); al = sample(y, x, 3); }
    else if (ct === 2) { r = sample(y, x, 0); g = sample(y, x, 1); bl = sample(y, x, 2); }
    else if (ct === 0) { r = g = bl = Math.round(sample(y, x, 0) * scale); }
    else if (ct === 4) { r = g = bl = sample(y, x, 0); al = sample(y, x, 1); }
    else { const k = sample(y, x, 0); r = plte[k * 3]; g = plte[k * 3 + 1]; bl = plte[k * 3 + 2]; al = trns && k < trns.length ? trns[k] : 255; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = bl; rgba[i * 4 + 3] = al;
  }
  // 动画贴图是竖向帧条：只取第一帧（正方形）
  const size = Math.min(w, h);
  if (h > w) return { w, h: w, d: rgba.subarray(0, w * w * 4) };
  return { w, h, d: rgba, size };
}
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc(buf) { let c = 0xFFFFFFFF; for (const x of buf) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); }
function writePng(file, w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

// ---- 等距方块：top / left / right 三个面 ----
function cube(top, left, right) {
  const S = 32, out = Buffer.alloc(S * S * 4);
  const sample = (img, u, v) => { const x = Math.min(img.w - 1, Math.max(0, Math.floor(u * img.w))), y = Math.min(img.h - 1, Math.max(0, Math.floor(v * img.h))); const i = (y * img.w + x) * 4; return [img.d[i], img.d[i + 1], img.d[i + 2], img.d[i + 3]]; };
  // 每个面：原点 O 与两个边向量 U、V（输出像素坐标）
  const faces = [
    { img: top, O: [16, 1], U: [14, 7.5], V: [-14, 7.5], shade: 1.0 },
    { img: left, O: [2, 8.5], U: [14, 7.5], V: [0, 15], shade: 0.62 },
    { img: right, O: [16, 16], U: [14, -7.5], V: [0, 15], shade: 0.82 },
  ];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = x + 0.5, py = y + 0.5;
    for (const f of faces) {
      const dx = px - f.O[0], dy = py - f.O[1], det = f.U[0] * f.V[1] - f.U[1] * f.V[0];
      const u = (dx * f.V[1] - dy * f.V[0]) / det, v = (f.U[0] * dy - f.U[1] * dx) / det;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      const c = sample(f.img, u, v);
      if (c[3] < 8) continue;
      const i = (y * S + x) * 4; out[i] = Math.round(c[0] * f.shade); out[i + 1] = Math.round(c[1] * f.shade); out[i + 2] = Math.round(c[2] * f.shade); out[i + 3] = 255;
      break;
    }
  }
  return out;
}

// ---- 处理物品 ----
const data = fs.readFileSync(path.join(root, 'fabric/src/main/resources/assets/cadeditor/ui/js/data.js'), 'utf8');
const items = JSON.parse(data.slice(data.indexOf('{'), data.lastIndexOf('}') + 1)).items;
fs.rmSync(out, { recursive: true, force: true });
const index = { items: {}, effects: {} };
let flat = 0, cubes = 0, missing = [];
const SUF = /_(stairs|slab|wall|fence_gate|fence|button|pressure_plate|carpet|banner|bed|wood|hyphae|hanging_sign|sign|door|trapdoor|boat|chest_boat|shelf|pane)$/;
const faceOf = (id, kind) => {
  const base = id.replace(SUF, "").replace(/^stripped_/, "stripped_");
  const names = [id, base, base + "_planks", base + "s", base + "_block", base + "_wool", base + "_log", base.replace(/_stained_glass$/, "") + "_stained_glass", id.replace(/_glass_pane$/, "_glass")];
  const out = [];
  for (const n of names) out.push(kind === "top" ? [n + "_top", n + "_end", n] : [n + "_side", n, n + "_front", n + "_top"]);
  for (const list of out) for (const n of list) if (exists("block/" + n + ".png")) return "block/" + n + ".png";
  return null;
};
const ALIAS = { crossbow: 'item/crossbow_standby', compass: 'item/compass_16', recovery_compass: 'item/recovery_compass_16', clock: 'item/clock_00', enchanted_golden_apple: 'item/golden_apple', magma_block: 'block/magma', snow_block: 'block/snow', dried_kelp_block: 'block/dried_kelp_side', smooth_sandstone: 'block/sandstone_top', smooth_red_sandstone: 'block/red_sandstone_top', smooth_quartz: 'block/quartz_block_bottom', grindstone: 'block/grindstone_side', dispenser: 'block/dispenser_front', dropper: 'block/dropper_front', command_block: 'block/command_block_front', chain_command_block: 'block/chain_command_block_front', repeating_command_block: 'block/repeating_command_block_front' };
/* ---- 精灵图集：物品 32px 一格、状态效果 18px 一格 ---- */
const cells = [], effCells = [];
function scaleTo(img, S) { const o = Buffer.alloc(S * S * 4); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const sx = Math.min(img.w - 1, Math.floor(x * img.w / S)), sy = Math.min(img.h - 1, Math.floor(y * img.h / S)); img.d.copy(o, (y * S + x) * 4, (sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4); } return o; }
const addItem = (id, img) => { index.items[id] = cells.length; cells.push(scaleTo(img, 32)); };
for (const id of items) {
  if (ALIAS[id] && exists(ALIAS[id] + '.png')) {
    const img = readPng(tex(ALIAS[id] + '.png'));
    if (img) { const isBlock = ALIAS[id].startsWith('block/'); addItem(id, isBlock ? { w: 32, h: 32, d: cube(img, img, img) } : img); flat++; continue; }
  }
  if (exists('item/' + id + '.png')) { const img = readPng(tex('item/' + id + '.png')); if (img) { addItem(id, img); flat++; continue; } }
  const t = faceOf(id, 'top'), s2 = faceOf(id, 'side');
  if (t && s2) { const top = readPng(tex(t)), side = readPng(tex(s2)); if (top && side) { addItem(id, { w: 32, h: 32, d: cube(top, side, side) }); cubes++; continue; } }
  missing.push(id);
}
for (const f of fs.readdirSync(tex('mob_effect'))) { const img = readPng(tex('mob_effect/' + f)); if (img) { index.effects[f.replace('.png', '')] = effCells.length; effCells.push(scaleTo(img, 18)); } }
function atlas(file, list, S, cols) {
  const rows = Math.ceil(list.length / cols), W = cols * S, H = rows * S, buf = Buffer.alloc(W * H * 4);
  list.forEach((c, i) => { const cx = (i % cols) * S, cy = Math.floor(i / cols) * S; for (let y = 0; y < S; y++) c.copy(buf, ((cy + y) * W + cx) * 4, y * S * 4, (y + 1) * S * 4); });
  writePng(path.join(out, file), W, H, buf);
}
index.cols = 40; index.cell = 32; index.effCell = 18; index.effCols = 10;
atlas('items.png', cells, 32, index.cols); atlas('effects.png', effCells, 18, index.effCols);
const NLX = String.fromCharCode(10);
fs.writeFileSync(path.join(root, 'dev/browser/mock.js'), fs.readFileSync(path.join(root, 'tools/mock.head.js'), 'utf8') + NLX + 'var ED_MC = ' + JSON.stringify(index) + ';' + NLX);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('物品图 ' + flat + ' 张，合成方块图 ' + cubes + ' 张，缺图 ' + missing.length + ' 个，效果图标 ' + effCells.length + ' 个，图集 ' + cells.length + ' 格');
fs.writeFileSync(path.join(root, 'tools/.missing-icons.txt'), missing.join(NLX));
