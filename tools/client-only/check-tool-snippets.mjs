// Static syntax gate for the JS strings sent to the embedded page, not a LAN test.
import {Script} from 'node:vm';
import {createSelfPlayerAdapter} from './self-player.mjs';
let compiled=0,blocked=false;
const audit={sent:[],received:[]};
const page={world:{player:{self:true},capabilities:{backend:'vanilla_self'}},edits:{},slots:{},dirty:false};
const js=async code=>{
 new Script(code,{filename:'generated-oriel-snippet-'+(++compiled)+'.js'});
 if(code==='JSON.parse(JSON.stringify(window.lanSelfAudit))')return structuredClone(audit);
 if(code.includes('var fragment='))return [{text:'权限',shown:true,x:1,y:1,w:10,h:10,width:100,height:100}];
 if(code.includes('return {world:WE.w'))return structuredClone(page);
 if(code.includes('document.querySelector("#topbar .k-apply")')&&!blocked){audit.sent.push({channel:'apply',payload:{requestId:'syntax-fixture'}});audit.received.push({value:{requestId:'syntax-fixture',status:'saved'}});}
 return true;
};
const a=createSelfPlayerAdapter({js,delay:async()=>{},request:async(role,action)=>action==='playerFields'?{playerFields:{source:'host-integrated-server-thread'}}:{commandAttempts:0}});
await a.installAudit();await a.openSelf();await a.tab('状态');await a.revealNumber('等级');await a.editNumber('等级',7);await a.revealSection('游戏模式');await a.clickText('.k-segi','创造');await a.warning('权限',{persistent:true});await a.submit();blocked=true;await a.blockedApply('权限');
console.log('STATIC_SNIPPET_COMPILE PASS '+compiled+' generated page expressions; no DOM or LAN behavior claimed');
