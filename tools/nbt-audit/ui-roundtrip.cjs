// Run production UI code. FAIL means an unfixed fidelity defect, not a passing
// assertion about faulty behavior. This does not start Minecraft.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { isDeepStrictEqual } = require('node:util');
const H = require('../lib/ui-harness.cjs');
const registryExamples = JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/entity-schema-examples-26.1.2.json'),'utf8'));
const out = path.resolve(process.argv[2] || 'reports/nbt-audit');
fs.mkdirSync(out, { recursive: true });
const cases = [];
function audit(id, entry, code, expected) {
  const h = H.create();
  h.c.auditSchemas = registryExamples;
  let actual, status, error;
  try { actual = JSON.parse(JSON.stringify(vm.runInContext(code, h.c))); status = isDeepStrictEqual(actual, expected) ? 'PASS' : 'FAIL'; }
  catch (e) { status = 'HARNESS_ERROR'; error = e.stack; }
  cases.push({ id, entry, status, expected, actual, error });
}
const doc = 'makeDoc({key:"audit",id:"minecraft:stone",comps:{custom_data:{x:1}},removed:{},snbt:{custom_data:"{x:1b}"}})';
audit('01-baseline-types', 'nbtMerge unchanged', 'var s="{b:1b,s:2s,i:3,l:9007199254740993L,f:4.0f,d:5.0d,ba:[B;1b],ia:[I;2],la:[L;3L]}"; nbtMerge(parseSnbt(s),nbtParse(s))', '{b:1b,s:2s,i:3,l:9007199254740993L,f:4.0f,d:5.0d,ba:[B;1b],ia:[I;2],la:[L;3L]}');
audit('02-cross-field-type', 'parseSnbtUser -> NBT_SEEN -> nbtMerge', 'parseSnbtUser("{other:1b}"); nbtMerge({Health:1},nbtParse("{Health:2f}"))', '{Health:1f}');
audit('03-same-number-new-type', 'raw input changes 1b to 1s', 'var v=parseSnbtUser("{x:1s}"); nbtMerge(v,nbtParse("{x:1b}"))', '{x:1s}');
audit('04-vault-identical-json', 'vaultNested -> container children -> nbtMerge', 'var a=vaultNested({id:"minecraft:stone",count:1,comps:{custom_data:{x:1}},component_snbt:{custom_data:"{x:1b}"}}); var b=vaultNested({id:"minecraft:stone",count:1,comps:{custom_data:{x:1}},component_snbt:{custom_data:"{x:1s}"}}); nbtMerge([a,b],null)', '[{id:"minecraft:stone",count:1,components:{"minecraft:custom_data":{x:1b}}},{id:"minecraft:stone",count:1,components:{"minecraft:custom_data":{x:1s}}}]');
audit('05-cache-eviction', 'nbtNote 300-node reset', 'var first=parseSnbtUser("{first:1s}"); for(var i=2;i<330;i++)parseSnbtUser("{x:"+i+"L}"); nbtMerge(first,null)', '{first:1s}');
audit('06-type-only-dirty', 'Store.set / snapOf / history', 'Store.open({key:"a",id:"minecraft:stone",comps:{custom_data:{x:1}},snbt:{custom_data:"{x:1b}"}},true); var d=Store.doc(); Store.set("custom_data",parseSnbtUser("{x:1s}")); ({dirty:snapOf(d)!==d.base,history:d.hist.length,formats:nbtApplyFormats(d).formats})', {dirty:true,history:2,formats:{custom_data:'snbt'}});
audit('07-copy-component', 'Store.copyComp source typed sidecar', 'Store.open({key:"a",id:"minecraft:stone",comps:{custom_data:{x:1}},snbt:{custom_data:"{x:1b}"}},true); Store.open({key:"b",id:"minecraft:stone",comps:{custom_data:{x:2}},snbt:{custom_data:"{x:2s}"}},false); Store.copyComp("custom_data",1); nbtApplyFormats(Store.docs[1]).comps.custom_data', '{x:1b}');
audit('08-undo-lost-type', 'Store.undo after later same-value type entry', 'Store.open({key:"a",id:"minecraft:stone",comps:{custom_data:{}},snbt:{custom_data:"{}"}},true); Store.set("custom_data",parseSnbtUser("{x:1s}")); Store.set("custom_data",parseSnbtUser("{x:2b}")); parseSnbtUser("{x:1L}"); Store.undo(); nbtApplyFormats(Store.doc()).comps.custom_data', '{x:1s}');
audit('09-draft-roundtrip', 'Drafts.flush -> persisted v2 JSON -> production restore', 'Store.open({key:"a",id:"minecraft:stone",src:{kind:"inventory",index:0},comps:{custom_data:{}},snbt:{custom_data:"{}"}},true); Store.set("custom_data",parseSnbtUser("{x:1s}")); var packet=null; Drafts.send=function(m){packet=m;}; Drafts.flush(); var dr=JSON.parse(packet.value); nbtSeenClear(); Store.docs.length=0;Store.open({key:"r",id:"minecraft:stone",comps:{custom_data:{}},snbt:{custom_data:"{}"}},true);Drafts.restore(Store.doc(),dr);nbtApplyFormats(Store.doc()).comps.custom_data', '{x:1s}');
audit('10-command-import', 'parseStackString -> new document', 'var p=parseStackString("/give @s stone[custom_data={b:1b,la:[L;9007199254740993L]}]"); nbtMerge(p.comps.custom_data,p.snbt&&p.snbt.custom_data?nbtParse(p.snbt.custom_data):null)', '{b:1b,la:[L;9007199254740993L]}');
audit('11-command-export', 'stackString ignores d.snbt', 'var d='+doc+'; stackString(d)', 'minecraft:stone[custom_data={x:1b}]');
audit('12-snbt-export', 'stackSnbt advanced editor / clipboard', 'var d='+doc+'; nbtPrint(nbtParse(stackSnbt(d)).map.components.map["minecraft:custom_data"],false)', '{x:1b}');
audit('13-preview-types', 'stackCompsSnbt preview', 'var d='+doc+'; stackCompsSnbt(d)', '{"minecraft:custom_data":{x:1b}}');
audit('14-mod-component-namespace', 'stackNbt / stackSnbt / preview add minecraft unconditionally', 'var d=makeDoc({id:"minecraft:stone",comps:{"example:data":{x:1}}}); Object.keys(stackNbt(d).components)', ['example:data']);
audit('15-raw-widget-initial-text', 'kSnbtEditor starts with lossy display', 'var v=parseSnbtUser("{x:1b,a:[I;2]}"); var el=kSnbtEditor(v,function(){}); nbtPrint(nbtParse(el.querySelector("textarea").value),false)', '{x:1b,a:[I;2]}');
audit('16-long-list-reorder', 'nbtMerge list refs bound to old index', 'var s=\'{items:[{id:"a",value:9007199254740993L},{id:"b",value:9007199254740992L}]}\';var v=parseSnbt(s);v.items.reverse(); nbtMerge(v,nbtParse(s))', '{items:[{id:"b",value:9007199254740992L},{id:"a",value:9007199254740993L}]}');
audit('17-string-carriage-return', 'parseSnbtUser uses different parser than nbtNote', 'parseSnbtUser('+JSON.stringify('{s:"a\\rb"}')+').s', 'a\rb');
audit('18-byte-only-mod-data', 'nbtApplyFormats ignores byte-only unknown component', 'var d=makeDoc({id:"minecraft:stone",comps:{"example:data":{x:1}},snbt:{"example:data":"{x:1b}"}});d.comps["example:data"].x=2;nbtApplyFormats(d)', {comps:{'example:data':'{x:2b}'},formats:{'example:data':'snbt'}});
audit('19-bad-sidecar-fallback', 'nbtApplyFormats silently reverts raw data to JSON', 'var d='+doc+';d.snbt.custom_data="{broken";d.comps.custom_data.x=2; var rejected=false;try{var r=nbtApplyFormats(d);rejected=!!r.error;}catch(e){rejected=true;} rejected', true);
audit('20-vault-passenger-preservation', 'vaultEntityPayload typed AST (recent fix)', 'vaultEntityPayload(\'{id:"minecraft:pig",Invulnerable:1b,Health:20.0f,token:9007199254740993L,a:[I;1,2]}\')', {type:'minecraft:pig',snbt:'{Invulnerable:1b,Health:20.0f,token:9007199254740993L,a:[I;1,2]}'});
audit('21-pure-raw-world', 'nbtParse -> nbtPrint no JSON conversion', 'nbtPrint(nbtParse("{b:1b,a:[B;1b],x:9007199254740993L}"),false)', '{b:1b,a:[B;1b],x:9007199254740993L}');
const app=fs.readFileSync(path.resolve(__dirname,'../../common/src/main/resources/assets/cadeditor/ui/js/app.js'),'utf8');
const receive=app.substring(app.indexOf('function receiveEditorResult('),app.indexOf('/* 独立保险库'));
audit('22-stale-saved-clears-types', 'receiveEditorResult clears before request ID check', receive+'\nvar EditorBridge={pending:{id:"current"}};var v=parseSnbtUser("{x:1s}");NBT_FORCE.bundle_contents=1;receiveEditorResult({requestId:"stale",status:"saved"});({text:nbtMerge(v,null),forced:!!NBT_FORCE.bundle_contents,pending:EditorBridge.pending.id})', {text:'{x:1s}',forced:true,pending:'current'});
audit('23-command-namespaced-component', 'parseStackString exported full component ID', 'var error=null,keys=null;try{keys=Object.keys(parseStackString("stone[minecraft:custom_data={x:1b}]").comps);}catch(e){error=e.message;} ({error,keys})', {error:null,keys:['custom_data']});
audit('24-default-field-picker', 'suggestEntityFields discards default_nbt types', 'Reg.entityInfo=function(){return {template_available:true,default_nbt:"{Health:20.0f}"};}; var result;pickFrom=function(anchor,entries,cb){cb(entries[0]);};suggestEntityFields("minecraft:pig",function(){return false;},function(k,v){result={};result[k]=v;},null);nbtMerge(result,null)', '{Health:20.0f}');
audit('25-new-health-control', 'esFlagRow actual Health input with absent original field', 'var s=auditSchemas.cat.entries?auditSchemas.cat.entries[0]:auditSchemas.cat;var data={};var row=esFlagRow(s.flags.filter(function(f){return f.key==="Health";})[0],{get:function(){return data;}},function(fn){fn(data);});var input=row.querySelector(".k-numin");input.value="10";input.fire("input");input.fire("change");nbtMerge(data,null)', '{Health:10f}');
audit('26-gear-new-show-arms', 'esGearGrid real registry fixture -> auto ShowArms -> actual owner serialization', 'var s=auditSchemas.armor_stand.entries?auditSchemas.armor_stand.entries[0]:auditSchemas.armor_stand;var data={};pickItem=function(a,fn){fn("diamond_sword");};var panel=esGearGrid(s,{get:function(){return data;},set:function(v){data=v;}},s.id);var slot=panel.querySelectorAll(".es-slot").filter(function(e){return (e.getAttribute("data-tip")||"").indexOf("主手：")===0;})[0];slot.fire("click");"{ShowArms:"+nbtPrint(nbtParse(nbtMerge(data,null)).map.ShowArms,false)+"}"', '{ShowArms:1b}');
audit('27-new-attribute-base', 'esAttrSet without old attribute reference', 'var s=auditSchemas.zombie.entries?auditSchemas.zombie.entries[0]:auditSchemas.zombie;var data={};esAttrSet(data,s.attributes.filter(function(a){return a.id==="minecraft:scale";})[0],2);nbtMerge(data,null)', '{attributes:[{id:"minecraft:scale",base:2d}]}');
audit('28-compound-proto-key', 'parseSnbtUser ordinary JS object map drops legal NBT key', 'var text='+JSON.stringify('{"__proto__":{x:1},ok:2}')+';Object.keys(parseSnbtUser(text)).sort()', ['__proto__','ok']);
// TAG_End is a binary container terminator, not an editable standalone value.
const types={byte:'1b',short:'2s',int:'3',long:'9007199254740993L',float:'4.0f',double:'5.0d',byte_array:'[B;1b,2b]',string:'"text"',list:'[{v:1b}]',compound:'{n:2s}',int_array:'[I;1,2]',long_array:'[L;9007199254740993L]'};
for(const [type,value] of Object.entries(types)) {
  const source='{x:'+value+'}',s=JSON.stringify(source);
  const init='var src='+s+';var d=makeDoc({key:"matrix",id:"minecraft:stone",comps:{custom_data:parseSnbt(src)},snbt:{custom_data:src}});';
  const paths={
    ast:'nbtPrint(nbtParse('+s+'),false)',
    baseline:init+'nbtMerge(d.comps.custom_data,nbtParse(src))',
    import:'var p=parseStackString('+JSON.stringify('stone[custom_data='+source+']')+');nbtMerge(p.comps.custom_data,null)',
    export:init+'var text=stackString(d);text.substring(text.indexOf("custom_data=")+12,text.length-1)',
    copy:'Store.open({key:"s",id:"minecraft:stone",comps:{custom_data:parseSnbt('+s+')},snbt:{custom_data:'+s+'}},true);Store.open({key:"t",id:"minecraft:stone",comps:{},snbt:{}},false);Store.copyComp("custom_data",1);nbtApplyFormats(Store.docs[1]).comps.custom_data',
    vault:init+'var nested=vaultNested({id:d.id,count:1,comps:d.comps,component_snbt:d.snbt});nbtMerge(nested.components["minecraft:custom_data"],null)',
    draft:'Store.open({key:"s",id:"minecraft:stone",src:{kind:"inventory",index:0},comps:{custom_data:{}},snbt:{custom_data:"{}"}},true);Store.set("custom_data",parseSnbtUser('+s+'));var packet;Drafts.send=function(m){packet=m;};Drafts.flush();var dr=JSON.parse(packet.value);nbtSeenClear();Store.docs.length=0;Store.open({id:"minecraft:stone",comps:{custom_data:{}},snbt:{custom_data:"{}"}},true);Drafts.restore(Store.doc(),dr);nbtApplyFormats(Store.doc()).comps.custom_data'
  };
  for(const [route,code] of Object.entries(paths)) audit('matrix-'+type+'-'+route,route+' / '+type,code,source);
}
const counts = Object.fromEntries(['PASS','FAIL','HARNESS_ERROR'].map(s => [s,cases.filter(x=>x.status===s).length]));
const report = { scope:'production UI source in Node VM, not LAN/gameplay', timestamp:new Date().toISOString(), counts, cases };
fs.writeFileSync(path.join(out,'ui-roundtrip.json'),JSON.stringify(report,null,2)+'\n');
for (const c of cases) console.log(c.status+' '+c.id+': expected='+JSON.stringify(c.expected)+' actual='+JSON.stringify(c.actual)+(c.error?' error='+c.error:''));
console.log(JSON.stringify(counts));
process.exitCode = counts.FAIL || counts.HARNESS_ERROR ? 1 : 0;
