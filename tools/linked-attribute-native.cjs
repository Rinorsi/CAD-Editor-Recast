const fs=require('node:fs'),H=require('./lib/ui-harness.cjs'),c=H.create().c;
const cases=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(cases.map(x=>{try{return c.linkedAttributePlan(x.def,x.row,x.requested);}catch(e){return {error:e.message};}})));
