import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,appendFileSync,renameSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
export function client(out){
 let seq=0;const run=join(out,'host'),delay=ms=>new Promise(r=>setTimeout(r,ms));
 async function request(action,params={},timeout=20000){
  const id='effects-'+Date.now()+'-'+process.pid+'-'+(++seq);writeFileSync(join(run,'request.tmp'),JSON.stringify({id,action,...params}));
  for(let n=0;;n++){try{renameSync(join(run,'request.tmp'),join(run,'request.json'));break;}catch(e){if(!['EPERM','EACCES','EBUSY'].includes(e.code)||n===100)throw e;await delay(20);}}
  const end=Date.now()+timeout;while(Date.now()<end){
   if(existsSync(join(run,'crash-reports'))&&readdirSync(join(run,'crash-reports')).length)throw Error('owned initialization crash');
   const owned=JSON.parse(readFileSync(join(out,'active-process.json'),'utf8'));try{process.kill(owned.pid,0);}catch{throw Error('owned PID exited '+owned.pid);}
   await delay(80);let r;try{r=JSON.parse(readFileSync(join(run,'response.json'),'utf8'));}catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)continue;throw e;}if(r.id!==id)continue;
   appendFileSync(join(out,'requests.jsonl'),JSON.stringify({action,params,result:r})+'\n');if(r.error)throw Error(r.error);assert.equal(r.visible,0);assert.equal(r.focused,0);return r;
  }throw Error(action+' timeout');
 }
 async function connected(){for(let n=0;n<180;n++){
  const r=await request('state',{},12000);if(r.connected)return r;
  if(r.screen==='net.minecraft.client.gui.screens.BackupConfirmScreen')await request('ownedBackupProceed');
  if(r.screen==='net.minecraft.client.gui.screens.ConfirmScreen'){
   const label=(r.screenButtons||[]).find(x=>['继续','确定','是','Proceed','Yes','OK'].includes(x));assert(label,'known owned vanilla confirmation');await request('screenshot',{name:'owned-confirm.png'});await request('ownedConfirmProceed',{label});
  }
  if(r.disconnectReason)throw Error(r.disconnectReason);await delay(500);
 }throw Error('owned world not connected');}
 async function js(code){const r=(await request('eval',{js:'(function(){try{var v=eval('+JSON.stringify(code)+');return {ok:true,value:v===undefined?null:v};}catch(e){return {ok:false,error:String(e),stack:String(e.stack)};}})()'})).value;if(!r.ok)throw Error(r.error+' '+r.stack);return r.value;}
 async function until(code,label=code){for(let n=0;n<100;n++){try{const r=await js(code);if(r)return r;}catch(e){if(!e.message.includes('NoSuchElement'))throw e;}await delay(150);}throw Error('Timed out '+label);}
 return {request,connected,js,until,delay};
}
if(process.argv[1]&&new URL(import.meta.url).pathname.toLowerCase().endsWith(process.argv[1].replaceAll('\\','/').split('/').pop().toLowerCase())){
 const [out,action='state',raw='{}']=process.argv.slice(2);console.log(JSON.stringify(await client(out).request(action,JSON.parse(raw)),null,2));
}
