// 界面测试共用的假 DOM 和脚本加载器：按 index.html 的 <script> 顺序把 ui/js 全部载入同一个 vm 上下文。
// 只用于 tools/ui-*.cjs；不依赖浏览器或游戏进程。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attrs = {}; this.style = {}; this.events = {}; this.value = ''; this._text = ''; this.parentNode = null; this.scrollTop = 0; }
  get className() { return this.attrs.class || ''; } set className(x) { this.attrs.class = x; }
  get id() { return this.attrs.id; } set id(x) { this.attrs.id = x; }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get nextSibling() { if (!this.parentNode) return null; const s = this.parentNode.children; return s[s.indexOf(this) + 1] || null; }
  get textContent() { return this._text + this.children.map(x => x.textContent).join(''); }
  set textContent(x) { this._text = String(x); this.children = []; }
  get classList() {
    const el = this;
    return {
      contains(x) { return el.className.split(' ').includes(x); },
      add(...xs) { xs.forEach(x => { if (!this.contains(x)) el.className = (el.className + ' ' + x).trim(); }); },
      remove(...xs) { el.className = el.className.split(' ').filter(y => y && !xs.includes(y)).join(' '); },
      toggle(x, on) { const want = on === undefined ? !this.contains(x) : !!on; if (want) this.add(x); else this.remove(x); return want; }
    };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'value') this.value = String(v); }
  getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(x) { if (x.parentNode) x.remove(); this.children.push(x); x.parentNode = this; return x; }
  insertBefore(x, ref) { if (x.parentNode) x.remove(); const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(x); else this.children.splice(i, 0, x); x.parentNode = this; return x; }
  removeChild(x) { const i = this.children.indexOf(x); if (i >= 0) this.children.splice(i, 1); x.parentNode = null; return x; }
  replaceChild(n, old) { const i = this.children.indexOf(old); if (i < 0) return old; if (n.parentNode) n.remove(); this.children.splice(this.children.indexOf(old), 1, n); n.parentNode = this; old.parentNode = null; return old; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(k, fn) { (this.events[k] = this.events[k] || []).push(fn); }
  removeEventListener(k, fn) { this.events[k] = (this.events[k] || []).filter(f => f !== fn); }
  fire(k, extra) { for (const fn of this.events[k] || []) fn(Object.assign({ target: this, key: '', clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {} }, extra)); }
  click() { this.fire('click'); }
  focus() { this.ownerDoc.activeElement = this; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 }; }
  closest(s) { let e = this; while (e) { if (e.matches && e.matches(s)) return e; e = e.parentNode; } return null; }
  matches(s) {
    return String(s).split(',').some(part => {
      part = part.trim(); if (!part) return false;
      if (part[0] === '#') return this.id === part.slice(1);
      const m = part.match(/^([a-zA-Z0-9]*)((?:\.[\w-]+)*)$/); if (!m) return false;
      if (m[1] && this.tagName.toLowerCase() !== m[1].toLowerCase()) return false;
      return m[2].split('.').filter(Boolean).every(c => this.classList.contains(c));
    });
  }
  querySelectorAll(s) { const out = []; for (const x of this.children) { if (x.matches(s)) out.push(x); out.push(...x.querySelectorAll(s)); } return out; }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; }
}

