import { appendFileSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function publishProbe(run, request) {
  const temporary = join(run, 'page-request.tmp'), destination = join(run, 'page-request.json');
  writeFileSync(temporary, JSON.stringify(request));
  const deadline = Date.now() + 2000;
  for (;;) {
    try { renameSync(temporary, destination); return; }
    catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || Date.now() >= deadline) throw error;
      await delay(10); // Windows may briefly deny replacement while the render thread reads it.
    }
  }
}

// One connection owns its pending requests. A timeout/close never leaves a hanging promise.
export class MCTest {
  constructor(url = 'ws://127.0.0.1:25599/', log = () => {}) { this.url = url; this.log = log; this.pending = new Map(); this.id = 0; }
  async connect(timeout = 5000) {
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener('message', event => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { this.abort(new Error('Malformed MCTest JSON')); this.ws.close(); return; }
      const p = this.pending.get(message.id);
      if (!p) return;
      this.pending.delete(message.id); clearTimeout(p.timer);
      if (message.error) p.reject(new Error(`${p.method}: ${JSON.stringify(message.error)}`)); else p.resolve(message.result);
    });
    this.ws.addEventListener('close', () => this.abort(new Error('MCTest connection closed')));
    this.ws.addEventListener('error', () => this.abort(new Error('MCTest connection error')));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.ws.close(); reject(new Error('MCTest connect timeout')); }, timeout);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('MCTest connect failed')); }, { once: true });
    });
    return this;
  }
  abort(error) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear(); }
  async call(method, params = {}, timeout = 8000) {
    const id = ++this.id, started = Date.now();
    try {
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: timeout after ${timeout}ms`)); }, timeout);
        this.pending.set(id, { resolve, reject, timer, method });
        try { this.ws.send(JSON.stringify({ id, method, params })); }
        catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
      });
      this.log({ id, method, params, result, ms: Date.now() - started }); return result;
    } catch (error) { this.log({ id, method, params, error: error.message, ms: Date.now() - started }); throw error; }
  }
  close() { this.abort(new Error('MCTest disposed')); this.ws?.close(); }
}

// Deliberately no public eval API: effects can only ask for a DOM rectangle/value.
export class PageProbe {
  constructor(run, evidence) { this.run = run; this.evidence = evidence; this.seq = 0; }
  async inspect(locator) {
    const id = `effects-${process.pid}-${++this.seq}`;
    const js = `(function(){var l=${JSON.stringify(locator)},a=Array.prototype.slice.call(document.querySelectorAll(l.selector));if(l.text)a=a.filter(function(e){return e.textContent.trim()===l.text;});if(l.contains)a=a.filter(function(e){return e.textContent.indexOf(l.contains)>=0;});if(l.label)a=a.filter(function(e){var p=e.closest('.k-xrow');return p&&p.querySelector('.tx .z')&&p.querySelector('.tx .z').textContent.trim()===l.label;});if(l.index!==undefined)a=a.slice(l.index,l.index+1);if(a.length!==1)return {error:'Expected one control',matches:a.length};var e=a[0],r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,ix=Array.prototype.indexOf.call(document.querySelectorAll(l.selector),e);return {matchIndex:ix,x:x,y:y,width:window.innerWidth,height:window.innerHeight,w:r.width,h:r.height,value:e.value,collapsed:!!e.closest('.k-card')&&e.closest('.k-card').classList.contains('collapsed'),disabled:!!e.disabled||e.classList.contains('dim')||e.classList.contains('dis'),text:e.textContent};})()`;
    await publishProbe(this.run, { id, js, hitSelector: locator.selector });
    for (let i = 0; i < 100; i++) {
      await delay(50);
      let r;
      try { r = JSON.parse(readFileSync(join(this.run, 'page-response.json'), 'utf8')); }
      catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) continue; throw e; }
      if (r.id !== id) continue;
      appendFileSync(join(this.evidence, 'page.jsonl'), JSON.stringify({ locator, response: r }) + '\n');
      if (r.error) throw new Error(r.error);
      if (r.visible || r.focused) throw new Error('Hidden window safety assertion failed');
      return r.value;
    }
    throw new Error(`Page probe timeout: ${JSON.stringify(locator)}`);
  }
}
export async function clickPage(mc, probe, locator) {
  // Move the in-game pointer first so an old tooltip cannot occlude the new target.
  await mc.call('hover', { x: 4, y: 4 });
  await delay(80);
  const r = await probe.inspect(locator);
  if (!r || r.error || r.disabled || !r.hit || r.w <= 0 || r.h <= 0 || r.x < 0 || r.y < 0 || r.x >= r.width || r.y >= r.height)
    throw new Error(`Unclickable control ${JSON.stringify(locator)}; actual=${JSON.stringify(r)}`);
  const snap = await mc.call('snapshot');
  if (!(snap.guiWidth > 0 && snap.guiHeight > 0)) throw new Error('Snapshot missing GUI dimensions');
  await mc.call('click', { x: r.x * snap.guiWidth / r.width, y: r.y * snap.guiHeight / r.height });
}
export async function typeText(mc, text) {
  // Oriel suppresses a character after prevented shortcut keydown. Clear it for EACH character.
  const punctuation = { ' ': 'space', '\n': 'enter', ':': 'semicolon', ';': 'semicolon', '"': 'apostrophe', "'": 'apostrophe', '{': 'left_bracket', '[': 'left_bracket', '}': 'right_bracket', ']': 'right_bracket', ',': 'comma', '.': 'period', '-': 'minus', '_': 'minus', '/': 'slash', '=': 'equal' };
  for (const ch of String(text)) {
    if (ch.charCodeAt(0) > 126 || ch.charCodeAt(0) < 32) throw new Error('Effects inputs must be printable ASCII');
    await mc.call('key', { key: punctuation[ch] || ch.toLowerCase() });
    await mc.call('type', { text: ch });
  }
}
export async function fillPage(mc, probe, locator, value) {
  await clickPage(mc, probe, locator);
  await mc.call('key', { key: 'a', modifiers: ['ctrl'] });
  await mc.call('key', { key: 'backspace' });
  await typeText(mc, value);
  const actual = (await probe.inspect(locator))?.value;
  if (actual !== String(value)) throw new Error(`Input mismatch ${JSON.stringify(locator)}; expected=${JSON.stringify(String(value))}; actual=${JSON.stringify(actual)}`);
  await mc.call('key', { key: 'tab' });
}
