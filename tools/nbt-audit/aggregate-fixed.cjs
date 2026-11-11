const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=process.argv[2],hash="32198F5A38BA0372CC4C6DA5586150CC49BF305148864D841F5C8ADF806FC627";
const sources=["integrated-32198-01","extra-32198-02","crossfield-32198-03","jukebox-fixed-01","jukebox-fixed-03"],cases=[],failures=[];
for(const dir of sources){
 const read=f=>JSON.parse(fs.readFileSync(path.join(root,dir,f),"utf8"));
 assert.equal(read("configuration.json").sha256,hash);assert.deepEqual(read("cleanup.json").remaining,[]);assert.deepEqual(read("port-cleanup.json").listeners,[]);
 const installed=read("host/installed-jars.json"),mods=read("host/mods.json");assert(installed.some(j=>j.sha256===hash));assert.equal(mods.find(m=>m.id==="oriel").version,"0.13.0");assert(!installed.some(j=>/^oriel-/.test(j.name)),"embedded game must not duplicate Oriel");
 for(const c of read("nbt-live-scenarios.json")){if(c.status==="NOT_RUN")continue;if(c.status!=="PASS"){failures.push({source:dir,...c});continue;}
  const r=c.evidence?.receipt;assert(r?.sent?.payload?.requestId);assert.equal(r.sent.payload.requestId,r.result.requestId);
  assert.equal(r.result.status,c.name.includes("rejected")||c.name.includes("reject-")?"rejected":"saved");
  if(c.name.startsWith("jukebox-reject-")){assert.equal(r.page.dirty,true);assert(c.evidence.after.snbt.includes("count:1"));assert(c.evidence.after.snbt.includes("minecraft:music_disc_cat"));}
  cases.push({name:c.name,status:"PASS",source:dir,requestId:r.result.requestId,result:r.result.status});
 }
}
const core=cases.filter(c=>["integrated-32198-01","extra-32198-02","crossfield-32198-03"].includes(c.source));assert.equal(core.length,9);assert.equal(new Set(core.map(c=>c.name)).size,9);
const jukebox=cases.filter(c=>c.source.startsWith("jukebox-fixed"));assert.equal(jukebox.length,5);
const typed=JSON.parse(fs.readFileSync(path.join(root,"typed-native-32198/typed-native-result.json")));assert.equal(typed.passed,5);assert.equal(typed.failed,0);
const jsonops=JSON.parse(fs.readFileSync(path.join(root,"jsonops-32198/native-roundtrip.json")));assert.equal(jsonops.failed,3);assert.equal(jsonops.harnessErrors,0);
const result={scope:"Intermediate Fabric26.1.2 32198F package, embedded Oriel0.13.0. Not final six-target release.",hash,core:{passed:9,cases:core},jukebox:{passed:5,cases:jukebox},typedNative:{passed:5,source:"typed-native-32198"},jsonOpsLossyCounterexamples:{passed:jsonops.passed,failed:3,source:"jsonops-32198",intentionalRed:true},preservedFailures:failures,freeze:"integrated-32198-01: actual tick freeze before bee page, until owned process exit, all seven core cases in this run frozen. Extra02/crossfield03 and jukebox runs natural tick. Do not interpret frozen passes as bee concurrency success.",coverageLimits:["Native nested ItemStack count editing uses production UI draft handler, not a live control; live nested edits use actual SNBT textarea.","Document regression uses actual DocumentDriver.reload + Controller save/restore; filesystem watcher not separately claimed.","Normal-tick bee non-timer diagnostics separately recorded; rejected cases never counted as save PASS."]};
fs.writeFileSync(path.join(root,"fixed-32198-terminal.json"),JSON.stringify(result,null,2));console.log("PASS aggregate: core9 + jukebox5 + typed5; JsonOps3 intentional RED, failures preserved; intermediate only");