function create(opts) {
  opts = opts || {};
  const root = new Element('body'), overlays = new Element('div'); overlays.id = 'overlays'; root.appendChild(overlays);
  const doc = {
    body: root, documentElement: new Element('html'), activeElement: null,
    addEventListener(k, fn) { if (opts.documentEvents) (opts.documentEvents[k] = opts.documentEvents[k] || []).push(fn); },
    removeEventListener() {}, dispatchEvent() { return true; },
    createElement(tag) { const e = new Element(tag); e.ownerDoc = doc; return e; },
    createTextNode(t) { const e = new Element('text'); e.ownerDoc = doc; e.textContent = t; return e; },
    getElementById(id) { return root.querySelector('#' + id); },
    querySelector(s) { return root.querySelector(s); }, querySelectorAll(s) { return root.querySelectorAll(s); }
  };
  root.ownerDoc = doc;
  const sent = [];
  const win = { innerWidth: opts.width || 760, innerHeight: opts.height || 560, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  const timers = [];
  const ctx = vm.createContext({
    document: doc, window: win, console, CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    requestAnimationFrame(fn) { timers.push({ fn, ms: 16 }); return timers.length; }, cancelAnimationFrame() {},
    setTimeout(fn, ms) { timers.push({ fn, ms: ms || 0 }); return timers.length; }, clearTimeout() {},
    setInterval(fn, ms) { timers.push({ fn, ms: ms || 0, repeat: true }); return timers.length; }, clearInterval() {},
    oriel: { data: opts.data || {}, send(k, v) { sent.push([k, v]); return true; }, on() {} }
  });
  // 固定时间与随机数：快照要逐字相同
  vm.runInContext('Math.random = function () { return 0.5; }; var __t = 1700000000000; Date.now = function () { return __t; };', ctx);
  const dir = process.env.UI_DIR || path.resolve(__dirname, '../../common/src/main/resources/assets/cadeditor/ui');   // UI_DIR：对别的版本的 ui 目录跑同样的检查
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), files = [];
  html.replace(/<script src="(js\/[^"]+)"/g, (m, f) => { files.push(f); return m; });
  const skip = new Set(opts.skip || ['js/app.js']);
  for (const f of files) { if (skip.has(f)) continue; vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }); }
  // 页面骨架：#win / #topbar / #screen / #footer / #edbody 之类由 index.html 提供，这里手动放几个
  for (const id of ['win', 'topbar', 'screen', 'footer', 'modal-host', 'toasts']) { const e = doc.createElement('div'); e.id = id; if (id === 'win') e.className = 'ew'; root.appendChild(e); }
  return { c: ctx, doc, root, Element, sent, timers, dir, files };
}

// DOM → 稳定文本：标签 + 类名 + 文字 + 少量关键属性；缩进表示层级
function serialize(el, depth, out, o) {
  o = o || {};
  const pad = '  '.repeat(depth);
  if (el.tagName === 'TEXT') { const t = el.textContent.trim(); if (t) out.push(pad + '"' + t + '"'); return; }
  const keep = ['title', 'role', 'placeholder', 'src', 'item', 'type', 'data-card', 'data-src', 'aria-expanded', 'data-ed-open'];
  let line = pad + el.tagName.toLowerCase() + el.className.split(' ').filter(Boolean).sort().map(x => '.' + x).join('');
  // 悬停提示现在存在 data-tip 里（原生 title 不进 DOM）：快照仍照旧格式把它打印成 title=，提示文字继续被基线覆盖
  const attrs = keep.map(k => [k, k === 'title' ? (el.attrs['data-tip'] !== undefined ? el.attrs['data-tip'] : el.attrs.title) : el.attrs[k]]).filter(p => p[1] !== undefined && p[1] !== '').map(p => p[0] + '=' + JSON.stringify(String(p[1])));
  if (el.value) attrs.push('value=' + JSON.stringify(String(el.value)));
  const st = Object.keys(el.style || {}).filter(k => typeof el.style[k] !== 'function' && el.style[k] !== '').sort().map(k => k + ':' + el.style[k]);
  if (st.length) attrs.push('style=' + JSON.stringify(st.join(';')));
  if (el.attrs.style) attrs.push('style=' + JSON.stringify(el.attrs.style));
  if (attrs.length) line += ' [' + attrs.join(' ') + ']';
  if (el._text && el._text.trim()) line += ' "' + el._text.trim() + '"';
  out.push(line);
  for (const k of el.children) serialize(k, depth + 1, out, o);
}
function snapshotOf(el) { const out = []; serialize(el, 0, out); return out.join('\n') + '\n'; }

module.exports = { Element, create, snapshotOf, serialize };
