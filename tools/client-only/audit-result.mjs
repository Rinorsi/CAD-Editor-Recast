import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const [evidence,expectedHash]=process.argv.slice(2),root=resolve(evidence),read=name=>JSON.parse(readFileSync(join(root,name),'utf8'));
assert(expectedHash,'explicit Lead production SHA256 required');
const result=read('expanded-result.json'),lan=read('lan.json'),cleanup=read('cleanup.json');assert.equal(result.status,'PASS');assert(result.results.length>=23);assert(result.results.every(r=>r.status==='PASS'));assert.deepEqual(cleanup.remaining,[]);
const installations={};
for(const role of ['host','joiner','observer']){
 const mods=read(role+'/mods.json'),jars=read(role+'/installed-jars.json'),hasEditor=mods.some(m=>['cadeditor','editor'].includes(m.id)),hasOriel=mods.some(m=>m.id==='oriel');
 assert.equal(hasEditor,role==='joiner');assert.equal(hasOriel,role==='joiner');
 if(role==='joiner')assert.equal(jars.find(j=>j.name.startsWith('cadeditor-')).sha256.toUpperCase(),expectedHash.toUpperCase());
 else assert(!readFileSync(join(root,role,'java.args'),'utf8').split(/\r?\n/).some(line=>/(?:cadeditor|oriel)[^;"\r\n]*\.jar/i.test(line)),'host/observer classpath must exclude tested mod jars');
 for(const jar of jars)assert.equal(createHash('sha256').update(readFileSync(jar.path)).digest('hex').toUpperCase(),jar.sha256.toUpperCase(),'installed jar hash changed');
 installations[role]={mods,jars};
}
assert.equal(lan.client.integrated,false);assert.equal(lan.host.integrated,true);assert.equal(lan.observer.gamemaster,false);assert(lan.host.serverPlayers.some(p=>p.uuid===lan.client.uuid));
const requests=readFileSync(join(root,'requests.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse);
for(const r of requests){assert(!r.result.error);assert.equal(r.result.visible,0);assert.equal(r.result.focused,0);assert(!(r.role==='joiner'&&r.action==='command'),'tested writes must use production page/networking');}
const screens=Object.fromEntries(['host','joiner','observer'].map(role=>[role,readdirSync(join(root,role,'screenshots')).filter(n=>n.endsWith('.png')).map(n=>join(root,role,'screenshots',n))]));
const audit={status:'PASS',scope:result.scope,productionSha256:expectedHash.toUpperCase(),version:lan.version,loader:lan.loader,port:lan.port,uuids:{host:lan.host.uuid,joiner:lan.client.uuid,observer:lan.observer.uuid},scenarios:result.results.map(r=>({name:r.name,status:r.status})),installations,requests:requests.length,allRequestsHiddenUnfocused:true,cleanup,screenshots:screens,visualReview:'See separate visual-review.md; file existence is not visual acceptance'};
writeFileSync(join(root,'independent-audit.json'),JSON.stringify(audit,null,2));console.log('audit-result PASS '+join(root,'independent-audit.json')+' '+result.results.length+' scenarios, '+requests.length+' RPCs');
