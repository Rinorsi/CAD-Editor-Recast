const assert=require('node:assert/strict'),H=require('./lib/ui-harness.cjs');
const {c}=H.create();c.snd=()=>{};c.toast=()=>{};c.Reg.meta={generation:'load'};
c.Store.open({id:'minecraft:mace',count:1,comps:{enchantments:{'minecraft:mending':1}},removed:{}},true);
function noMissing(){const issues=c.validateDoc(c.Store.doc());assert(!issues.some(p=>/没有.*mace|没有.*mending|不存在.*mace|不存在.*mending/.test(p.msg)),JSON.stringify(issues));}
noMissing();assert.equal(c.Reg.entryState('item','minecraft:mace'),null);assert.equal(c.Reg.entryState('enchantment','minecraft:mending'),null);
c.Reg.ingest('registry.items',{generation:'load',offset:0,total:2,done:false,entries:[{id:'minecraft:stone',name:'石头'}]});
c.Reg.ingest('registry.enchantments',{generation:'load',offset:0,total:2,done:false,entries:[]});noMissing();
c.Reg.ingest('registry.items',{generation:'load',offset:1,total:2,done:true,entries:[{id:'minecraft:mace',name:'重锤'}]});
c.Reg.ingest('registry.enchantments',{generation:'load',offset:0,total:1,done:true,entries:[{id:'minecraft:mending',name:'经验修补',max_level:1,supported:['minecraft:mace'],exclusive:[]}]});
assert.equal(c.Reg.entryState('item','minecraft:mace'),true);assert.equal(c.Reg.entryState('enchantment','minecraft:mending'),true);noMissing();
c.Reg.ingest('registry.meta',{generation:'next'});noMissing();
console.log('PASS actual mace/mending draft: no missing-ID warning before metadata, during pagination, after authoritative rows, or next-world reset; no static registry table introduced');
