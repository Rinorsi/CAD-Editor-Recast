#!/usr/bin/env python3
# 一次性迁移工具：把分散在各文件里的中文标签字典原样搬进 js/labels.js，原位置换成别名。
# 文字逐字搬运，不改文案。用法：python tools/lib/migrate-labels.py
import io, os, re, sys
UI = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'fabric', 'src', 'main', 'resources', 'assets', 'cadeditor', 'ui', 'js')
# (文件, 原全局名, Labels 里的新名)
MOVES = [
  ('forms.js', 'SLOT_ZH', 'slot'), ('screens.js', 'SLOT_HEAD', 'slotHead'), ('worldplayer.js', 'WP_EQ', 'slotEquip'),
  ('eschema.js', 'ES_SLOT', 'slotGear'), ('cards2.js', 'EQ_SLOTS', 'slotChoices'), ('cards2.js', 'ATTR_SLOT_ICON', 'slotIcon'), ('cards2.js', 'PIECE_ID', 'armorPiece'),
  ('forms.js', 'RARITY', 'rarity'),
  ('forms.js', 'OPS', 'opShort'), ('cards2.js', 'OPMODES', 'opLong'),
  ('worldplayer.js', 'WP_MODE', 'mode'), ('worldedit.js', 'WE_DIM', 'dim'),
  ('eschema.js', 'ES_VARIANT', 'entVariant'), ('eschema.js', 'ES_FLAG', 'entFlag'),
  ('worldview.js', 'WE_PROP', 'blockProp'), ('worldview.js', 'WE_VAL', 'blockVal'), ('picker.js', 'ENCH_TAG_ZH', 'enchTag'),
]
def rd(p):
    with io.open(p, encoding='utf-8', newline='') as f: return f.read()
def wr(p, t):
    with io.open(p, 'w', encoding='utf-8', newline='') as f: f.write(t)
def extract(text, name):
    m = re.search(r'(^|\n)var ' + re.escape(name) + r' = ', text)
    if not m: raise SystemExit('找不到 ' + name)
    start = m.start() + len(m.group(1)); i = m.end(); depth = 0; q = None
    while i < len(text):
        ch = text[i]
        if q:
            if ch == '\\': i += 2; continue
            if ch == q: q = None
        elif ch in '\'"': q = ch
        elif ch in '([{': depth += 1
        elif ch in ')]}': depth -= 1
        elif ch == ';' and depth == 0: break
        i += 1
    end = i + 1
    return start, end, text[m.end():i]
parts = []; cache = {}
for fn, old, new in MOVES:
    p = os.path.join(UI, fn); t = cache.get(fn) or rd(p)
    s, e, lit = extract(t, old)
    parts.append((new, old, lit.strip()))
    t = t[:s] + 'var ' + old + ' = Labels.' + new + ';' + t[e:]
    cache[fn] = t
for fn, t in cache.items(): wr(os.path.join(UI, fn), t)
out = ['/* 中文标签字典：槽位、稀有度、属性操作、游戏模式、维度、生物变种与开关、方块状态……全部放在这一个文件里。',
       '   只放「界面文字」；游戏里有的名字（物品、方块、实体、附魔……）仍然来自实时注册表，不在这里手写。',
       '   各页面里保留原来的全局名（SLOT_ZH、OPS 等）作别名，指向这里的同一个对象。',
       '   同一概念有两种措辞的（如槽位的「头部 / 头盔」、属性操作的「加值 / 加固定值」）是界面里不同位置用的，分开存放，不要合并措辞。 */',
       'var Labels = {};']
for new, old, lit in parts:
    out.append('/* ' + old + ' */'); out.append('Labels.' + new + ' = ' + lit + ';')
out.append("/* 稀有度的短名：由 Labels.rarity 派生，不再单独手写一份（原 pages.js 的 RARITY_ZH） */")
out.append("Labels.rarityZh = {}; (function () { for (var i = 0; i < Labels.rarity.length; i++) Labels.rarityZh[Labels.rarity[i].v] = Labels.rarity[i].label; })();")
wr(os.path.join(UI, 'labels.js'), '\n'.join(out) + '\n')
print('moved', len(parts))
