import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

// Remote creative writes; only joiner has Editor/Oriel, no server-side mod.
export async function run({out,request,delay,js,owned,host,readyPage,apply,close,test,results}) {
 await host('gamemode creative LanEditor');
 await host('deop LanEditor');
 await delay(800);
 const initial = {server:await owned(),client:await request('joiner','state')};
 assert.equal(initial.server.gamemaster,false);
 assert.equal(initial.client.creative,true);
 assert.equal(initial.client.gamemaster,false);
 for (const [index,menuSlot,count] of [[0,36,4],[9,9,5],[35,35,6]]) {
  await test('creative-no-op-owned-slot-'+index+'-submit-readback-reopen',async()=>{
   const mode = {server:await owned(),client:await request('joiner','state')};
   assert.equal(mode.server.gamemaster,false); assert.equal(mode.client.creative,true);
   await host('item replace entity LanEditor '+(index<9?'hotbar.'+index:'inventory.'+(index-9))+' with minecraft:paper 2');
   await delay(350);
   const before=await owned();
   await request('joiner','inventory',{menuSlot});
   const opened=await readyPage(); assert.equal(opened.doc.src.index,index);
   await js('Store.setCount('+count+');Store.set("custom_name",{text:"Creative no OP '+index+'"});true');
   const response=await apply('sent','submitted');
   assert.equal(response.result.confirmed,false);
   assert(await js('diffDoc(Store.doc()).length>0'),'unconfirmed transport retains dirty draft');
   await delay(500);
   const after=await owned();
   assert.equal(after.inventory[index].count,count,'real server inventory confirms write independently of UI receipt');
   assert(JSON.stringify(after.inventory[index].components).includes('Creative no OP '+index));
   for(let i=0;i<before.inventory.length;i++)if(i!==index)assert.deepEqual(after.inventory[i],before.inventory[i],'other slot '+i+' unchanged');
   await request('joiner','screenshot',{name:'creative-no-op-'+index+'-submitted.png'});
   await close(); await request('joiner','inventory',{menuSlot});
   const reopened=await readyPage(); assert.equal(reopened.doc.count,count);
   assert.equal(await js('diffDoc(Store.doc()).length'),0,'reread starts clean draft');
   await close(); return {mode,before,opened,response,after,reopened};
  });
 }
 const log=readFileSync(join(out,'joiner','logs','latest.log'),'utf8');
 assert(log.includes('packet=ServerboundSetCreativeModeSlotPacket'));
 assert(log.includes('stage=client.creative.local_prediction'));
 assert(!log.includes('stage=client.apply.timeout'),'optional vanilla echo must not cause save timeout');
 writeFileSync(join(out,'creative-result.json'),JSON.stringify({status:'PASS',scope:'Fabric26.1.2 actual LAN creative non-OP own slots; no Editor server; not Paper/plugin-server acceptance',initial,results},null,2));
}
