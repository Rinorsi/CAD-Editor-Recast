const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
let count = 0;
function test(name, fn) { fn(); console.log('PASS ' + name); count++; }
const keys = ['entity_info','entity_info:custom:one','entity_schema','entity_schema:custom:one','entity_base_attributes','equipment_slot_groups','spawner_info'];
const meta = generation => ({generation,entity_world_scope:true});
const packet = (key, worldGeneration, entries=[{id:'custom:one',available:true,attributes:{'custom:energy':7}}]) => ({name:key,generation:key.startsWith('entity_schema')?'entity-schema-17':'entity-51',worldGeneration,id:'custom:one',offset:0,total:entries.length,entries,done:true});
test('legacy root-bag counterexample remains reproducible without scope capability',()=>{
 const {c}=H.create();c.oriel.data={'registry.entity_schema':{generation:'entity-schema-1',entries:[{id:'custom:old',available:true}],done:true},'registry.meta':{generation:'2'}};c.Reg.attach();
 assert(c.Reg.eschema['custom:old'],'control must preserve the old protocol counterexample, not relabel it safe');
});
test('modern root meta precedes retained scoped and missing-scope entity facts',()=>{
 for(const scoped of [false,true]){const {c}=H.create(),p=packet('entity_schema','1');if(!scoped)delete p.worldGeneration;
  c.oriel.data={'registry.entity_schema':p,'registry.meta':meta('2')};c.Reg.attach();assert.equal(c.Reg.eschema['custom:one'],undefined);assert.equal(c.Reg.meta.generation,'2');
 }
});
test('all seven response names reject missing/stale scopes including errors',()=>{
 const {c}=H.create();c.Reg.ingest('registry.meta',meta('2'));
 for(const key of keys)for(const old of [undefined,'1']){const p=packet(key,old);if(old===undefined)delete p.worldGeneration;p.error='stale failure';
  assert.equal(c.Reg.acceptsGeneration('registry.'+key,p),false,key);c.Reg.ingest('registry.'+key,p);
 }
 assert.equal(Object.keys(c.Reg.einfo).length,0);assert.equal(Object.keys(c.Reg.eschema).length,0);assert.equal(Object.keys(c.Reg.ebase).length,0);assert.equal(c.Reg.kinds.spawner_info,undefined);assert.equal(c.Reg.kinds.equipment_slot_groups,undefined);
});
test('current scoped entity counters and complete pagination stay usable',()=>{
 for(const key of keys){const {c}=H.create();c.Reg.ingest('registry.meta',meta('9007199254740993'));
  for(let offset=0;offset<2;offset++){const p=packet(key,'9007199254740993',[{id:'custom:page_'+offset,available:true,attributes:{'custom:energy':offset+7},marker:'field retained'}]);p.offset=offset;p.total=2;p.done=offset===1;assert(c.Reg.acceptsGeneration('registry.'+key,p));c.Reg.ingest('registry.'+key,p);}
  const cache=key.startsWith('entity_info')?c.Reg.einfo:key.startsWith('entity_schema')?c.Reg.eschema:key==='entity_base_attributes'?c.Reg.ebase:null;
  if(cache){assert(cache['custom:page_0']);assert(cache['custom:page_1']);}
  else{const table=c.Reg.kinds[key];assert(table.done);assert.equal(table.entries.length,2);assert.equal(table.entries[1].marker,'field retained');}
 }
});
test('new epoch invalidates entity caches then accepts fresh replies',()=>{
 const {c}=H.create();c.Reg.ingest('registry.meta',meta('1'));for(const key of keys)c.Reg.ingest('registry.'+key,packet(key,'1'));
 c.Reg.ingest('registry.meta',meta('2'));for(const key of keys)c.Reg.ingest('registry.'+key,packet(key,'1'));
 assert.equal(c.Reg.einfo['custom:one'],undefined);assert.equal(c.Reg.ebase['custom:one'],undefined);assert.equal(c.Reg.eschema['custom:one'],undefined);assert.equal(c.Reg.kinds.spawner_info,undefined);
 c.Reg.ingest('registry.entity_info',packet('entity_info','2'));assert.equal(c.Reg.entityInfo('custom:one').attributes['custom:energy'],7);
});
test('first meta and same-world scope upgrade clear previously accepted unscoped facts',()=>{
 for(const initial of [null,{generation:'2'}]){const {c}=H.create();c.Reg.meta=initial;for(const key of keys){const p=packet(key,'2');delete p.worldGeneration;c.Reg.ingest('registry.'+key,p);}
  assert(c.Reg.einfo['custom:one']);c.Reg.ingest('registry.meta',meta('2'));assert.equal(c.Reg.einfo['custom:one'],undefined);assert.equal(c.Reg.ebase['custom:one'],undefined);assert.equal(c.Reg.kinds.equipment_slot_groups,undefined);
 }
});
test('same-epoch capability upgrade re-requests invalidated entity tables and accepts fresh facts',()=>{
 for(const name of ['equipment_slot_groups','spawner_info']){const {c,sent}=H.create();
  c.Reg.ingest('registry.meta',{generation:'2'});c.Reg.table(name);
  c.Reg.ingest('registry.'+name,{generation:'entity-1',entries:[{id:'custom:old'}],done:true});
  assert.equal(c.Reg.table(name)[0].id,'custom:old');
  c.Reg.ingest('registry.meta',meta('2'));
  const requests=()=>sent.filter(x=>x[0]==='registry'&&x[1].name===name).length;
  const before=requests();assert.equal(c.Reg.table(name),null);assert.equal(requests(),before+1);
  c.Reg.table(name);assert.equal(requests(),before+1,'pending request stays deduplicated');
  c.Reg.ingest('registry.'+name,packet(name,'2',[{id:'custom:fresh'}]));
  assert.equal(c.Reg.table(name)[0].id,'custom:fresh');
 }
});

test('old and preview hosts retain entity compatibility while independent counters are not compared to world epochs',()=>{
 const {c}=H.create();c.Reg.ingest('registry.meta',{generation:'2'});for(const key of keys){const p=packet(key,'2');delete p.worldGeneration;assert(c.Reg.acceptsGeneration('registry.'+key,p));}
 c.Reg.ingest('registry.translate',{generation:'translate-1',map:{x:'y'}});
});
console.log('entity scope UI: '+count+' passed; original unscoped protocol counterexample is a retained control, not a security PASS');
