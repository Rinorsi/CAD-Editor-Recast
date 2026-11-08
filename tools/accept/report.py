"""Generate evidence without converting incomplete attempts into passes."""
import argparse, json, re
from pathlib import Path
from datetime import datetime, timezone

p=argparse.ArgumentParser();p.add_argument("--root",type=Path,required=True);p.add_argument("--receipt",type=Path);p.add_argument("--pending");p.add_argument("--additional-receipt",type=Path);p.add_argument("--output",type=Path);a=p.parse_args()
out=a.output or a.root/"docs/acceptance";out.mkdir(parents=True,exist_ok=True)
r=json.loads(a.receipt.read_text(encoding="utf-8-sig")) if a.receipt and a.receipt.exists() else {"status":"PENDING","reason":a.pending or "receipt missing","attempts":[]}
r.setdefault("status","IN_PROGRESS")
perf_attempts=list(r.get("attempts",[]))
if a.additional_receipt:
    extra=json.loads(a.additional_receipt.read_text(encoding="utf-8-sig"))
    replaced={x["component"] for x in extra.get("attempts",[])}
    r["attempts"]=[x for x in r.get("attempts",[]) if x["component"] not in replaced]+extra.get("attempts",[])
    previous_world=r.get("world",[])
    if extra.get("world"):r["world"]=extra["world"]
    r["additional_evidence"]={"receipt":str(a.additional_receipt),"build":extra.get("build"),"replaced_components":sorted(replaced),"superseded_world":previous_world if extra.get("world") else []}
    if extra.get("status")!="COMPLETE":r["status"]="INCOMPLETE"
ui=(a.root/"common/src/main/resources/assets/cadeditor/ui/js/data.js").read_text(encoding="utf-8-sig")
data=json.JSONDecoder().raw_decode(ui.split("var EDATA =",1)[1].lstrip())[0]
known=["minecraft:"+c["id"] for c in data["comps"]]
groups={k:[] for k in known}
for row in r.get("attempts",[]):groups.setdefault(row["component"],[]).append(row)
rows=[]
for key,attempts in groups.items():
    def all3(field):return len(attempts)==3 and {x.get("round") for x in attempts}=={1,2,3} and all(x.get(field) is True for x in attempts)
    failures=list(dict.fromkeys(x["failure"] for x in attempts if x.get("failure")))
    rows.append({"component":key,"sample_source":next((x.get("sample_source") for x in attempts if x.get("sample_source")),"pending"),"applied_ok":all3("applied_ok"),"reopen_equal":all3("reopen_equal"),"typed_fidelity":all3("typed_fidelity"),"validate_ok":all3("validate_ok"),"attempts":sum(x.get("attempted",False) for x in attempts),"success":sum(x.get("applied_ok",False) and x.get("reopen_equal",False) and x.get("typed_fidelity",False) for x in attempts),"rejected":sum(x.get("rejected",False) for x in attempts),"timeouts":sum(x.get("timeout",False) for x in attempts),"notes":failures or ([] if len(attempts)==3 else [r.get("reason","not reached")]),"rounds":attempts})
