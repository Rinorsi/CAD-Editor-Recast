import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';

export async function verifySourceReload({out,root,request,delay}) {
 const fixtureRoot=resolve(out,'hotreload-source');
 assert.equal(resolve(root),fixtureRoot,'only modify this run owned hotreload fixture');
 const page=resolve(root,'src/main/resources/assets/cadeditor/ui/index.html');
 assert(page.startsWith(fixtureRoot+sep));
 const inspect=async()=>(await request('host','eval',{js:'(function(){var e=document.querySelector("html");return e?e.getAttribute("data-release-proof"):"NO_PAGE";})()'})).value;
 await request('host','open');
 let initial;
 for(let n=0;n<50;n++){
  await delay(300);
  try{initial=await inspect();if(initial==='before')break;}catch{}
 }
 assert.equal(initial,'before','formal Editor page must originate from official dev-sources overlay');
 const original=readFileSync(page,'utf8');
 assert(original.includes('data-release-proof="before"'));
 writeFileSync(page,original.replace('data-release-proof="before"','data-release-proof="after"'));
 const start=Date.now();let observed;
 while(Date.now()-start<15000){
  await delay(300);
  try{observed=await inspect();if(observed==='after')break;}catch{}
 }
 assert.equal(observed,'after','saving HTML must trigger actual source reload without manual refresh');
 const state=await request('host','state');
 assert.equal(state.connected,true);
 await request('host','screenshot',{name:'embedded-development-source-hot-reload.png'});
 writeFileSync(join(out,'hot-reload-result.json'),JSON.stringify({status:'PASS',sourceRoot:root,method:'official dev-sources.properties; packaged-client development',before:'before',after:observed,elapsedMs:Date.now()-start,manualReload:false,productionJarChanged:false},null,2));
}
