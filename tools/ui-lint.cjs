// 界面静态检查（不跑页面，只读源码）：
//   1. 同名全局函数在多个文件里重复定义（后加载的悄悄盖掉先加载的）
//   2. 用「name = function」给一个没有声明的全局赋值（同样会悄悄盖掉）
//   3. AUTO_BODY.xxx 在多个文件里重复定义
//   4. CSS 里整条规则只有 display:none 的类，JS 里却仍在生成（生成了用户看不到的元素）——只警告
// 用法：node tools/ui-lint.cjs        有「错误」时退出码 1，警告不影响退出码
const fs = require('node:fs');
const path = require('node:path');
const dir = process.env.UI_DIR || path.resolve(__dirname, '../fabric/src/main/resources/assets/cadeditor/ui');   // UI_DIR：对别的版本的 ui 目录做检查
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), order = [];
html.replace(/<script src="(js\/[^"]+)"/g, (m, f) => { order.push(f); return m; });
const src = {}; order.forEach(f => { src[f] = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/); });

const errors = [], warns = [];
const where = (f, i) => f + ':' + (i + 1);

// 1 + 2：全局函数
const defs = {}, assigns = [];
for (const f of order) src[f].forEach((line, i) => {
  let m = line.match(/^function\s+([A-Za-z_$][\w$]*)\s*\(/);
  if (m) (defs[m[1]] = defs[m[1]] || []).push(where(f, i));
  m = line.match(/^([A-Za-z_$][\w$]*)\s*=\s*function\b/);
  if (m) assigns.push({ name: m[1], at: where(f, i) });
});
Object.keys(defs).forEach(n => { if (defs[n].length > 1) errors.push('全局函数重复定义 ' + n + '：' + defs[n].join('、')); });
assigns.forEach(a => { if (defs[a.name]) errors.push('用赋值覆盖了别处声明的函数 ' + a.name + '：' + a.at + '（原定义 ' + defs[a.name].join('、') + '）'); else warns.push('给未声明的全局赋值 ' + a.name + '：' + a.at); });

// 3：AUTO_BODY 键
const bodies = {};
for (const f of order) src[f].forEach((line, i) => {
  const m = line.match(/^AUTO_BODY\.([A-Za-z_$][\w$]*)\s*=/) || line.match(/^AUTO_BODY\[['"]([\w$]+)['"]\]\s*=/);
  if (m) (bodies[m[1]] = bodies[m[1]] || []).push(where(f, i));
});
Object.keys(bodies).forEach(k => { if (bodies[k].length > 1) errors.push('AUTO_BODY.' + k + ' 重复定义：' + bodies[k].join('、')); });

// 4：被 display:none 隐藏、JS 里仍在生成的类
const css = fs.readFileSync(path.join(dir, 'editor.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const lastDisplay = {}, shown = {};   // 类名 → 它在样式表里最后一次被单独设置的 display（后写的盖掉先写的）
css.replace(/([^{}]+)\{([^{}]*)\}/g, (m, sels, body) => {
  const d = body.match(/(?:^|;)\s*display\s*:\s*([^;!]+)/); if (!d) return m;
  const val = d[1].trim();
  sels.split(',').forEach(s => {
    s = s.trim();
    if (/^\.[\w-]+$/.test(s)) lastDisplay[s.slice(1)] = val;
    if (val !== 'none') (s.match(/\.[\w-]+/g) || []).forEach(c => { shown[c.slice(1)] = 1; });   // 别的选择器（如 .k-card.mod .k-badge）在某种状态下把它显示出来
  });
  return m;
});
const hidden = {}; Object.keys(lastDisplay).forEach(k => { if (lastDisplay[k] === 'none' && !shown[k]) hidden[k] = 1; });
const jsAll = order.map(f => src[f].join('\n')).join('\n');
// 有意保留的「CSS 隐藏、JS 生成」：要么由 JS 用 style.display 切换，要么是自初始导入起就没有可见样式的旧版 forms.js 控件。新增项必须写原因。
const ALLOW = {
  'k-numwarn': 'JS 用 style.display 切换（kit.js 数字框的警告行）',
  'k-redit': 'JS 用 style.display 切换（kit2.js 富文本折叠编辑区）',
  'ed-tcpanel': 'JS 用 style.display 切换（forms.js 的文本组件折叠面板）',
  'ed-enrow': '旧版 forms.js 附魔行，样式表自初始导入就是 display:none；第 5 步淘汰旧控件时一并处理',
  'ed-pop': '旧版 forms.js 组合框弹层（Pop/popOpen），同上',
  'ed-pop-item': '旧版 forms.js 组合框弹层条目，同上'
};
Object.keys(hidden).forEach(cls => {
  if (ALLOW[cls]) return;
  const re = new RegExp(String.raw`class\s*:\s*['"][^'"]*?(?<![\w-])` + cls.replace(/-/g, '\\-') + String.raw`(?![\w-])`);
  const hit = [];
  for (const f of order) src[f].forEach((line, i) => { if (re.test(line)) hit.push(where(f, i)); });
  if (hit.length) warns.push('CSS 把 .' + cls + ' 整个隐藏，但 JS 仍在生成它（' + hit.length + ' 处）：' + hit.slice(0, 6).join('、') + (hit.length > 6 ? ' …' : ''));
});

errors.forEach(e => console.log('错误  ' + e));
warns.forEach(w => console.log('警告  ' + w));
if (errors.length) { console.log('FAIL ui-lint：' + errors.length + ' 个错误，' + warns.length + ' 个警告'); process.exit(1); }
console.log('PASS ui-lint：没有错误；' + warns.length + ' 个警告。');