summary={"components_total":len(rows),"components_attempted":sum(x["attempts"]>0 for x in rows),"applied":sum(x["applied_ok"] for x in rows),"equal":sum(x["reopen_equal"] for x in rows),"typed_exact":sum(x["typed_fidelity"] for x in rows),"validated":sum(x["validate_ok"] for x in rows),"rejected":sum(x["rejected"] for x in rows),"attempts":sum(x["attempts"] for x in rows),"success":sum(x["success"] for x in rows),"timeouts":sum(x["timeouts"] for x in rows)}
report={"generated_utc":datetime.now(timezone.utc).isoformat(),"status":r["status"],"receipt":str(a.receipt) if a.receipt else None,"scope":r.get("scope"),"build":r.get("build"),"additional_evidence":r.get("additional_evidence"),"summary":summary,"components":rows,"world":r.get("world",[])}
(out/"components.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
lines=["# 自动化组件验收", "", "状态："+r["status"], "", "实机完整三轮均通过才记为通过；false 可能表示失败或未到达，具体看原因。默认原型样本只证明该值，不证明所有边界、所有组件字段或游戏行为。", "", "统计：`"+json.dumps(summary,ensure_ascii=False)+"`", "", "|组件|样本来源|apply 三轮|重开相等|类型精确保留|两种校验|成功/尝试|拒绝/超时|原因|", "|---|---|---|---|---|---|---|---|---|"]
for x in rows:
    yes=lambda k:"通过" if x[k] else "未通过/未验证"
    notes="; ".join(x["notes"]).replace("|", chr(92)+"|").replace("\n"," ")
    lines.append(f'|`{x["component"]}`|{x["sample_source"]}|{yes("applied_ok")}|{yes("reopen_equal")}|{yes("typed_fidelity")}|{yes("validate_ok")}|{x["success"]}/{x["attempts"]}|{x["rejected"]}/{x["timeouts"]}|{notes}|')
rate=f'{summary["success"]/summary["attempts"]:.2%}' if summary["attempts"] else "未验证"
lines += ["", f'F28：成功 {summary["success"]} / apply 尝试 {summary["attempts"]}（{rate}）；拒绝 {summary["rejected"]}，超时 {summary["timeouts"]}。没有发出 apply 的样本失败不计入成功率，请同时看组件覆盖数。', "", "## 世界编辑", "", "|路径|apply|重开相等|类型精确保留|失败原因|", "|---|---|---|---|---|"]
for kind in dict.fromkeys(w.get("path","") for w in r.get("world",[])):
    group=[w for w in r["world"] if w.get("path")==kind]
    counts=[str(sum(w.get(key,False) for w in group))+"/"+str(len(group)) for key in ("applied_ok","reopen_equal","typed_fidelity")]
    failures="; ".join(dict.fromkeys(w["failure"] for w in group if w.get("failure"))).replace("|",chr(92)+"|") or "无"
    lines.append("|"+kind+"|"+"|".join(counts)+"|"+failures+"|")
if not r.get("world"):lines.append("|箱子、标牌、刷怪笼、实体名称|未验证|未验证|未验证|尚无实机世界路径回执|")
lines += ["", "发送、服务端、重开 SNBT 与原始逐轮消息见 [components.json](components.json)。补跑会保留被替换回执的来源和旧失败记录，不把旧失败当作最终通过。"]
(out/"components.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
perf=["# 实机注册表性能", "", "范围：隐藏客户端、打包的真实页面、真实 search 消息；客户端 tick 和 eval 轮询包含在延迟内。冷页面是本进程首次打开；暖页面是同进程后续打开，不代表操作系统磁盘冷缓存。首次查询该目录之前，页面可能已启动索引预热，因此冷查询不是强制清空缓存的索引构建基准。", ""]
page=[x["page_interactive_ms"] for x in perf_attempts if "page_interactive_ms" in x]
percentile=lambda v,q:sorted(v)[min(len(v)-1,int((len(v)-1)*q))]
if page:perf += [f"首个可交互页面：{page[0]:.2f} ms；暖页面 p50/p95：{percentile(page[1:] or page,.5):.2f}/{percentile(page[1:] or page,.95):.2f} ms。", ""]
else:perf += ["页面延迟：未验证。", ""]
perf += ["实时索引尺寸：`"+json.dumps(r.get("search_registry_sizes",{}),ensure_ascii=False)+"`", "", "|目录|冷首次返回 ms|暖搜索 p50 ms|暖搜索 p95 ms|暖样本数|", "|---|---|---|---|---|"]
for kind in ("items","blocks"):
    m=[x for x in r.get("searches",[]) if x["kind"]==kind];warm=[x["ms"] for x in m if not x["cold"]];cold=[x["ms"] for x in m if x["cold"]]
    perf.append(f'|{kind}|{cold[0]:.2f}|{percentile(warm,.5):.2f}|{percentile(warm,.95):.2f}|{len(warm)}|' if cold and warm else f"|{kind}|未验证|未验证|未验证|0|")
(out/"perf.md").write_text("\n".join(perf)+"\n",encoding="utf-8")
# Editorial priorities only: never used as component values or a runtime allowlist.
common=set("custom_name item_name lore dyed_color custom_model_data item_model enchantment_glint_override damage max_damage max_stack_size unbreakable repair_cost attribute_modifiers tool weapon enchantments stored_enchantments food consumable use_cooldown equippable trim container bundle_contents written_book_content".split())
check=["# 游戏内人工观感清单", "", "自动证据见 [components.md](components.md)。这里只检查机器无法判定的布局、反馈、动画、浅色主题和游戏中呈现；不重复保存/重开/类型校验。自动失败项仍由开发排查，不能由观感检查代替。", "", "- [ ] 缩窄窗口并切换各标签：标签左对齐、控件贴内容，无截断或大面积空白。", "- [ ] 切浅色主题，打开候选菜单和提示：文字、焦点、选中态清楚，无遮挡。", "- [ ] 切页、展开卡片、撤销一次草稿：动画连贯、反馈及时，不跳滚动位置。", "", "以下25项按页面标签顺序排列。动作只在临时测试物品上进行；来源为页面分类，括号内机器状态来自本轮回执。", "", "|标签 / 组件|做什么|应该看到|", "|---|---|---|"]
byid={x["component"].split(":",1)[1]:x for x in rows}
visual={
 "custom_model_data":("增删一行模型数据并切换数据种类","数组行紧凑，增删反馈清楚，字段不挤出卡片"),
 "custom_name":("输入中文名称，切换颜色和样式","物品提示中的名字样式清楚，斜体呈现符合预期"),
 "item_name":("调整基础名称并查看物品提示","基础名称的字形和布局清楚，与自定义名的呈现可辨认"),
 "lore":("增删描述行并调整文字样式","每行描述顺序清楚，长行不遮住相邻控件"),
 "dyed_color":("拖动颜色控件并查看可染色物品预览","颜色选择过程顺手，色值与预览同步且易读"),
 "item_model":("打开模型候选，键入搜索，再切换预览","候选菜单不挡住操作，模型预览清楚；缺资源时说明可读"),
 "enchantment_glint_override":("来回切换附魔光效开关","开关状态、反馈和物品光效变化容易辨认"),
 "damage":("拖动当前耐久并观察耐久条","数值与耐久条的反馈连贯，数值框宽度合适"),
 "max_damage":("调节最大耐久并观察关联字段","标签、范围提示和关联数值清楚，不突然跳布局"),
 "max_stack_size":("调整最大堆叠并观察数量区域","堆叠字段和数量的提示容易理解，控件不通栏拉长"),
 "unbreakable":("切换不可破坏并看提示预览","开关状态清楚，相关说明不会挤压耐久控件"),
 "repair_cost":("连续点按修复费用的步进控件","每次变化明确，较长数字也不裁切"),
 "attribute_modifiers":("展开一条属性修饰并增删临时行","属性、操作和装备槽的层级清楚，菜单可定位"),
 "tool":("展开挖掘规则，打开方块候选并搜索","多条规则能分辨，候选与手动输入入口都易找到"),
 "weapon":("调整武器参数并展开说明","各参数单位、名称和提示清楚，紧凑而不拥挤"),
 "enchantments":("搜索附魔并调整等级","候选列表、等级控件和附魔提示都易读"),
 "stored_enchantments":("给附魔书调整储存附魔的草稿","书的提示预览明确，等级和删除按钮不挤在一起"),
 "food":("调节食物数值并查看提示","饥饿与饱和度的字段含义清楚，数字调整顺手"),
 "consumable":("展开使用动作，试听或选择音效","动作与音效菜单清楚，试听状态容易辨认"),
 "use_cooldown":("调整冷却时长并打开分组输入","时长单位明确，分组输入不会占据过大区块"),
 "equippable":("打开装备槽和资源候选，再看预览","槽位选中态清楚，较长资源名可读"),
 "trim":("切换纹饰材质与图案，查看盔甲预览","两个候选控件容易区分，预览纹饰清楚"),
 "container":("展开容器格并拖放临时物品","格子、悬停高亮、拖放反馈和数量标识清楚"),
 "bundle_contents":("增减收纳袋内容并看容量提示","物品格和容量变化一目了然，满容量提示清楚"),
 "written_book_content":("切换书页并输入多行中文","页码、文字换行和翻页反馈清楚，内容不溢出")
}
for cat in data["cats"]:
    for c in data["comps"]:
        if c["cat"]!=cat["id"] or c["id"] not in common:continue
        x=byid[c["id"]];state="自动三轮通过" if x["success"]==3 else "自动证据未全通过"
        action,see=visual[c["id"]]
        check.append(f'|{cat["name"]} / {c["name"]}（{state}）|{action}|{see}|')
(out/"CHECKLIST-for-user.md").write_text("\n".join(check)+"\n",encoding="utf-8")
print("acceptance "+json.dumps(summary,ensure_ascii=False))

