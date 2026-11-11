"""Capture the current Editor UI with Oriel's headless renderer (no game launched)."""
from datetime import date
from pathlib import Path
import json
import os
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ORIEL = ROOT.parent / 'Oriel-UI'
DAY = ROOT.parent / 'Oriel-UI-Workspace/daily' / date.today().isoformat()
WORK = DAY / 'scratch/editor-readme-captures'
OUT = DAY / 'screenshots/editor-readme'
LOGS = DAY / 'logs/editor-readme'
JAVA = Path(os.environ.get('JAVA_HOME', str(Path.home() / '.jdks/jdk-25.0.5+8'))) / 'bin/java.exe'
ENV = dict(os.environ, ORIEL_MC_JAR=str(ORIEL / 'common/versions/26.1/build/moddev/artifacts/vanilla-26.1.2-1-merged.jar'))

sword = dict(id='minecraft:diamond_sword', count=1, comps={
    'custom_name': dict(text='星辉', color='#70d5e8', italic=False),
    'lore': [dict(text='穿越长夜，直至黎明。', color='gray', italic=False)],
    'rarity': 'epic', 'enchantments': {'minecraft:sharpness': 5, 'minecraft:unbreaking': 3},
    'unbreakable': {}, 'enchantment_glint_override': True,
})
potion = dict(id='minecraft:potion', count=1, comps={
    'custom_name': dict(text='远行药水', color='#b4a2ef', italic=False),
    'potion_contents': {'custom_color': 11809519, 'custom_effects': [
        {'id': 'minecraft:speed', 'amplifier': 1, 'duration': 3600},
        {'id': 'minecraft:night_vision', 'amplifier': 0, 'duration': -1},
    ]},
})
SCENES = [
    ('item-editor', sword, 'look', ['name', 'lore']),
    ('potion-effects', potion, 'potion', ['potion']),
    ('snbt-editor', sword, 'item-stack', []),
]

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    LOGS.mkdir(parents=True, exist_ok=True)
    for name, stack, tab, expanded in SCENES:
        if len(sys.argv) > 1 and name not in sys.argv[1:]:
            continue
        pack = WORK / name / 'pack/assets'
        page = pack / 'cadeditor/ui'
        shutil.copytree(ROOT / 'common/src/main/resources/assets/cadeditor/ui', page, dirs_exist_ok=True)
        shutil.copytree(ORIEL / 'kit/src/main/resources/assets/oriel', pack / 'oriel', dirs_exist_ok=True)
        fixture = 'window.EDITOR_PREVIEW=true; var ORIEL_STACK=' + json.dumps(dict(stack, removed={}, slot={'kind': 'preview', 'index': 0}), ensure_ascii=False) + ';'
        (page / 'readme-fixture.js').write_text(fixture, encoding='utf-8')
        post = """setTimeout(function(){
          UI.maxed=true; UI.tab=TAB; UI.cmdFmt='snbt'; rebuild();
          (UI.page && UI.page.cards || []).forEach(function(card){
            var expanded=EXPANDED;
            if(card.setCollapsed && (expanded===null || expanded.indexOf(card.spec.id)>=0)) card.setCollapsed(false);
          });
          if(UI.tab==='potion') openDetail({key:'potion',cid:'potion_contents',title:'药水效果'});
        },100);""".replace('TAB', json.dumps(tab)).replace('EXPANDED', json.dumps(expanded))
        (page / 'readme-scene.js').write_text(post, encoding='utf-8')
        html = (page / 'index.html').read_text(encoding='utf-8').replace(
            '<script src="js/app.js"></script>',
            '<script src="readme-fixture.js"></script><script src="js/app.js"></script><script src="readme-scene.js"></script>')
        (page / 'index.html').write_text(html, encoding='utf-8')
        log = LOGS / ('capture-' + name + '.log')
        cmd = [str(JAVA), '-Xmx1G', '-XX:CompileThresholdScaling=0.1', '-cp', str(ORIEL / 'preview/build/install/preview/lib/*'),
               'dev.oriel.preview.Preview', str(page / 'index.html'), '--size', '840x560',
               '--scale', '2', '--frames', '45', '--snapshot', str(OUT / (name + '.png'))]
        with log.open('w', encoding='utf-8') as output:
            result = subprocess.run(cmd, cwd=ROOT, env=ENV, stdout=output, stderr=subprocess.STDOUT)
        print(('PASS' if result.returncode == 0 else 'FAIL') + ' | ' + name + ' | ' + str(log), flush=True)
        if result.returncode:
            raise SystemExit(result.returncode)
    print('Screenshots: ' + str(OUT))

if __name__ == '__main__':
    main()
