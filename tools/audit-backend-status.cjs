// Reads frontend assets, writes reports only. Never rewrites UI sources.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),ui=path.join(root,'fabric/src/main/resources/assets/cadeditor/ui');
const files=[...fs.readFileSync(path.join(ui,'index.html'),'utf8').matchAll(/<script src="(js[/][^"]+)"/g)].map(m=>m[1]);
const src=Object.fromEntries(files.map(f=>[f,fs.readFileSync(path.join(ui,f),'utf8')]));
const ctx=vm.createContext({console,setTimeout(){return 1;},clearTimeout(){},document:{addEventListener(){},getElementById(){return null;}}});
for(const f of files)if(!['js/app.js','js/drafts.js'].includes(f))vm.runInContext(src[f],ctx,{filename:f,timeout:3000});
const date=new Date().toISOString(),E=ctx.EDATA,NL=String.fromCharCode(10);
function ref(token){const a=[];for(const[f,s]of Object.entries(src)){if(f==='js/data.js')continue;const i=s.indexOf(token);if(i>=0)a.push(f.slice(3)+':'+s.slice(0,i).split(NL).length);}return a.slice(0,3).join('、')||'离线data.js';}
const rows=[];
function add(name,token,state,manual,note,count='动态/见定义'){rows.push([ref(token),name,count,state,manual,note]);}
const live='已改用注册表',pure='仍手写-可保留的UI元数据',todo='仍手写-必须改';
const findings=[
['主物品/附魔/效果/属性/音效','openEnchantPicker',live,'是','Reg动态候选，共享picker有自定义ID；静态EDATA只作回退。'],
['通用注册表字段','function registryOptions',live,'是','wStr→kRegSelect→Reg.options，实际空集合/加载行为另验。'],
['标签/成员','openTagPicker',live,'是','tags目录与条目分开，可输入#标签/完整ID。'],
['物品默认组件','defaultsOf:',live,'不适用','Reg.defaultsOf→item_defaults_one，protoOf优先实时。'],
['静态分类','function kindOfItem',todo,'不适用','仍EDATA.ikind；新item_meta未接。'],
['容器格数','var SLOT_COUNT',todo,'不适用','固定表+shelf名称判断+兜底27；新container_size未接。'],
['收纳袋重量','function stackWeight',todo,'不适用','count/max_stack_size简化式未含嵌套袋/蜂巢特殊重量；新bundle_capacity只表达标准容量。'],
['旧附魔表单','function wEnchants',todo,'否','仍ENIDX候选、free:false且校验ENIDX；主卡动态候选不能修复旧入口。'],
['旧属性表单','function wAttrMods',live,'否','registryOptions(attribute)动态，free:false缺手动新增；AMT_LIMIT仍限数值。'],
['已绑定官方枚举','function syncEnums',live,'否','regEnumTable按真实枚举过滤/追加，见实际绑定表；闭合选择无手动值。'],
['通用schema枚举','function wStr',todo,'否','sc.en与scalarHead enum仍取离线schema，染料特判例外。'],
['染料色板','function dyeList',live,'否','优先enum:dye_color的RGB；DYE_RGB回退，缺手动序列化值。'],
['文字颜色','MC_COLORS',todo,'原始文本可输入','forms.js的wText/wColor与kit2.js的kRich仍直接遍历固定MC_COLORS；没有enum:text_color接线，宿主已提供不等于前端已消费。CODE_COLOR转换也仍固定。'],
['装备资源','EQ_ASSETS',live,'是','equipment_asset动态；固定表作离线回退。'],
['纹饰候选','TRIM_MATS',live,'是','trim_material/trim_pattern动态；静态材料/模板作离线回退。'],
['药水候选','POTION_IDS',live,'是','Reg.options(potion)；固定表作离线回退。'],
['提示框样式','AUTO_BODY.tooltip_style',live,'是','Reg保留tooltip_style直接键；宿主已有ResourceManager目录，旧版无来源结论过期。'],
['模型字段提示','Reg.hintsOf',live,'原始值可输','item_model_hints已接；数组±1e9限制、浮点色转整数仍需修。'],
['专用声音','AUTO_BODY.break_sound',live,'是','kSoundField动态与手输；内联range保留不等于可编辑。'],
['乐器/唱片','AUTO_BODY.instrument',live,'是','instrument/jukebox_song动态，复杂分支退通用；听感另验。'],
['方块属性/调试棒','worldMap',todo,'是','属性名/值仍手输；后端block_properties新增不代表前端接入。'],
['战利品/配方/维度/标记','AUTO_BODY.container_loot',live,'是','新RegistrySupplement提供对应目录并说明远服限制；前端请求键已存在。'],
['生物变种','STR_REG',live,'是','sc.reg/STR_REG动态；固定sc.en变种仍未迁移。'],
['静态schema','EDATA',todo,'原始编辑','107个离线schema不等于运行时Codec schema；前端CIDX/validateDoc仍限制未知组件。'],
['任意NBT真键','worldMap',pure,'是','world.js已替代字面*伪字段；值仍parseSnbt→JS，新类型保真SNBT通道未接。'],
['战利品64位seed','AUTO_BODY.container_loot',todo,'是','当前拒绝超JS安全整数输入；完整long值域仍不能编辑。'],
['嵌套弹药物品','AUTO_BODY.charged_projectiles',pure,'是','world.js有物品/数量/原始组件入口，容器/袋未知组件与递归保真另验。'],
['SNBT写回标记','function applyToGame',todo,'不适用','payload尚未发送component_formats，新后端类型保真能力待前端接入。'],
['草稿持久化','drafts',pure,'不适用','宿主单件/分块协议已接，跨基线恢复/保存后清理另验。']
];
findings.forEach(r=>add(...r));
const must={HIDE_PARTS:'固定8项，尚无data_component_type全集入口。',RESIST:'快捷标签未按权威存在性过滤。',TOOL_GROUPS:'quick仍直接使用固定标签集合。',MELEE_SLOTS:'固定mainhand/hand，攻击基值1/4尚未接实体属性。',AMT_LIMIT:'2048仍用于旧wAttrMods上下限。',CODE_COLOR:'格式码映射仍固定，须同步官方格式。',CARD_NEEDS:'含物品ID/类别条件，须逐项与当前有效组件核对。'};
const names='HIDE_PARTS TAG_NAMES RESIST TOOL_GROUPS MELEE_SLOTS AMT_LIMIT TIER_TOOLS ENCH_ICON ATTR_ICON ATTR_VIS ATTR_SLOT_ICON SPR EQ_SOUNDS TRIM_ICON EFFECT_KIND_COLOR TOGGLABLE TC_STYLE_KEYS CODE_COLOR KIND_INFO RARITY_ZH APPEAR DURA ENCH ATTR_MAIN ATTR_ARMOR PAGES CARD_NEEDS CARD_COMPS UNIVERSAL CAT_ICON SLOT_HEAD ADV_TABS COMP_ITEM CAT_SHORT ENCH_TAG_ZH SOUND_GROUP_ZH EFFECT_CAT_ZH SLOT_ZH SLOTS REG_HINT LABEL_ICON'.split(' ');
for(const n of names){const v=ctx[n];add(n,n,must[n]?todo:pure,'不适用',v===undefined?'当前加载脚本已无此全局；不沿用旧位置/数量。':must[n]||'布局/图标/译名/快捷展示；不得作为在线内容白名单。',v===undefined?'未定义':Array.isArray(v)?v.length:typeof v==='object'?Object.keys(v).length:String(v));}
const evidence={generated_at:date,sources:Object.fromEntries(Object.entries(src).map(([f,s])=>[f,crypto.createHash('sha256').update(s).digest('hex')])),rows};
fs.mkdirSync(path.join(root,'logs/backend-b'),{recursive:true});fs.writeFileSync(path.join(root,'logs/backend-b/ui-source-audit.json'),JSON.stringify(evidence,null,2));
const data=['# 数据来源落地状态','','核对：'+date+'。执行 node tools/audit-backend-status.cjs，从index.html真实加载顺序重读定义，未读取旧状态结论。SHA256证据：logs/backend-b/ui-source-audit.json。本文是源码接线审计，不等于视觉或全部候选实机验收。','','| 当前位置 | 表/入口 | 数量 | 状态 | 手动添加 | 当前证据与限制 |','|---|---|---:|---|---|---|',...rows.map(r=>'| '+r.join(' | ')+' |'),'','## 实际枚举绑定','','| enum键 | 离线建议数 | 引用位置 |','|---|---:|---|',...ctx.ENUM_TABLES.map(t=>'| '+[t.name,t.orig.length,ref(t.name)].join(' | ')+' |'),'','## 后端与前端边界','','validate_component使用真实持久化Codec；item_meta(_one)提供物理元信息；StackCodec接受component_formats:snbt。前端ikind、SLOT_COUNT、applyToGame须另接，不能据后端已实现称迁移完成。组件Codec通常只约束实体NBT容器结构，不代表任意键玩法有效；刷怪笼附加规则见SpawnerData。',''];
fs.writeFileSync(path.join(root,'docs/STATUS-data.md'),data.join(NL));
const direct=new Set();for(const[f,s]of Object.entries(src))if(/cards[123][.]js$/.test(f))for(const m of s.matchAll(/comps:[ ]*\[([^\]]*)\]/g))for(const id of m[1].matchAll(/'([a-z_/]+)'/g))direct.add(id[1]);
['enchantments','stored_enchantments','use_effects'].forEach(id=>direct.add(id));
function shape(sc,o={types:new Set(),regs:new Set(),enums:0,wild:false}){if(!sc||typeof sc!=='object')return o;if(sc.t)o.types.add(sc.t);if(sc.reg)o.regs.add(sc.reg);if(sc.en)o.enums++;if(sc.k==='*')o.wild=true;for(const v of Object.values(sc))if(v&&typeof v==='object'){if(Array.isArray(v))v.forEach(x=>shape(x,o));else shape(v,o);}return o;}
const bodies=ctx.AUTO_BODY||{},specs=ctx.SPEC_FORMS||{},generic=E.comps.filter(c=>!direct.has(c.id));
const table=generic.map(c=>{const s=shape(c.schema),special=!!bodies[c.id],head=ctx.scalarHead(c.schema),notes=[];if(s.regs.size)notes.push('注册表:'+[...s.regs].join('/'));if(s.enums)notes.push('静态枚举'+s.enums+'处，染料特判优先实时');if(['nbt','raw','stack'].some(t=>s.types.has(t)))notes.push('含NBT/raw/stack，嵌套/类型保真另验');if(s.wild)notes.push('schema含*描述，应走worldMap真键');if(s.types.has('union')||s.types.has('dunion'))notes.push('联合分支/未知字段另验');if(special){const f=String(bodies[c.id]),calls=['worldMap','worldRaw','worldListEditor','wHolderSet','kRegSelect','kSoundField','kColor','renderComponentForm'].filter(x=>f.includes(x));if(calls.length)notes.push('实际调用:'+calls.join('/'));}return '| '+[c.id,special?'专用AUTO_BODY':specs[c.id]?'SPEC_FORMS分段说明书':head?'头部'+head+'控件':'schema通用表单',[...s.types].join('/'),notes.join('；')||'基础标量，以真实Codec为准','未作视觉验收'].join(' | ')+' |';});
const report=['# 通用与专用表单复核','','核对：'+date+'；重跑node tools/audit-backend-status.cjs，读取实际加载顺序、AUTO_BODY覆盖与EDATA schema，未沿用旧可用评级。SHA256：logs/backend-b/ui-source-audit.json。','','静态组件共'+E.comps.length+'个，专门CARDS关联'+E.comps.filter(c=>direct.has(c.id)).length+'个；其余审计集合'+generic.length+'个见下表，其中AUTO_BODY覆盖'+generic.filter(c=>bodies[c.id]).length+'个、SPEC_FORMS '+generic.filter(c=>!bodies[c.id]&&specs[c.id]).length+'个。这个集合不等于都只有通用表单。','','world.js已新增真键地图、钥匙条件、弹药/方块状态界面；旧结论“实体/方块实体只能编辑字面*”已不适用该路由。输入值仍经过JS，NBT byte/long/typed-array保真尚未接宿主SNBT接口。不能由有输入框推断完整可用，也不能将离线schema称作运行时Codec schema。','','| 组件 | 实际入口 | schema类型 | 数据来源/边界 | 验收 |','|---|---|---|---|---|',...table,'','## 共用边界','','- sc.reg动态且可手输；普通sc.en/头部enum仍封闭，染料实时但缺手输。','- 方块状态/调试棒属性仍未接block_properties；seed拒绝超JS安全整数，完整long不可编辑。','- SNBT校验返回normalized/snbt/json；snbt+component_formats提交保留类型，applyToGame尚未发标记。','- Codec/session/原版持久化回归见logs/backend-b/backend-data-verification.json；独立客户端回执另见backend-data-e2e.json。无回执不算通过，不替用户做视觉或实际刷怪验收。',''];
fs.writeFileSync(path.join(root,'docs/STATUS-generic.md'),report.join(NL));console.log('PASS source audit: '+rows.length+' data rows, '+generic.length+' component rows, '+Object.keys(bodies).length+' AUTO_BODY overrides; '+date);
