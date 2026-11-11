"""Static source/language inventory. Does not run UI, tests, builds or Minecraft."""
import argparse
import collections
import json
import pathlib

parser = argparse.ArgumentParser()
parser.add_argument('--assets', type=pathlib.Path, required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent.parent
ui = root / 'common/src/main/resources/assets/cadeditor/ui/js'
reverse = collections.defaultdict(set)
sources = []
for index in sorted((args.assets / 'indexes').glob('26.*.json')):
    entry = json.loads(index.read_text(encoding='utf-8'))['objects'].get('minecraft/lang/zh_cn.json')
    if not entry:
        continue
    digest = entry['hash']
    lang = json.loads((args.assets / 'objects' / digest[:2] / digest).read_text(encoding='utf-8'))
    sources.append({'index': index.name, 'zh_cn_sha1': digest, 'keys': len(lang), 'rarity_keys': [k for k in lang if k.startswith('rarity.')]})
    for key, value in lang.items():
        reverse[value].add(key)
records = []
counts = collections.Counter()
preview = 0
newline = chr(10)
for path in sorted(ui.glob('*.js')):
    if path.name == 'pinyin-data.js':
        continue
    text = path.read_text(encoding='utf-8-sig')
    i = 0
    while i < len(text):
        if text.startswith('//', i):
            end = text.find(newline, i)
            i = len(text) if end < 0 else end + 1
            continue
        if text.startswith('/*', i):
            end = text.find('*/', i + 2)
            i = len(text) if end < 0 else end + 2
            continue
        if text[i] not in (chr(39), chr(34)):
            i += 1
            continue
        start = i
        quote = text[i]
        i += 1
        while i < len(text):
            if text[i] == chr(92):
                i += 2
                continue
            if text[i] == quote:
                break
            i += 1
        value = text[start + 1:i]
        i += 1
        if not any(0x3400 <= ord(c) <= 0x9fff for c in value):
            continue
        if path.name == 'data.js':
            preview += 1
            continue
        counts[path.name] += 1
        records.append({'file': path.relative_to(root).as_posix(), 'line': text.count(newline, 0, start) + 1, 'literal': value, 'exact_game_keys': sorted(reverse.get(value, []))})
labels = (ui / 'labels.js').read_text(encoding='utf-8-sig')
groups = [line.split('Labels.', 1)[1].split('=', 1)[0].strip() for line in labels.splitlines() if line.startswith('Labels.') and '=' in line]
summary = {'kind':'static-lexical-inventory-not-JS-parser-or-runtime-validation', 'date':'2026-11-10', 'language_sources':sources, 'chinese_literal_occurrences':len(records), 'files':len(counts), 'exact_official_text_matches':sum(bool(r['exact_game_keys']) for r in records), 'preview_data_literal_occurrences':preview, 'label_groups':groups, 'per_file':dict(counts)}
report = dict(summary, entries=records)
(root / 'docs/locale-inventory.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + newline, encoding='utf-8')
lines = ['# 译名与 i18n 源码清单', '', '日期：2026-11-10。仅静态读取源码和缓存原版语言文件，未运行测试、构建或游戏。', '', f'- 页面源码（不含样例 data.js）有 {len(records)} 处含中文字符串，分布在 {len(counts)} 个文件。', f"- 其中 {summary['exact_official_text_matches']} 处原文与原版语言包条目相同；仅是复用候选，不能据文字相同绑定无关键。", f'- data.js 有 {preview} 处，单列为浏览器样例。', f'- labels.js 集中定义 {len(groups)} 组标签/配置。', '', '这是字符串词法清单，不是完整 JS 语法分析或错误译名计数；包含编辑器按钮、说明、诊断、回退及格式片段。完整位置与原文见 locale-inventory.json。', '', '## 本轮已修正', '', '- uncommon：优秀 → 少见；common：普通 → 常见。rare 仍为稀有，epic 仍为史诗。卡片、表单和摘要统一来源。', '- 实时游戏枚举译文优先，修复手写标签覆盖译名的问题。', '- 游戏模式 4 项使用 gameMode.*；装备属性生效位置 11 项使用 item.modifiers.*。', '- 热带鱼图案、烟花形状、染料/文本颜色使用语义匹配的游戏键。', '- 方块名称先取 block 注册表，避免 carrots 被英文物品回退名抢先覆盖。', '- powered 字段标签按要求改为激活，NBT 字段名不变。', '', '## 本地文案与尚未迁移的类别', '', '- 方块状态名及值、NBT 行为开关和实体字段说明：原版通常没有直接对应的语言键。', '- 属性运算短名、候选分类、附魔标签分类、保险库分区属于本地操作文案。', '- 稀有度：三版 zh_cn.json 没有 rarity.*；使用 Wiki 术语回退，资源包提供真实译文时优先读取。', '- 装备槽短名仍有本地标签；生效位置整句已改用游戏语言键。', '- 页面标题、按钮、设置和诊断仍有直接中文；项目尚未完成整套界面的多语言化。', '', '## 权威名称的现有路径', '', '物品、方块、实体、附魔、属性和效果等候选来自当前游戏实时注册表/description；不得用 data.js 或手写别名覆盖实时译文。', '', '## 语言文件', '', '| 版本索引 | zh_cn SHA-1 | 键数 | rarity.* 键数 |', '|---|---|---:|---:|']
for source in sources:
    lines.append(f"| {source['index']} | {source['zh_cn_sha1']} | {source['keys']} | {len(source['rarity_keys'])} |")
lines += ['', '## 文件分布', '', '| 文件 | 含中文字符串出现次数 |', '|---|---:|']
lines += [f'| {name} | {count} |' for name, count in counts.most_common()]
lines += ['', '## 参考', '', '- https://zh.minecraft.wiki/w/稀有度', '- https://zh.minecraft.wiki/w/鳕鱼桶', '- https://zh.minecraft.wiki/w/刷怪蛋', '', 'Wiki 为术语/机制参考，具体版本行为以实际游戏源码与运行时为准。']
(root / 'docs/LOCALE-AUDIT.md').write_text(newline.join(lines) + newline, encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False))
