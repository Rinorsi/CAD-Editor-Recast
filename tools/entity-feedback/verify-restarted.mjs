import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {client} from './live-rpc.mjs';
const [out]=process.argv.slice(2),c=client(out),expected=JSON.parse(readFileSync(join(out,'restart-expected.json'),'utf8'));
const actual=await c.js('({text:WE.text,dirty:weDirty(),key:WorldDrafts.key(WE.w),slot:WE.w.slot,revision:WE.w.revision,applies:effectsAudit.sent.filter(function(x){return x.channel==="apply";}),conflict:WE.draftConflict})');
writeFileSync(join(out,'restart-live-actual.json'),JSON.stringify(actual,null,2));
assert.equal(actual.key,expected.key);assert.notEqual(actual.slot.token,expected.slot.token);assert.equal(actual.dirty,true);assert.equal(actual.applies.length,0);
// Native AttributeMap serialization can reorder the untouched id-keyed list on JVM restart.
// Compare every typed SNBT token after sorting only this list; nothing else is normalized.
const normalized=await c.js('(function(){function canon(t){var a=nbtParse(t);a.map.attributes.items.sort(function(x,y){return x.map.id.v<y.map.id.v?-1:x.map.id.v>y.map.id.v?1:0;});return nbtPrint(a,true);}return {expected:canon('+JSON.stringify(expected.text)+'),actual:canon(WE.text),typed:nbtPrint(nbtParse(WE.text).map.audit_typed,true)};})()');
writeFileSync(join(out,'restart-typed-comparison.json'),JSON.stringify(normalized,null,2));
assert.equal(normalized.actual,normalized.expected,'Only unchanged attribute list ordering may differ');
for(const token of ['9007199254740993L','[B;','[I;','[L;','9223372036854775807L','2s'])assert(normalized.typed.includes(token));
const host=(await c.request('entityFields',{uuid:expected.uuid})).entityFields;assert(!host.snbt.includes('audit_typed'));assert(!host.snbt.includes('nbt_audit:missing'));
await c.js('(function(){var e=document.querySelector("textarea.kc-ta");if(e)e.scrollIntoView({block:"center"});return true;})()');
await c.request('screenshot',{name:'second-new-jvm-restored-typed.png'});
writeFileSync(join(out,'restart-terminal.json'),JSON.stringify({status:'PASS',startup:3,expectedToken:expected.slot.token,actual,host,typed:normalized.typed,normalization:'untouched attributes id-list ordering only; entire remaining typed SNBT exact',scope:'same canonical gameDir/world; new JVM; old disk packet verified before restore in second-results-02 preconditions; no auto Apply'},null,2));
console.log('PASS same-world-new-jvm-disk-restore; exact typed text except unchanged native attribute order');
await c.request('stop');writeFileSync(join(out,'second.complete'),'completed');
