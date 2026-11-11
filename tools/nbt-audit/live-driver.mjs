import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,appendFileSync,renameSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {run} from './live-scenarios.mjs';
const [out,mode]=process.argv.slice(2),config=JSON.parse(readFileSync(join(out,'configuration.json'),'utf8'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));let sequence=0;
async function request(role,action,params={},timeout=20000){
 const dir=join(out,role),id='backend-'+(++sequence)+'-'+Date.now();writeFileSync(join(dir,'request.tmp'),JSON.stringify({id,action,...params}));
 for(let n=0;;n++){try{renameSync(join(dir,'request.tmp'),join(dir,'request.json'));break;}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||n===100)throw e;await delay(20);}}
 const end=Date.now()+timeout;while(Date.now()<end){
  if(existsSync(join(dir,'crash-reports'))&&readdirSync(join(dir,'crash-reports')).length)throw Error(role+' initialization crash');
  await delay(100);let r;try{r=JSON.parse(readFileSync(join(dir,'response.json'),'utf8'));}catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)continue;throw e;}if(r.id!==id)continue;
  appendFileSync(join(out,'requests.jsonl'),JSON.stringify({role,action,params,result:r})+String.fromCharCode(10));if(r.error)throw Error(r.error);assert.equal(r.visible,0);assert.equal(r.focused,0);return r;
 }throw Error(role+' '+action+' timeout');
}
async function connected(role){const end=Date.now()+240000;while(Date.now()<end){try{const r=await request(role,'state',{},10000);if(r.connected)return r;if(role==='host'&&r.screen==='net.minecraft.client.gui.screens.BackupConfirmScreen'){await request(role,'ownedBackupProceed');}if(r.disconnectReason)throw Error(role+' disconnected '+r.disconnectReason);}catch(e){if(!e.message.includes('timeout'))throw e;}await delay(1000);}throw Error(role+' connection timeout');}
function installed(role){const mods=JSON.parse(readFileSync(join(out,role,'mods.json'),'utf8')),jars=JSON.parse(readFileSync(join(out,role,'installed-jars.json'),'utf8'));assert(mods.some(m=>m.id==='cadeditor'||m.id==='editor'));assert(mods.some(m=>m.id==='oriel'));assert(jars.some(j=>j.sha256===config.sha256));return {mods,jars};}
try{
 const host=await connected('host'),hostInstalled=installed('host');assert(host.integrated);
 if(mode==='host-ready'){const pub=await request('host','publish',{port:config.port});assert(pub.published);writeFileSync(join(out,'host-ready.json'),JSON.stringify(pub,null,2));}
 else{
  let joiner,observer,joinerInstalled;
  if(mode==='backend-dual'){
   joiner=await connected('joiner');try{observer=await connected('observer');assert.equal(observer.gamemaster,false);}catch(e){if(!e.message.includes('注册表'))throw e;observer={connected:false,registryRefusal:e.message};writeFileSync(join(out,'observer-registry-refusal.json'),JSON.stringify(observer,null,2));}joinerInstalled=installed('joiner');assert.equal(joiner.integrated,false);
   const actualHost=await request('host','state');assert(actualHost.serverPlayers.some(p=>p.uuid===joiner.uuid));const ordinaryMods=JSON.parse(readFileSync(join(out,'observer','mods.json'),'utf8'));assert(!ordinaryMods.some(m=>['cadeditor','editor'].includes(m.id)));assert(ordinaryMods.some(m=>m.id==='oriel'&&m.version===hostInstalled.mods.find(x=>x.id==='oriel').version),'full backend observer requires matching Oriel registry dependency');observer={...observer,mods:ordinaryMods,boundary:'matching Oriel required; no Editor installed'};
  }
  writeFileSync(join(out,'backend-environment.json'),JSON.stringify({mode,config,host,hostInstalled,joiner,joinerInstalled,observer},null,2));
  if(config.registryLive){
   const {runRegistryLive}=await import('./registry-live.mjs');
   await runRegistryLive({out,config,request,delay});
  }else if(config.diagnosticsDebug){
   const {runDiagnosticsDebug}=await import('./diagnostics-debug.mjs');
   await runDiagnosticsDebug({out,config,request,delay});
  }else if(config.layoutDebug){
   const {runLayoutDebug}=await import('./layout-debug.mjs');
   await runLayoutDebug({out,config,request,delay});
  }else if(config.vaultSelfDebug){
   const {runVaultSelfDebug}=await import('./vault-self-debug.mjs');
   await runVaultSelfDebug({out,request,delay});
  }else if(config.playerActionsDebug){
   const {runPlayerActionsDebug}=await import('./player-actions-debug.mjs');
   await runPlayerActionsDebug({out,mode,request,delay});
  }else await run({out,mode,request,delay});
  if(config.devSourceRoot&&!config.layoutDebug){
   const {verifySourceReload}=await import('./hot-reload.mjs');
   await verifySourceReload({out,root:config.devSourceRoot,request,delay});
  }
  if(mode==='backend-dual'){await request('observer','stop');await request('joiner','stop');}await request('host','stop');
 }
}catch(e){writeFileSync(join(out,'backend-driver-error.txt'),e.stack);console.error(e.stack);process.exitCode=1;}
