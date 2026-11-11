// Reproducible index. A match is a source boundary, NOT a passing test.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[2]||'reports/nbt-audit');
const rows=[],sources=[];
const patterns={
 '.js':/\b(?:parseSnbtUser|parseSnbt|SnbtReader|toSnbt|nbtParse|nbtPrint|nbtToJson|nbtMerge|nbtNote|nbtApplyFormats|vaultNested|vaultEntityObj|vaultEntityPayload|component_snbt|component_formats|snapOf|copyComp|weSetV|evSet)\b/,
 '.java':/\b(?:NbtOps|JsonOps|TagParser|component_snbt|component_formats|loadWithComponents|saveWithoutId|requireEditedFieldsRetained|parseSnbt)\b|StackCodec\.(?:decode|snapshot)/
};
function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else {const re=patterns[path.extname(file)];if(!re)continue;const bytes=fs.readFileSync(file),text=bytes.toString('utf8'),rel=path.relative(root,file).replaceAll('\\','/');sources.push({path:rel,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});text.split(/\r?\n/).forEach((line,index)=>{if(re.test(line))rows.push({file:rel,line:index+1,text:line.trim()});});}}}
for(const dir of ['common/src/main','fabric/src/main','neoforge/src/main'])walk(path.join(root,dir));
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'boundary-index.json'),JSON.stringify({scope:'static index; matches include registry metadata and read-only paths; not proof all functions were executed',sourceFiles:sources.length,matches:rows.length,sources,rows},null,2));
const md=['# NBT 转换调用点索引','','这是静态索引，不代表这些调用点全部经过实机测试。风险分级见同目录 audit.md。',''];
let last='';for(const r of rows){if(last!==r.file){md.push('## '+r.file,'');last=r.file;}md.push('- L'+r.line+': '+r.text.replaceAll(String.fromCharCode(96),''));}
fs.writeFileSync(path.join(out,'boundary-index.md'),md.join('\n')+'\n');
console.log('PASS boundary inventory: '+sources.length+' source files scanned, '+rows.length+' matching lines -> '+path.join(out,'boundary-index.json'));
