const assert=require('node:assert/strict'),H=require('./lib/ui-harness.cjs');
const t=H.create(),c=t.c;c.snd=()=>{};c.toast=()=>{};c.window.EDITOR_PREVIEW=false;c.Reg.meta={generation:'bucket-test'};
const cases=[
 ['mod:arbitrary_bucket','minecraft:cod',[],[],true],
 ['minecraft:tropical_fish_bucket','minecraft:tropical_fish',[],['minecraft:tropical_fish/pattern','minecraft:tropical_fish/base_color','minecraft:tropical_fish/pattern_color'],true],
 ['minecraft:axolotl_bucket','minecraft:axolotl',[{key:'Age',type:'int'},{key:'AgeLocked',type:'boolean'},{key:'HuntingCooldown',type:'long'}],['minecraft:axolotl/variant'],true],
 ['minecraft:tadpole_bucket','minecraft:tadpole',[{key:'Age',type:'int'},{key:'AgeLocked',type:'boolean'}],[],true],
 ['mod:unverified','mod:unknown',[],[],false]
];
for(const [id,type,extra,components,verified] of cases){
 const fields=[{key:'NoAI',type:'boolean'},{key:'Health',type:'float'}].concat(extra);
 c.Reg.imeta[id]={id,mob_bucket:true,bucket_entity:type,bucket_fields_verified:verified,bucket_fields:fields,bucket_components:components};
 // Arbitrary host facts exercise schema wiring; these are not vanilla health constants.
 c.Reg.eschema[type]={id:type,available:true,flags:[{id:'health',min:0,max:12}],variants:[]};
 c.Reg.defs[id]={id,comps:{}};
 c.Store.open({id,count:1,comps:{},removed:{}},true);const d=c.Store.doc(),original=c.snapOf(d);
 assert.equal(c.kindOfItem(id),'bucket');c.UI.tab=null;c.rebuild();assert.equal(c.UI.tab,'bucket');assert.equal(c.tabsOfKind('bucket')[0].id,'item-stack');
 const card=c.CARDS.bucketEntity();assert(card.el.textContent.includes(type));
 const model=c.bucketPreview(d);assert.equal(model.getAttribute('type'),type);assert.equal(c.snapOf(d),original,'read/preview must not insert defaults');
 const form=c.CARDS.bucketFields();if(!verified){assert.equal(form,null);continue;}
 const data=c.parseSnbtUser('{unknown:9007199254740993L,arr:[L;3L],Health:4.0f}');c.Ctx.set('bucket_entity_data',data);
 const edit=c.CARDS.bucketFields(),rows=edit.body.querySelectorAll('.k-fld');
 const health=rows.find(x=>(x.getAttribute('data-tip')||'')==='Health').querySelector('input');health.value='6.5';health.fire('input');health.fire('change');
 assert.equal(c.nbtNumberValue(c.bucketData().Health),6.5);assert(c.nbtComponentText(d,'bucket_entity_data').includes('6.5f'));
 assert(c.nbtComponentText(d,'bucket_entity_data').includes('9007199254740993L'));assert(c.nbtComponentText(d,'bucket_entity_data').includes('[L;3L]'));
 if(extra.some(x=>x.key==='HuntingCooldown')){const input=rows.find(x=>(x.getAttribute('data-tip')||'')==='HuntingCooldown').querySelector('input');input.value='9007199254740993';input.fire('input');input.fire('change');assert(c.nbtComponentText(d,'bucket_entity_data').includes('HuntingCooldown:9007199254740993L'));}
 if(components.length){
  for(const component of components){const key=c.shortId(component),enumName=c.LIVE_ENUM[key];if(enumName)c.Reg.ingest('registry.enum:'+enumName,{generation:'bucket-test',entries:[{id:'first',name:'宿主选项一'},{id:'new_host_variant',name:'宿主新增选项'}],total:2,done:true});}
  c.Reg.ingest('registry.enum:dye_color',{generation:'bucket-test',entries:[{id:'red',name:'红'},{id:'blue',name:'蓝'}],total:2,done:true});
  const appearance=c.CARDS.bucketAppearance(),snap=c.snapOf(d);t.doc.getElementById('screen').appendChild(appearance.el);assert.equal(c.snapOf(d),snap,'appearance rendering never materializes defaults');
  const enumKey=c.shortId(components[0]),select=appearance.el.querySelector('.k-sel');assert(select);select.fire('click');
  const options=c.KPop.el.querySelectorAll('.k-prow');assert.equal(options.length,2,'choices are host facts, not bundled enum list');options[1].fire('mousedown');assert.equal(c.Ctx.get(enumKey),'new_host_variant');
  select.fire('click');const manual=c.KPop.el.querySelector('input');manual.value='mod:future_variant';manual.fire('keydown',{key:'Enter'});assert.equal(c.Ctx.get(enumKey),'mod:future_variant','short enum also allows explicit manual ID');
  const dyes=appearance.el.querySelectorAll('.ed-dye');if(dyes.length){dyes[1].fire('click');assert.equal(c.Ctx.get('tropical_fish/base_color'),'blue');}
  const preview=c.bucketPreview(d);assert(preview.getAttribute('components').includes('mod:future_variant'));assert(c.nbtComponentText(d,'bucket_entity_data').includes('9007199254740993L'));
 }
 const saved=c.snapOf(d);c.Store.undo();c.Store.redo();assert.equal(c.snapOf(d),saved);
 c.UI.tab='look';c.drawTabBody();c.UI.tab='bucket';c.drawTabBody();assert.equal(c.snapOf(d),saved);
 const clear=c.CARDS.bucketFields().body.querySelectorAll('.k-fld').find(x=>(x.getAttribute('data-tip')||'')==='Health').querySelector('input');clear.value='';clear.fire('change');assert.equal(c.bucketData().Health,undefined,'blank restores absent field without a manufactured default');
}
assert(!t.sent.some(([key])=>key==='apply'||key==='apply_world'));
// Real hosts deliver item defaults and item metadata after the first generic render.
for(const explicit of [null,'look','item-stack']){
 const id='mod:delayed_bucket_'+String(explicit);c.UI.tab=null;
 delete c.Reg.defs[id];delete c.Reg.imeta[id];
 c.Store.open({id,count:1,comps:{},removed:{}},true);c.rebuild();assert.equal(c.UI.tab,'look');
 if(explicit)t.doc.getElementById('edtab-'+explicit).fire('click');
 c.Reg.defs[id]={id,comps:{}};c.Reg.imeta[id]={id,mob_bucket:true,bucket_entity:'minecraft:cod',bucket_fields_verified:true,bucket_fields:[],bucket_components:[]};
 c.drawHero();c.drawTabbar();c.drawTabBody();
 assert.equal(c.UI.tab,explicit||'bucket','late metadata corrects only automatic fallback, not an explicit tab choice');
 assert.equal(c.snapOf(c.Store.doc()),c.snapOf({id,count:1,comps:{},removed:{}}),'routing does not manufacture bucket data');
}
// A terminal transport error must not remain an endless loading message or alter raw data.
{
 const type='mod:health_error',meta={bucket_entity:type};let writes=0;
 delete c.Reg.eschema[type];const waiting=c.bucketHealthControl(meta,999,()=>writes++);
 assert(waiting.textContent.includes('放出上限读取中'));
 c.Reg.ingest('registry.entity_schema',{version:1,name:'entity_schema',id:type,generation:'entity-schema-17',worldGeneration:'bucket-test',offset:0,total:0,entries:[],done:true,error:'实体数据传输失败：30秒内未收到完整响应'});
 const failed=c.bucketHealthControl(meta,999,()=>writes++),input=failed.querySelector('input');
 assert(!failed.textContent.includes('读取中'));assert(failed.textContent.includes('放出上限读取失败'));assert(!failed.textContent.includes('30秒内未收到完整响应'),'details are shown on demand');
 input.fire('change');assert.equal(input.value,'999');assert.equal(writes,0,'failure never rewrites an imported value');
 c.Reg.eschema[type]=false;const absent=c.bucketHealthControl(meta,999,()=>writes++);assert(!absent.textContent.includes('正在读取'));assert(absent.textContent.includes('未提供'));
 c.Reg.eschema[type]={id:type,available:true,flags:[{id:'health',min:0,max:6}]};
 const ready=c.bucketHealthControl(meta,2,()=>writes++);assert(ready.textContent.includes('放出上限 6'));assert(!ready.textContent.includes('读取失败'));assert.equal(writes,0);
}
{
 const type='mod:retained_health',meta={bucket_entity:type},writes=[];
 c.Reg.eschema[type]={id:type,available:true,flags:[{id:'health',min:0,max:6}]};
 const control=c.bucketHealthControl(meta,999,v=>writes.push(v)),input=control.querySelector('input');
 assert(control.textContent.includes('999 → 6'));
 assert(!control.textContent.includes('当前输入未写回'),'retained raw is already in the document, not an uncommitted edit');
 input.fire('change');assert.equal(writes.length,0);
 input.value='2';input.fire('input');input.fire('change');assert.equal(writes.length,1);
 input.value='999';input.fire('input');input.fire('change');
 assert(control.textContent.includes('999 → 6'));assert.equal(writes.length,2);assert.equal(Number(writes[1]),999);
}
console.log('PASS bucket identity/default route, native fields and ranges, terminal errors, retained raw vs rejected new edits, and schema recovery');
