const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const field = (c, value, key) => c.nbtPrint(c.nbtParse(c.nbtMerge(value,null)).map[key],false);
const sample = '{small:2s,precise:9007199254740993L,f:3.0f,a:[L;9007199254740995L],"__proto__":{b:1b}}';
function preserves(c, value) {
  const want=c.parseSnbt(sample);
  for(const key of Object.keys(want)) assert.equal(field(c,value,key),field(c,want,key),key+' keeps its own type and value');
}
// A numeric value object carries type/precision. It must not pass validation
// for an NBT compound merely because JavaScript typeof returns "object".
{
  const {c}=H.create();
  for(const text of ['2s','9007199254740993L','3.5f']) assert.throws(()=>c.worldCompound(c.parseSnbtUser(text)),/复合数据/);
  c.worldCompound(c.parseSnbtUser(sample));
}
// Vault entity -> world: invoke the actual form's application callback.
{
  const {c}=H.create();let header;
  c.esEntityHeader=o=>{header=o;return c.h('div');};c.esPanel=()=>c.h('div');
  c.weMarkDirty=()=>{};c.weHeroLive=()=>{};c.weRedrawBody=()=>{};
  c.WE.w={kind:'entity',type:'minecraft:bee',snbt:'{id:"minecraft:bee",small:1b}'};
  c.WE.text=c.WE.w.snbt;c.WE.obj=null;c.weEntityTab(c.h('div'));
  header.onApplyVault(sample);
  preserves(c,c.parseSnbt(c.WE.text));
}
// Spawn egg's "other fields" panel separates schema-owned fields and later
// merges them back. Both sides must carry type metadata across that split.
{
  const {c}=H.create();let value=c.parseSnbt('{Health:20.0f,'+sample.slice(1)),rest,commit;
  c.eggCur=()=> 'minecraft:bee';c.eggData=()=>c.clone(value);c.eggWrite=x=>{value=x;};
  c.eggCard=()=>({body:c.h('div')});c.esOwnedKeys=()=>({Health:1});
  c.worldMap=(v,set)=>{rest=v;commit=set;return c.h('div');};
  c.CARDS.eggData();preserves(c,rest);
  c.nbtPut(rest,'added',c.parseSnbtUser('7L'));commit(rest);
  preserves(c,value);assert.equal(field(c,value,'Health'),'20.0f');assert.equal(field(c,value,'added'),'7L');
}
// Changing the entity selector after importing a bee used to strip the new
// entity_data owner and fall back to the OLD list's scalar types.
{
  const {c}=H.create();let header;
  c.esEntityHeader=o=>{header=o;return c.h('div');};
  c.xRow=o=>{if(o.body)o.body();return c.h('div');};c.weRender=()=>{};c.weMarkDirty=()=>{};
  const text='{bees:[{entity_data:{id:"minecraft:bee",small:1b},ticks_in_hive:0,min_ticks_in_hive:600}]}';
  c.WE.w={kind:'block',views:{beehive:{value:JSON.parse(JSON.stringify(c.parseSnbt(text))),snbt:text,schema:{fields:{bees:{wire_snbt:true,vanilla_max_occupants:3}}}}}};
  c.WE.views={};c.WEV.beehive(c.h('div'),'beehive');header.onEntityNbt(sample);
  c.WEV.beehive(c.h('div'),'beehive');header.onPick('minecraft:bee');
  const msg={};c.weViewsMsg(msg);
  const sent=c.parseSnbt(msg.views_snbt.beehive.bees);
  preserves(c,sent[0].entity_data);
}
console.log('PASS NBT transfer entries: scalar validation, vault world apply, spawn egg field split/merge, bee import then selection and views_snbt submission');
