const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const dir = path.resolve(__dirname, '../common/src/main/resources/assets/cadeditor/ui/js');
function element(tag, props = {}, kids = []) {
  const e = { tag, tagName: tag.toUpperCase(), value: props.value === undefined ? '' : String(props.value), className: props.class || '', attrs: {...props}, children: [], events: {}, style: {}, textContent: props.text || '',
    setAttribute(k,v) { this.attrs[k] = String(v); if(k==='value')this.value=String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
    querySelector(selector) { const matches = child => selector.startsWith('.') ? child.className.split(' ').includes(selector.slice(1)) : child.tag===selector; for(const child of this.children){if(matches(child))return child;const found=child.querySelector(selector);if(found)return found;}return null; },
    addEventListener(k,fn) { this.events[k] = fn; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { this.children.splice(this.children.indexOf(c),1); c.parentNode = null; },
    replaceChild(n,c) { this.children[this.children.indexOf(c)] = n; n.parentNode = this; c.parentNode = null; },
    get firstChild() { return this.children[0]; } };
  e.classList = { add(c) { e.className += ' ' + c; }, remove(c) { e.className = e.className.split(' ').filter(x=>x!==c).join(' '); }, toggle(c,on) { if(on) this.add(c); else this.remove(c); } };
  kids.filter(x=>x!=null).forEach(c=>e.appendChild(typeof c === 'string' ? element('text',{text:c}) : c));
  return e;
}
function all(root, cls) { return (root.className.split(' ').includes(cls) ? [root] : []).concat(root.children.flatMap(c=>all(c,cls))); }
const sent = [], receipts = {}, warnings = [];
const c = vm.createContext({console, setTimeout:()=>1, clearTimeout(){},
  document:{addEventListener(){},querySelectorAll(){return[];}},
  oriel:{data:{hostAudio:true},send(k,v){sent.push({k,v});},on(k,fn){receipts[k]=fn;}},
  clone:v=>JSON.parse(JSON.stringify(v)), isObj:v=>!!v && typeof v==='object' && !Array.isArray(v),
  fmtNum:String, toast:(...args)=>warnings.push(args) });
for (const f of ['data.js','labels.js','core.js','nbt.js','reg.js','forms.js','specs.js','cards1.js']) vm.runInContext(fs.readFileSync(path.join(dir,f),'utf8'),c);
c.h = element; c.uiIcon = ()=>element('img');
c.centerInput = ()=>{};
c.Reg.meta = {generation:'compact-live'};
c.kNumber = (value,o)=>({el:Object.assign(element('div',{class:'test-number'}),{value,change:o.onChange})});
c.kBtn = (label,fn,o={})=>Object.assign(element('div',{class:'k-btn '+(o.cls||''),text:label}),{click:fn});
const sc = c.EDATA.comps.find(x=>x.id==='blocks_attacks').schema;
const spec = c.SPEC_FORMS.blocks_attacks;
let commits = 0, current = {item_damage:{threshold:1.2,base:0.2,factor:1.2},unknown:{preserve:true}};
const before = JSON.stringify(current);
const delayField = sc.f.find(f=>f.k==='block_delay_seconds');
const unknownRow = c.compactField(delayField, {label:'延迟'}, delayField.s, current, ()=>commits++, {});
const unknownInput = all(unknownRow,'ed-numin')[0];
assert.equal(unknownInput.value,'','unread authoritative default stays blank, never invented as zero');
assert.equal(commits,0);
unknownInput.value='0.123456789';unknownInput.events.input();
assert.equal(current.block_delay_seconds,0.123456789,'unknown default still permits explicit precision-preserving input');
delete current.block_delay_seconds;commits=0;
// Supply the same live-derived schema row the host sends, not data.js defaults
// or an item prototype masquerading as a universal optional-field default.
const live = JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/component-schema-26.3.json'),'utf8')).components.find(x=>x.id==='minecraft:blocks_attacks');
assert.ok(live,'real Codec-derived blocks_attacks fixture');
c.Reg.ingestSchemaDefaults([live]);
const authoritativeDelay = c.Reg.fieldDefault(delayField);
assert.equal(typeof authoritativeDelay,'number','fixture proves this optional default');
const form = c.wObj({...sc,f:sc.f.filter(f=>!c.isSoundUnion(f.s))},current,()=>commits++,{spec});
assert.equal(JSON.stringify(current),before,'rendering inherited defaults must not write overrides');
assert.equal(commits,0);
const numeric = all(form,'test-number');
assert.equal(numeric[0].value,authoritativeDelay,'inherited delay comes from the actual Codec fixture');
numeric[0].change(0.25);
assert.equal(current.block_delay_seconds,0.25);
assert.equal(current.unknown.preserve,true);
const required = sc.f.find(f=>f.k==='item_damage').s.f[0];
const requiredRow = c.compactField(required,{label:'门槛'},required.s,current.item_damage,()=>{},{});
assert.equal(all(requiredRow,'compact-reset').length,0,'required fields cannot be removed with reset');
assert.equal(all(requiredRow,'compact-reset-space').length,1);
const rules = [{base:0,factor:1,unknown:42},{base:2,factor:0.5}];
const arr = c.wArr(sc.f.find(f=>f.k==='damage_reductions').s,rules,()=>{}, {flatList:true,listLabel:'规则',itemSpec:spec.over.damage_reductions.itemSpec});
all(arr,'ed-it-tools')[0].children[0].events.click({});
assert.equal(rules[1].unknown,42,'reordering preserves unknown fields');
assert.equal(rules[0].base,2);
const source = fs.readFileSync(path.join(dir,'picker.js'),'utf8');
vm.runInContext(source.slice(0,source.indexOf('/* 通用选择器窗口')),c);
c.SoundPreview.toggle('minecraft:first');
assert.equal(sent.at(-1).k,'sound_preview');
assert.equal(c.SoundPreview.state,'stopped','UI waits for receipt');
receipts.data({id:'minecraft:first',state:'playing'},'sound_preview');
assert.equal(c.SoundPreview.state,'playing');
receipts.data({sound_preview:{id:'minecraft:first',state:'paused'}},'sound_preview');
assert.equal(c.SoundPreview.state,'paused');
c.SoundPreview.toggle('minecraft:second');
assert.equal(sent.at(-1).v.id,'minecraft:second');
receipts.data({state:'error',error:'missing'},'sound_preview');
assert.equal(c.SoundPreview.state,'paused','failure preserves confirmed state');
c.oriel.data.hostAudio=false; const n=sent.length; c.SoundPreview.toggle('minecraft:third');
assert.equal(sent.length,n,'old host never starts unmanaged overlapping audio');
console.log('PASS compact forms: no render mutation, inherited numeric edit, required fields, reorder preservation; audio receipt states and old-host guard.');
