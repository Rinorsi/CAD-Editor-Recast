"""Refresh preview names from an actual mapped Minecraft JAR, never from a UI term list.
Usage: python tools/i18n-vanilla.py path/to/minecraft-26.1.2.jar
Live registries still supply every in-game name. No game data values are changed.
"""
import hashlib,json,pathlib,sys,zipfile
root=pathlib.Path(__file__).resolve().parent.parent
with zipfile.ZipFile(sys.argv[1]) as jar:
    raw=jar.read('assets/minecraft/lang/en_us.json')
language=json.loads(raw)
script=(root/'common/src/main/resources/assets/cadeditor/ui/js/data.js').read_text(encoding='utf8')
data=json.loads(script.split('var EDATA = ',1)[1].strip().rstrip(';'))
bindings=[]
def bind(path,key):
    if key in language:bindings.append({'path':path,'key':key,'text':language[key]})
for id in data['iname']:
    key='item.minecraft.'+id
    if key not in language:key='block.minecraft.'+id
    bind(['iname',id],key)
for group,prefix in [('enchants','enchantment.minecraft.'),('attrs','attribute.name.'),('effects','effect.minecraft.')]:
    for i,row in enumerate(data[group]):bind([group,i,'name'],prefix+row['id'])
prefixes={'trimMaterial':'trim_material.minecraft.','trimPattern':'trim_pattern.minecraft.','instrument':'instrument.minecraft.','potion':'item.minecraft.potion.effect.','color':'color.minecraft.','banner':'block.minecraft.banner.'}
for group,rows in data['L'].items():
    for id in rows:bind(['L',group,id],prefixes[group]+id)
out={'source':'Minecraft 26.1.2 assets/minecraft/lang/en_us.json','sha256':hashlib.sha256(raw).hexdigest(),'bindings':bindings}
(root/'tools/i18n-vanilla-en.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Generated',len(bindings),'authoritative preview names')
