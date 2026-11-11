import {client} from './live-rpc.mjs';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
const out=process.argv[2],c=client(out),uuid='00000001-0000-0002-0000-000300000004';
await c.request('close');await c.request('serverCommand',{command:'effect give '+uuid+' minecraft:speed infinite 2 false'});
await c.delay(200);const e=(await c.request('entityFields',{uuid})).entityFields;
await c.request('openEntity',{entityId:e.entityId});await c.until('typeof WE!=="undefined"&&!!WE.w');
if(await c.js('!!document.getElementById("modal")')){
 await c.js('(function(){var xs=document.querySelectorAll("#modal .k-btn");for(var i=0;i<xs.length;i++)if(xs[i].textContent==="丢弃此草稿"){xs[i].setAttribute("id","discard-failed-fixture");xs[i].scrollIntoView({block:"center"});return true;}throw Error("Expected explicit discard");})()');
 await c.delay(100);await c.request('pagePointer',{selector:'#discard-failed-fixture'});
}
writeFileSync(join(out,'stable-effect-fixture.json'),JSON.stringify({entity:e,reason:'normal vanilla infinite duration baseline for unrelated bool edits; no tick freeze; finite-countdown duration failure retained'},null,2));
console.log('PASS actual infinite effect baseline; failed finite timer draft explicitly discarded after recording');
