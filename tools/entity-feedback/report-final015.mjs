import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const [out,prep]=process.argv.slice(2),read=f=>JSON.parse(readFileSync(join(out,f),'utf8')),NL=String.fromCharCode(10);
const passes={};
for(const a of ['03','04','05'])for(const r of read('first-results-'+a+'.json').results)if(r.status==='PASS')passes[r.name]={...r,source:'first-results-'+a+'.json'};
assert.equal(read('restart-terminal.json').status,'PASS');passes['same-world-new-jvm-disk-restore']={status:'PASS',source:'restart-terminal.json'};
const saved=Object.entries(passes).filter(([,x])=>x.evidence?.receipt?.result?.status==='saved').map(([name,x])=>{const q=x.evidence.receipt;assert.equal(q.sent.payload.requestId,q.result.requestId);return {name,requestId:q.result.requestId,source:x.source};});assert.equal(saved.length,5);
assert.deepEqual(read('cleanup-third.json').remaining,[]);assert.deepEqual(read('port-cleanup-third.json').listeners,[]);
const shots=['first-effects-deleted.png','first-invalid-effect-rejected-dirty.png','first-same-target-restore-offer.png','second-new-jvm-restore-offer.png','second-new-jvm-restored-typed.png','first-effects-duration-FAILED.png'];
const terminal={status:'PARTIAL_PASS_WITH_REAL_DURATION_CONFLICT',mc:'26.2',loader:'Fabric',editorSha256:read('configuration.json').sha256,orielVersion:'0.15.0',orielSha256:'1d4f66a91fd96b17953779d899879228d147a8aa0337a1272a1211164d85d546',passes:Object.keys(passes),saved,notRun:['effects-permanent positive save','parent WE export while nested item active','real cross-world isolation','new edits after pending saved in this game round'],failure:{name:'effects-duration',status:'FAIL',reason:'Natural finite duration ticks change same field before Apply. Host rejected target_changed; dirty retained; not invalid_nbt Codec regression.',evidence:'duration-live-conflict.json'},toolFailuresPreserved:readdirSync(out).filter(f=>f.includes('-results-')||f.includes('-error-')),restartFixture:{startups:3,second:'old stop RPC replayed by fresh probe; exited before opening world',third:'archived RPC; same java.args/owner/gameDir/world/config',comparison:'all typed SNBT exact except unchanged native attributes id-list order; original mismatch retained'},freeze:false,screenshotsReviewed:shots.map(f=>join(out,'host/screenshots',f)),visualLimits:'Restored screenshot proves dirty and compare warning. Off-screen typed values verified in restart-typed-comparison.json.',cleanup:read('cleanup-third.json'),ports:read('port-cleanup-third.json'),nonGameBoundary:'native javap lifecycle and prior Node/JVM gates are not game PASS'};
writeFileSync(join(out,'terminal-final015.json'),JSON.stringify(terminal,null,2));
const base='node tools/entity-feedback/live-game.mjs '+JSON.stringify(out);
const lines=[
 'FAIL | '+base+' first ".*" 03 | add+amplifier saved; duration target_changed; dirty retained | '+join(prep,'phase-first-03.log'),
 '关键错误：active_effects.[id=minecraft:speed].duration rejected/target_changed；完整请求回执 '+join(out,'duration-live-conflict.json'),
 'FAIL | '+base+' first "effects-(particles|ambient|icon)-default" 04 | particles+ambient saved; icon no-op incorrectly expected dirty | '+join(prep,'phase-first-04.log'),
 'PASS | '+base+' first "effects-(icon|delete)|effect-invalid|large-incomplete" 05 | icon no-op; delete saved; host reject+close restore; >8192 held upload pagehide persisted | '+join(prep,'phase-first-05.log'),
 'FAIL | '+base+' second ".*" 01 | stale stop RPC caused second JVM exit | '+join(prep,'phase-second-01.log'),
 'FAIL | '+base+' second ".*" 02 | untouched native attribute order mismatch | '+join(prep,'phase-second-02.log'),
 'PASS | node tools/entity-feedback/verify-restarted.mjs '+JSON.stringify(out)+' | same-world disk/new JVM/token; typed exact except untouched attribute order; no Apply | '+join(prep,'verify-restarted.log'),
 'PASS | pwsh -NoProfile -File tools/entity-feedback/resume-owned.ps1 -Evidence '+JSON.stringify(out)+' | third/last startup; normal exit remaining=[];25782 empty | '+join(prep,'resume-owned-03.log')
];
writeFileSync(join(out,'gates-final015.txt'),lines.join(NL)+NL);
writeFileSync(join(out,'REPORT-final015.md'),['# MC26.2 backend effects/drafts terminal','Hash: '+terminal.editorSha256,'9 precise PASS cases, 5 matching saved requestIds. Duration FAIL; permanent/nested/cross-world NOT_RUN. No freeze or production changes.',...Object.keys(passes).map(x=>'- PASS '+x),'Saved: '+saved.map(x=>x.name+' = '+x.requestId).join('; '),'Drafts passed invalid_nbt host rejection, pagehide incomplete real upload, same canonical world JVM restart. 14676-char packet retained unsafe-long/arrays/short/unknown. No auto Apply. Only unchanged native attribute list order normalized; all remaining typed text exact.','Three startups total. Stale RPC caused second exit; retained. All owned processes exited; port25782 empty. No pending-new-edit/cross-world game claims.','Reviewed screenshots:',...shots.map(x=>'- host/screenshots/'+x),...lines].join(NL+NL)+NL);
console.log(JSON.stringify({pass:Object.keys(passes).length,saved,notRun:terminal.notRun,status:terminal.status},null,2));
