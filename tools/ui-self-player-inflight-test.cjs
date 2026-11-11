const fs=require('node:fs'),path=require('node:path');
const setup=fs.readFileSync(path.join(__dirname,'ui-self-player-next-test.cjs'),'utf8');
const cases=fs.readFileSync(path.join(__dirname,'lib/self-player-inflight-cases.js'),'utf8');
// Same production form builders/evSet/weDraftSet/weApply/weSend/weSaved as the candidate suite.
new Function('require','__dirname',setup+String.fromCharCode(10)+'{'+cases+'}')(require,__dirname);
