const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const h = H.create(), c = h.c;
const hero = h.doc.createElement('div'); hero.id='hero'; h.root.appendChild(hero);
c.weActive=()=>false; c.fitTip=()=>{};
function doc(comps) { return c.makeDoc({key:'preview',id:'minecraft:diamond_sword',count:1,comps,removed:{},snbt:{}}); }
function notices() { return h.sent.filter(([channel, value])=>channel==='log' && value.msg.includes('site=preview.special_float')); }
const d=doc({
  custom_data:c.parseSnbtUser('{nested:[NaNf,+Infinityf,-Infinityd],quoted:"NaNf",NaNf:"Infinityf"}'),
  custom_name:'NaNf',item_model:'minecraft:diamond_sword',enchantments:{'minecraft:unbreaking':2},
  container:c.parseSnbtUser('[{slot:0,item:{id:"minecraft:stone",components:{"minecraft:custom_data":{v:Infinityd}}}}]')
});
const original=c.stackCompsSnbt(d), snapshot=c.nbtSnapshot(d), apply=JSON.stringify(c.nbtApplyFormats(d,true)), exported=c.stackSnbt(d);
const projected=c.stackPreviewComps(d);
assert.equal(projected.snbt,original,'all typed components are passed intact to the editor-native preview parser');
assert.match(projected.snbt,/"minecraft:custom_name":"NaNf"/,'special-looking quoted string remains renderable');
assert.match(projected.snbt,/"minecraft:enchantments"/,'unrelated renderable component retained');
assert.match(projected.snbt,/"minecraft:custom_data"/);
assert.match(projected.snbt,/"minecraft:container"/);
assert.equal(c.stackCompsSnbt(d),original,'original component encoder remains lossless');
assert.equal(c.nbtSnapshot(d),snapshot,'preview does not mutate document or dirty state');
assert.equal(JSON.stringify(c.nbtApplyFormats(d,true)),apply,'typed apply payload remains exact');
assert.equal(c.stackSnbt(d),exported,'SNBT export remains exact');
c.Store.docs=[d];c.Store.active=0;c.Store.current=0;c.Store.doc=()=>d;
for(const view of ['2d','3d']) {
  c.UI.heroView=view;c.drawHero();
  const element=hero.querySelector(view==='2d'?'item':'model');assert.ok(element,'actual '+view+' hero path renders');
  assert.equal(element.getAttribute('components'),original,'actual '+view+' preview uses the complete typed data');
  assert.doesNotMatch(hero.textContent,/预览暂不包含|解析器不支持/,'no custom warning in the model region');
}
assert.equal(notices().length,0,'supported special values do not emit omission warnings');
const failures=[];c.UI.previewProblem={signature:c.stackPreviewSignature(original),error:'fixture parse failure'};
c.stackPreviewProblems(d,failures);assert.equal(failures.length,1,'real preview failure participates in the existing problem list');
assert.equal(failures[0].level,'warn');assert.equal(failures[0].cid,null);
const quoted=doc({custom_data:c.parseSnbtUser('{NaNf:"NaNf",Infinityd:"+Infinityf",values:["-Infinityd"]}'),custom_name:'Infinityf'});
assert.equal(c.stackPreviewComps(quoted).snbt,c.stackCompsSnbt(quoted),'ordinary projection is identical to original encoder');
const unrelated=[];c.stackPreviewProblems(quoted,unrelated);assert.equal(unrelated.length,0,'stale preview failure cannot attach to another stack');
d.comps.custom_data=c.parseSnbtUser('{changed:-Infinityf}');
assert.equal(c.stackPreviewComps(d).snbt,c.stackCompsSnbt(d),'new special values remain exact');
d.comps.custom_data=c.parseSnbtUser('{nested:[NaNf,+Infinityf,-Infinityd],quoted:"NaNf",NaNf:"Infinityf"}');
assert.equal(c.nbtSnapshot(d),snapshot,'returning to same data restores the exact original snapshot');
// Production wire projection has no special JS numbers until its typed sidecar hydrates it.
const wire=doc({custom_data:{v:null},custom_name:'NaNf'});wire.snbt={custom_data:'{v:-Infinityd}'};
wire.comps=c.nbtHydrate(wire.comps,wire.snbt);
assert.match(c.stackPreviewComps(wire).snbt,/-Infinityd/,'hydrated sidecars remain typed in the native preview');
console.log('PASS preview: complete typed components, quote/key safety, nested/list and hydrated sidecars, actual 2D/3D wiring, unified stale-safe failure entry, unchanged document/apply/export.');
