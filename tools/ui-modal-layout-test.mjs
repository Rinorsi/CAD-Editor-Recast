// Real Oriel/Yoga layout regression. No Minecraft process, Gradle or browser fake DOM.
import {cpSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(process.argv[2]||join(root,'logs','modal-layout-'+Date.now()));
if(existsSync(out))throw Error('证据目录必须全新：'+out);
mkdirSync(out,{recursive:true});
const assets=join(out,'assets'),ui=join(assets,'cadeditor','ui');
cpSync(join(root,'common/src/main/resources/assets/cadeditor/ui'),ui,{recursive:true});
cpSync(join(root,'../Oriel-UI/kit/src/main/resources/assets/oriel'),join(assets,'oriel'),{recursive:true});
cpSync(join(root,'tools/preview/legacy/preview-stack.js'),join(ui,'fixture.js'));
const index=readFileSync(join(ui,'index.html'),'utf8').replace('<script src="js/app.js">','<script src="fixture.js"></script><script src="js/app.js">').replace('<script src="js/app.js"></script>','<script src="js/app.js"></script><script src="layout-case.js"></script>');
writeFileSync(join(ui,'index.html'),index);
const java=join(process.env.USERPROFILE,'.jdks/jdk-25.0.5+8/bin/java.exe');
const cp=join(root,'../Oriel-UI/preview/build/install/preview/lib/*');
const selectors='.k-modal,.k-mh,.k-mh > *,.k-mf,.k-mf > *,.addbody,.addcats,.addmain,.addtop,.k-sbox,.k-sbox .k-input,.k-sbox .k-sbtn,.k-sbtn img,.k-sbtn span,.advbody,.advnav,.advmain,.adv,.adv-l,.adv-r,.advbar,.ed-tools,.ed-code-modes,.ed-code-actions,.kc-bar,.kc-actions,.kc-fonts';
const cases=[['effect','openEffectPicker({present:{},onConfirm:function(){}});'],['add','openAddSetting();'],['advanced','openAdvanced("all");'],['snbt','openAdvanced("snbt");']];
const sizes=process.env.MODAL_SIZES?process.env.MODAL_SIZES.split(','):['320x200','427x267','640x400','1280x800'];
const results=[];
for(const size of sizes)for(const [name,setup] of cases){
 writeFileSync(join(ui,'layout-case.js'),setup);
 const label=name+'-'+size;
 const run=spawnSync(java,['--enable-native-access=ALL-UNNAMED','-Xmx512M','-cp',cp,'dev.oriel.preview.Preview',join(ui,'index.html'),'--size',size,'--scale','1','--frames','45','--snapshot',join(out,label+'.png'),'--boxes',selectors],{cwd:root,encoding:'utf8',timeout:120000,env:{...process.env,ORIEL_MC_JAR:join(process.env.USERPROFILE,'.gradle/caches/fabric-loom/26.1.2/minecraft-merged.jar')}});
 const log=(run.stdout||'')+(run.stderr||'');writeFileSync(join(out,label+'.log'),log);
 const [width,height]=size.split('x').map(Number),boxes=[];
 for(const line of log.split(/\r?\n/)){
  const m=line.match(/^\s*(-?[\d.]+),\s*(-?[\d.]+)\s+([\d.]+)x\s*([\d.]+)\s+(.*)$/);
  if(m)boxes.push({x:+m[1],y:+m[2],width:+m[3],height:+m[4],node:m[5]});
 }
 // The item-stack view is an inline editor now. Its toolbar intentionally scrolls inside a bounded clip.
 const codeClip=boxes.find(b=>b.node==='div.ed-code-actions');
 const clippedCode=b=>codeClip&&codeClip.x>=-.6&&codeClip.x+codeClip.width<=width+.6&&['div.kc-bar','div.kc-actions','div.kc-fonts'].includes(b.node);
 const failures=boxes.filter(b=>!clippedCode(b)&&b.width>0&&b.height>0&&(b.x<-.6||b.x+b.width>width+.6||((b.node.includes('.k-modal')||b.node==='div.k-mf'||b.node==='div.k-mh')&&(b.y<-.6||b.y+b.height>height+.6))));
 for(const b of boxes)if(b.node.includes('input.k-input')&&b.width<40)failures.push({...b,reason:'search input must retain usable width'});
 const head=boxes.find(b=>b.node==='div.k-mh'),foot=boxes.find(b=>b.node==='div.k-mf');
 for(const parent of [head,foot].filter(Boolean)){
  // Child rows in a toolbar/header must fit their own parent, not just the screen.
  const from=boxes.indexOf(parent)+1;
  for(let n=from;n<boxes.length;n++){
   const b=boxes[n];if(/\.(addbody|advbody|addcats|addmain|advnav|advmain)/.test(b.node))break;
   if(b.width>0&&b.height>0&&(b.x<parent.x-.6||b.x+b.width>parent.x+parent.width+.6||b.y<parent.y-.6||b.y+b.height>parent.y+parent.height+.6))failures.push({...b,parent:parent.node});
  }
 }
 const inlineCode=name==='snbt'&&codeClip&&boxes.some(b=>b.node==='div.kc-bar');
 const status=run.status===0&&(inlineCode||boxes.length>5)&&failures.length===0?'PASS':'FAIL';
 results.push({name,size,status,exit:run.status,error:run.error?.message,boxes,failures});
 console.log(status+' '+label+(failures.length?' '+failures.map(b=>b.node+' right='+(b.x+b.width)+' viewport='+width).join('; '):''));
 writeFileSync(join(out,'result.json'),JSON.stringify(results,null,2));
}
process.exitCode=results.some(x=>x.status==='FAIL')?1:0;
