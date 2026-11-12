const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const dir=path.resolve(__dirname,'../common/src/main/resources/assets/cadeditor/ui');
const pending=[];let width=376,heroWidth=176;
const classes=new Set();
const win={getBoundingClientRect:()=>({width}),classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k);}}};
const hero={getBoundingClientRect:()=>({width:heroWidth})};
const c=vm.createContext({console,setTimeout(fn){pending.push(fn);return pending.length;},clearTimeout(){},
 document:{getElementById:id=>id==='win'?win:id==='hero'?hero:null,addEventListener(){}},
 window:{innerWidth:427,innerHeight:240,addEventListener(){}}});
for(const file of ['data.js','i18n-catalogs.js','i18n.js','core.js','labels.js','screens.js'])
 vm.runInContext(fs.readFileSync(path.join(dir,'js',file),'utf8'),c);
c.fitTopbar=()=>{};c.fitTip=()=>{};
function fit(){c.scheduleFit();while(pending.length)pending.shift()();}
// A first measurement still sees the previous layout width. Classification must
// settle in one pass, rather than depending on a delayed retry after CSS changed.
c.UI.heroW=0;fit();assert(classes.has('narrow'));assert(classes.has('hthin'));
width=560;heroWidth=112;fit();assert(!classes.has('narrow'));assert(classes.has('snug'));assert(!classes.has('hthin'));
width=376;heroWidth=176;fit();assert(classes.has('hthin'));
c.UI.heroW=120;heroWidth=120;fit();assert(classes.has('hthin'));
c.UI.heroW=180;heroWidth=180;fit();assert(!classes.has('hthin'));
const css=fs.readFileSync(path.join(dir,'editor.css'),'utf8');
assert(/\.ew\.narrow \.ed-hero\s*\{[^}]*112px/.test(css),'default sidebar must retain readable width');
for(const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
 if(block[1].includes('.hthin')&&/display:\s*none/.test(block[2]))
  assert(!/\.ed-stats|\.ed-stagehead|\.ed-tiphead|\.k-scrollbox|\.ed-tip\b/.test(block[1]),'compact styling cannot remove sidebar content');
}
console.log('PASS sidebar layout: first-open stale geometry, resize both ways, custom widths and compact content preservation');
