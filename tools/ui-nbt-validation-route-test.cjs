const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const {c, timers} = H.create();
const sent = [];
c.oriel = {send(k, v) { sent.push({k, v}); return true; }};
c.Reg.live = () => true;
c.Store.open({key:'typed-validation',id:'minecraft:crossbow',comps:{},snbt:{}},true);
// A nested item must use the same typed representation in validation and apply.
const text = '[{slot:0,item:{id:"minecraft:stone",count:1,components:{"minecraft:custom_data":{n:9007199254740993L,a:[L;9007199254740995L]}}}}]';
c.Store.set('container', c.parseSnbtUser(text));
const d = c.Store.doc();
assert.equal(c.nbtNeedsTypedValidation(d,'container'),true,'nested precise longs and typed arrays must not validate via JSON');
timers.length = 0;
c.Valid.touch();
timers.splice(0).filter(t=>t.ms===450).forEach(t=>t.fn());
assert.equal(sent.filter(x=>x.k==='component_validate').length,0,'debounced edit must not send a parallel lossy JSON validation');
const typed = sent.find(x=>x.k==='validate_component');
assert.ok(typed);
assert.equal(typed.v.snbt,text);
assert.equal(typed.v.snbt,c.nbtApplyFormats(d).comps.container,'validation and apply must use identical typed text');
c.Valid.receive({requestId:typed.v.requestId,ok:true});
const problems=[];c.Valid.problems(d,problems);assert.equal(problems.length,0);
c.Store.set('damage',4);
assert.equal(c.nbtNeedsTypedValidation(d,'damage'),false,'ordinary numeric components retain field-level JSON validation');
c.Valid.runHost('damage',d);
assert.equal(sent.find(x=>x.k==='component_validate').v.value,4);
// Quick controls create a plain list/object with a newly typed child. There is
// deliberately no parsed AST on the parent list to accidentally make this pass.
for (const [value,raw] of [[NaN,'NaNd'],[Infinity,'Infinityd'],[-Infinity,'-Infinityd']]) {
  sent.length=0;
  const modifiers=[{type:'minecraft:attack_damage',id:'minecraft:base_attack_damage',amount:c.nbtSpecialScalar(value,'d'),operation:'add_value',slot:'mainhand'}];
  c.Store.set('attribute_modifiers',modifiers);
  assert.equal(c.nbtMeta(d.comps.attribute_modifiers),undefined,'plain form-created parent has no root AST');
  assert.equal(c.nbtUsesSnbt(d,'attribute_modifiers'),true,'new typed child forces lossless Apply');
  assert.equal(c.nbtNeedsTypedValidation(d,'attribute_modifiers'),true,'new typed child forces lossless validation');
  const snbt=c.nbtApplyFormats(d,true).comps.attribute_modifiers;
  assert.equal(typeof snbt,'string');assert.ok(snbt.includes(raw));
  c.Valid.hv.attribute_modifiers={key:JSON.stringify(d.comps.attribute_modifiers),ok:false,errors:[{path:'$[0].amount',message:'Not a number: null'}]};
  c.Valid.hvWait.lateJson={cid:'attribute_modifiers',key:JSON.stringify(d.comps.attribute_modifiers)};
  let issues=[];c.Valid.problems(d,issues);assert.equal(issues.length,0,'obsolete lossy JSON failure cannot block typed data');
  c.Valid.touchHost(d);
  c.Valid.receiveHost({requestId:'lateJson',ok:false,error:'Not a number: null'});
  assert.equal(c.Valid.hv.attribute_modifiers,undefined,'late obsolete JSON reply is discarded');
  c.Valid.runHost('attribute_modifiers',d);
  assert.equal(sent.filter(x=>x.k==='component_validate').length,0,'even direct runHost must not serialize special values as JSON null');
  const request=sent.find(x=>x.k==='validate_component');assert.ok(request);assert.equal(request.v.snbt,snbt,'Apply and validation use identical typed SNBT');
  c.Valid.receive({requestId:request.v.requestId,ok:false,error:'fixture: actual typed Codec rejection'});
  issues=[];c.Valid.problems(d,issues);assert.equal(issues.length,1,'real SNBT Codec rejection still blocks Apply');
  c.Valid.run('attribute_modifiers',d); // A cached genuine rejection remains, rather than being suppressed.
  assert.match(issues[0].msg,/actual typed Codec rejection/);
}
console.log('PASS validation routes: nested precise long/typed array use apply-identical SNBT; ordinary numeric component keeps field validation');
