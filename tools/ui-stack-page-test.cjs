const assert=require('node:assert/strict'),fs=require('node:fs'),H=require('./lib/ui-harness.cjs');
H.Element.prototype.setTextHighlights=function(source,ranges,numbers){ assert.equal(source,this.value);this.highlights={ranges,numbers};return true; };
const t=H.create(),c=t.c;c.snd=()=>{};c.toast=()=>{};c.Reg.meta={};c.window.EDITOR_PREVIEW=true;
c.Store.open({id:'minecraft:diamond_sword',count:1,comps:{custom_data:c.parseSnbt('{big:9007199254740993L,a:[B;1b],i:[I;2],l:[L;3L],f:NaNf}'),'mod:unknown':c.parseSnbt('{n:2s}')},removed:{enchantment_glint_override:1}},true);
const d=c.Store.doc();c.rebuild();
for(const kind of Object.keys(c.PAGES)){const tabs=c.tabsOfKind(kind);assert.equal(tabs[0].id,'item-stack',kind);assert.equal(new Set(tabs.map(x=>x.id)).size,tabs.length,kind+': unique tab identities');assert.equal(tabs[0].label,'物品栈');assert(!tabs.some(x=>x.id==='raw'||x.id==='commands'));}
assert.notEqual(c.UI.tab,'item-stack','initial normal page is separate from visual first tab');
c.UI.tab='item-stack';c.UI.cmdFmt='snbt';c.drawTabbar();c.drawTabBody();
const body=t.doc.getElementById('edbody'),ta=body.querySelector('textarea'),initial=ta.value;
for(const exact of ['9007199254740993L','[B;1b]','[I;2]','[L;3L]','NaNf','2s','!minecraft:enchantment_glint_override'])assert(initial.includes(exact),exact);
assert.equal(ta.getAttribute('readonly'),null);assert.equal(body.querySelectorAll('textarea').length,1);
ta.value='{id:';ta.selectionStart=4;ta.selectionEnd=4;ta.scrollTop=45;ta.fire('input');assert(c.itemRawBlocked());
c.UI.cmdFmt='json';c.drawTabBody();const json=body.querySelector('textarea');assert.notEqual(json,ta);assert(json.getAttribute('readonly'));assert.equal(json.value,JSON.stringify(c.stackNbt(d),null,2));
c.UI.cmdFmt='cmd';c.drawTabBody();assert.equal(body.querySelector('.ed-command').textContent,c.buildCommand(d,c.UI.cmdMode,c.UI.cmdSel));
const commandCopy=c.copyText;let copiedCommand;
c.copyText=text=>{copiedCommand=text;};
body.querySelectorAll('.k-btn').find(el=>el.textContent==='复制').fire('click');
assert.equal(copiedCommand,c.buildCommand(d,c.UI.cmdMode,c.UI.cmdSel),'copy uses the original one-line command, not visual line breaks');
c.copyText=commandCopy;
c.UI.cmdFmt='snbt';c.drawTabBody();assert.strictEqual(body.querySelector('textarea'),ta);assert.equal(ta.value,'{id:');assert.equal(ta.selectionStart,4);assert.equal(ta.scrollTop,45);
ta.value=initial.replace(/count:\s*1/,'count:2');assert.notEqual(ta.value,initial);ta.fire('input');assert(!c.itemRawBlocked());assert.equal(d.count,2);
assert(c.nbtComponentText(d,'custom_data').includes('9007199254740993L'));
c.Store.undo();assert.equal(d.count,1);c.Store.redo();assert.equal(d.count,2);
for(const [route,mode] of [['raw','snbt'],['commands','cmd']]){c.UI.tab=route;if(route==='commands')c.UI.cmdFmt='cmd';c.drawEdit();assert.equal(c.UI.tab,'item-stack');assert.equal(c.UI.cmdFmt,mode);}
for(const [route,mode] of [['snbt','snbt'],['cmd','cmd']]){c.openAdvanced(route);assert.equal(c.UI.tab,'item-stack');assert.equal(c.UI.cmdFmt,mode);assert.equal(c.UI.adv,'all');}
assert(!c.ADV_TABS.some(x=>x[0]==='snbt'||x[0]==='cmd'));
assert(!body.textContent.includes('完整物品栈 SNBT ·'));
const css=fs.readFileSync('common/src/main/resources/assets/cadeditor/ui/editor.css','utf8');
assert(/\.k-problems \.k-mt\s*\{[^}]*height:\s*auto/.test(css));
assert(/\.k-fld\s*\{[^}]*flex-shrink:\s*0/.test(css));
assert(/\.ed-code-actions\s*\{[^}]*overflow-x:\s*auto/.test(css));
assert(css.includes('word-break: break-all; user-select: text; overflow-x: hidden; overflow-y: auto;'),'command preview wraps long tokens and remains selectable');
// Exercise the real boot registry callback. Same-node reuse alone is insufficient:
// native textareas blur when their ancestor is detached, even if later reinserted.
const vm=require('node:vm'),path=require('node:path');
let registryCallback;const on=c.Reg.on;c.Reg.on=function(fn){registryCallback=fn;return on.call(this,fn);};
vm.runInContext(fs.readFileSync(path.join(t.dir,'js/app.js'),'utf8'),c,{filename:'app.js'});
c.UI.tab='item-stack';c.UI.cmdFmt='snbt';c.UI.autoDefaultTab=null;c.drawTabbar();c.drawTabBody();
const rawBody=t.doc.getElementById('edbody'),liveTa=rawBody.querySelector('textarea');
let detachments=0;const removeChild=rawBody.removeChild;
rawBody.removeChild=function(child){detachments++;t.doc.activeElement=null;return removeChild.call(this,child);};
liveTa.focus();liveTa.value='{id:';liveTa.selectionStart=3;liveTa.selectionEnd=4;liveTa.scrollTop=37;liveTa.scrollLeft=19;liveTa.fire('input');
const draftBefore=c.snapOf(c.Store.doc()),toolsBefore=t.doc.getElementById('edtools').children.slice();
function registryReply(kind){registryCallback(kind,[kind]);t.timers.filter(x=>x.ms===400).at(-1).fn();}
for(const kind of ['item_meta_one','item_defaults_one','entity_schema','registry.block']){
 registryReply(kind);assert.equal(detachments,0,'registry reply must not detach active raw surface: '+kind);
 assert.equal(t.doc.activeElement,liveTa);assert.equal(rawBody.querySelector('textarea'),liveTa);
 assert.equal(liveTa.value,'{id:');assert.equal(liveTa.selectionStart,3);assert.equal(liveTa.selectionEnd,4);
 assert.equal(liveTa.scrollTop,37);assert.equal(liveTa.scrollLeft,19);assert.equal(c.snapOf(c.Store.doc()),draftBefore);
 assert.deepEqual(t.doc.getElementById('edtools').children,toolsBefore,'code toolbar remains mounted');
}
rawBody.removeChild=removeChild;c.UI.tab='look';c.drawTabbar();c.drawTabBody();
let redraws=0;const redraw=c.drawTabBody;c.drawTabBody=function(){redraws++;return redraw();};
registryReply('item_meta_one');assert.equal(redraws,1,'ordinary field pages still refresh registry data');
c.drawTabBody=redraw;
console.log('PASS single stack page, typed buffers/history, real boot registry callback preserves mounted raw textarea/focus/selection/scroll/toolbar, ordinary metadata pages refresh');
