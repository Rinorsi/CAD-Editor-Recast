"""Capture the current Editor UI with Oriel's headless renderer (no game launched)."""
from datetime import date
from pathlib import Path
import argparse
import copy
import json
import os
import shutil
import subprocess

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
book = dict(id='minecraft:writable_book', count=1, comps={
    'custom_name': dict(text='Field Notes', color='gold', italic=False),
    'writable_book_content': {'pages': [
        {'raw': 'Field Notes\n\nWelcome to the valley.\n\nBuild, explore, and make it your own.'},
        {'raw': 'The Old Workshop\n\nFollow the lanterns beyond the river to find the village workshop.'},
    ]},
})
SCENES = [
    ('item-editor', sword, 'look', ['name', 'lore']),
    ('potion-effects', potion, 'potion', ['potion']),
    ('snbt-editor', sword, 'item-stack', []),
    ('book-editor', book, 'text', ['wbook']),
    ('sign-editor', sword, 'look', []),
    ('mob-editor', sword, 'look', []),
    ('villager-trades', sword, 'look', []),
    ('spawner-editor', sword, 'look', []),
]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--locale', choices=('zh_cn', 'en_us'), default='zh_cn')
    parser.add_argument('scenes', nargs='*', help='Optional scene names: ' + ', '.join(s[0] for s in SCENES))
    args = parser.parse_args()
    unknown = set(args.scenes) - {scene[0] for scene in SCENES}
    if unknown:
        parser.error('Unknown scenes: ' + ', '.join(sorted(unknown)))
    out = OUT / args.locale if args.locale != 'zh_cn' else OUT
    logs = LOGS / args.locale
    out.mkdir(parents=True, exist_ok=True)
    logs.mkdir(parents=True, exist_ok=True)
    for name, stack, tab, expanded in SCENES:
        if args.scenes and name not in args.scenes:
            continue
        stack = copy.deepcopy(stack)
        if args.locale == 'en_us' and name in ('item-editor', 'potion-effects', 'snbt-editor'):
            stack['comps']['custom_name']['text'] = 'Wayfarer' if name == 'potion-effects' else 'Starlight'
            if 'lore' in stack['comps']:
                stack['comps']['lore'][0]['text'] = 'Through the night, until dawn.'
        pack = WORK / args.locale / name / 'pack/assets'
        page = pack / 'cadeditor/ui'
        shutil.copytree(ROOT / 'common/src/main/resources/assets/cadeditor/ui', page, dirs_exist_ok=True)
        shutil.copytree(ORIEL / 'kit/src/main/resources/assets/oriel', pack / 'oriel', dirs_exist_ok=True)
        shutil.copyfile(ROOT / 'tools/preview/gallery-scenes.js', page / 'gallery-scenes.js')
        fixture = 'window.EDITOR_PREVIEW=true; var ORIEL_STACK=' + json.dumps(dict(stack, removed={}, slot={'kind': 'preview', 'index': 0}), ensure_ascii=False) + ';'
        (page / 'readme-fixture.js').write_text(fixture, encoding='utf-8')
        post = """setTimeout(function(){
          UI.maxed=true; UI.tab=TAB; UI.cmdFmt='snbt'; rebuild();
          (UI.page && UI.page.cards || []).forEach(function(card){
            var expanded=EXPANDED;
            if(card.setCollapsed && (expanded===null || expanded.indexOf(card.spec.id)>=0)) card.setCollapsed(false);
          });
          if(UI.tab==='potion') openDetail({key:'potion',cid:'potion_contents',title:I18n.t('cadeditor.ui.cards1.c6e6590c45')});
          galleryScene(SCENE);
        },100);""".replace('TAB', json.dumps(tab)).replace('EXPANDED', json.dumps(expanded)).replace('SCENE', json.dumps(name))
        (page / 'readme-scene.js').write_text(post, encoding='utf-8')
        html = (page / 'index.html').read_text(encoding='utf-8').replace(
            '<script src="js/app.js"></script>',
            '<script src="readme-fixture.js"></script><script src="js/app.js"></script><script src="gallery-scenes.js"></script><script src="readme-scene.js"></script>')
        (page / 'index.html').write_text(html, encoding='utf-8')
        data = page / 'readme-data.json'
        data.write_text(json.dumps({'uiLocale': args.locale}), encoding='utf-8')
        log = logs / ('capture-' + name + '.log')
        cmd = [str(JAVA), '-Xmx1G', '-XX:CompileThresholdScaling=0.1', '-cp', str(ORIEL / 'preview/build/install/preview/lib/*'),
               'dev.oriel.preview.Preview', str(page / 'index.html'), '--size', '1400x900' if name == 'spawner-editor' else '840x560',
               '--lang', args.locale, '--data', str(data),
               '--scale', '2', '--frames', '24' if name in ('book-editor', 'spawner-editor') else '45', '--snapshot', str(out / (name + '.png'))]
        with log.open('w', encoding='utf-8') as output:
            result = subprocess.run(cmd, cwd=ROOT, env=ENV, stdout=output, stderr=subprocess.STDOUT)
        print(('PASS' if result.returncode == 0 else 'FAIL') + ' | ' + name + ' | ' + str(log), flush=True)
        if result.returncode:
            raise SystemExit(result.returncode)
    print('Screenshots: ' + str(out))

if __name__ == '__main__':
    main()
