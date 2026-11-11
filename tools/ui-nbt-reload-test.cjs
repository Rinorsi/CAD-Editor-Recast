// Run the actual Java controller's scripts in separate Documents. WeakMap
// metadata must survive serialization, not just a copy in the same JS runtime.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('./lib/ui-harness.cjs');
const source = fs.readFileSync(path.join(__dirname, '../common/src/main/java/dev/rinorsi/editor/client/EditorPageController.java'), 'utf8');
function literals(text) { return [...text.matchAll(/"(?:\\.|[^"\\])*"/g)].map(m => JSON.parse(m[0])).join(''); }
const save = literals(source.split('evaluateToJson(')[1].split(', "editor-save-state"')[0]);
const restoreParts = source.split('document.scripts().evaluate(')[1].split(', "editor-restore-state"')[0].split('+ json +');
assert.equal(restoreParts.length, 2, 'read the production restore expression');
function restore(h, state) { vm.runInContext(literals(restoreParts[0]) + JSON.stringify(state) + literals(restoreParts[1]), h.c); }
function setup() {
  const h = H.create();
  h.c.Store.open({id:'minecraft:stone', key:'same', src:{kind:'inventory',index:0,token:'same'},comps:{},snbt:{}},true);
  return h;
}
const original = setup();
original.c.Store.set('custom_data',original.c.parseSnbtUser('{s:2s,l:9007199254740993L,nan:NaNf,pos:+Infinityf,neg:-Infinityd,b:[B;1b],i:[I;2],a:[L;9007199254740995L]}'));
original.c.Store.set('custom_data',original.c.parseSnbtUser('{s:3s,l:9007199254740993L,nan:NaNf,pos:+Infinityf,neg:-Infinityd,b:[B;1b],i:[I;2],a:[L;9007199254740995L]}'));
original.c.Store.open({id:'minecraft:paper',key:'second',src:{kind:'inventory',index:1},comps:{custom_data:original.c.parseSnbtUser('{s:3b}')},snbt:{}},false);
const before = original.c.Store.docs.map(d => original.c.nbtComponentText(d,'custom_data'));
const state = JSON.parse(JSON.stringify(vm.runInContext(save, original.c)));
assert.equal(state.version, 2);
const next = setup();
restore(next,state);
assert.equal(next.c.Store.docs.length,2);
for(let i=0;i<2;i++) assert.equal(next.c.nbtComponentText(next.c.Store.docs[i],'custom_data'),before[i]);
assert.notEqual(next.c.snapOf(next.c.Store.doc()),next.c.Store.doc().base,'unsaved edits stay dirty');
assert.equal(next.c.Store.doc().hi,original.c.Store.doc().hi,'undo position stays intact');
next.c.Store.undo();
assert.match(next.c.nbtComponentText(next.c.Store.doc(),'custom_data'),/^\{s:2s,/);
next.c.Store.redo();
assert.equal(next.c.nbtComponentText(next.c.Store.doc(),'custom_data'),before[0]);
assert.equal(next.c.nbtApplyFormats(next.c.Store.doc()).comps.custom_data,before[0],'post-reload submit preserves types and precision');
next.c.Store.set('custom_data',next.c.parseSnbtUser('{s:3L}'));
const again=JSON.parse(JSON.stringify(vm.runInContext(save,next.c)));
const third=setup();restore(third,again);
assert.equal(third.c.nbtComponentText(third.c.Store.doc(),'custom_data'),'{s:3L}');
original.c.EditorBridge={pending:'inflight'};
assert.equal(vm.runInContext(save,original.c),null);
const other=setup();other.c.Store.doc().src.token='other';restore(other,state);
assert.equal(other.c.Store.docs.length,1);assert.equal(Object.keys(other.c.Store.doc().comps).length,0);
// Previously shipped drafts used v1 without type metadata. Accept their exact
// old baseline representation, but never accept an unrelated changed baseline.
const legacy=setup();
const legacyDoc=legacy.c.Store.doc();
const oldBase=JSON.stringify({id:legacyDoc.id,count:legacyDoc.count,comps:{},removed:{}});
const oldDraft={v:1,id:legacyDoc.id,count:2,comps:{custom_name:'legacy draft'},removed:{},base:oldBase};
assert.equal(legacy.c.Drafts.matchesBase(legacyDoc,oldDraft),true,'existing v1 draft is still offered');
legacy.c.Drafts.restore(legacyDoc,oldDraft);
assert.equal(legacy.c.Store.doc().count,2);assert.equal(legacy.c.Store.doc().comps.custom_name,'legacy draft');
oldDraft.base=JSON.stringify({id:'minecraft:dirt',count:1,comps:{},removed:{}});
assert.equal(legacy.c.Drafts.matchesBase(legacyDoc,oldDraft),false,'changed target baseline remains rejected');
console.log('PASS NBT hot reload: actual controller scripts, fresh Documents, scalar/array types, precise long, dirty/undo/redo, pending and target isolation');
