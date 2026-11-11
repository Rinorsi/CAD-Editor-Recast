import {readFileSync,writeFileSync,appendFileSync,renameSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const [out,mode]=process.argv.slice(2),delay=ms=>new Promise(r=>setTimeout(r,ms));
let seq=0;
export async function request(role,action,params={},timeout=20000){
 const run=join(out,role),id=String(++seq)+'-'+Date.now();
 writeFileSync(join(run,'request.tmp'),JSON.stringify({id,action,...params}));
 for(let retry=0;;retry++){
  try{renameSync(join(run,'request.tmp'),join(run,'request.json'));break;}
  catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||retry===100)throw e;await delay(20);}
 }
 const end=Date.now()+timeout;
 while(Date.now()<end){
  if(existsSync(join(run,'crash-reports'))&&readdirSync(join(run,'crash-reports')).length)throw Error(role+' initialization crash; see crash-reports');
  await delay(100);let r;
  try{r=JSON.parse(readFileSync(join(run,'response.json'),'utf8'));}catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)continue;throw e;}
  if(r.id!==id)continue;
  appendFileSync(join(out,'requests.jsonl'),JSON.stringify({role,action,params,result:r})+String.fromCharCode(10));
  if(r.error)throw Error(r.error);
  assert.equal(r.visible,0,'window must stay hidden');assert.equal(r.focused,0,'window must stay unfocused');
  return r;
 }
 throw Error(role+' '+action+' timeout');
}
async function waitConnected(role){
 const end=Date.now()+240000;
 while(Date.now()<end){try{const r=await request(role,'state',{},10000);if(r.connected)return r;if(r.disconnectReason)throw Error(role+' disconnected: '+r.disconnectReason);}catch(e){if(!e.message.includes('timeout'))throw e;}await delay(1000);}
 throw Error(role+' connection timeout');
}
try{
 if(mode==='host-ready'){
  await waitConnected('host');
  const mods=JSON.parse(readFileSync(join(out,'host/mods.json'),'utf8'));
  assert(!mods.some(m=>['cadeditor','editor','oriel'].includes(m.id)),'host has tested mods');
  const pub=await request('host','publish',{port:25781});assert(pub.published);
  writeFileSync(join(out,'host-ready.json'),JSON.stringify(pub,null,2));
 }else{
  const client=await waitConnected('joiner'),host=await request('host','state');
  const observer=await waitConnected('observer');assert.equal(observer.gamemaster,false);
  const observerMods=JSON.parse(readFileSync(join(out,'observer/mods.json'),'utf8'));assert(!observerMods.some(m=>['cadeditor','editor','oriel'].includes(m.id)));
  assert.equal(client.integrated,false);assert.equal(host.integrated,true);
  assert(host.serverPlayers.some(p=>p.uuid===client.uuid),'real network join must appear on host');
  const mods=JSON.parse(readFileSync(join(out,'joiner/mods.json'),'utf8'));
  assert(mods.some(m=>m.id==='cadeditor'||m.id==='editor'));assert(mods.some(m=>m.id==='oriel'));
  const result={status:'LAN_CONNECTED',version:'26.1.2',loader:'Fabric',port:25781,host,client,observer,observerMods,joinerMods:mods};
  writeFileSync(join(out,'lan.json'),JSON.stringify(result,null,2));
  await request('host','screenshot',{name:'lan-host.png'});await request('joiner','screenshot',{name:'lan-joiner.png'});
  if(['full','extra','notice','inventory','creative','self','expanded','next'].includes(mode))await import('./scenarios.mjs').then(m=>m.run({out,request,delay,scope:mode,casePattern:existsSync(join(out,'configuration.json'))?JSON.parse(readFileSync(join(out,'configuration.json'),'utf8')).casePattern:null}));
  await delay(2000);
  await request('observer','stop');await request('joiner','stop');await request('host','stop');
 }
}catch(e){writeFileSync(join(out,'driver-error.txt'),e.stack);console.error(e.stack);process.exitCode=1;}
