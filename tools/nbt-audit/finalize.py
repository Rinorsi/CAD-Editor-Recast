"""Assemble the dated audit evidence; never rebuild or modify a released jar."""
import hashlib
import json
import pathlib
import shutil
import sys
import zipfile

root = pathlib.Path(__file__).resolve().parents[2]
evidence = pathlib.Path(sys.argv[1]).resolve()
ui = json.loads((evidence / 'ui-roundtrip.json').read_text(encoding='utf-8'))
native = json.loads((evidence / 'native-roundtrip.json').read_text(encoding='utf-8'))
index = json.loads((evidence / 'boundary-index.json').read_text(encoding='utf-8'))
assert ui['counts']['HARNESS_ERROR'] == 0 and native['harnessErrors'] == 0
matrix = [c for c in ui['cases'] if c['id'].startswith('matrix-')]
assert len(matrix) == 84 and len(ui['cases']) == 112
routes = ['ast', 'baseline', 'import', 'export', 'copy', 'vault', 'draft']
types = list(dict.fromkeys(c['id'].removeprefix('matrix-').rsplit('-', 1)[0] for c in matrix))
lookup = {c['id']: c['status'] for c in matrix}
lines = ['# 12 种 NBT 类型往返矩阵', '',
         '这是生产前端函数的固定样本测试，不是全量 Minecraft 实机结果。FAIL 没有修复。', '',
         '| 类型 | 原始 AST | 旧类型基线 | 命令导入 | 命令导出 | 复制组件 | 单件保险库嵌套 | 草稿重开 |',
         '| --- | --- | --- | --- | --- | --- | --- | --- |']
for kind in types:
    lines.append('| ' + ' | '.join([kind] + [lookup[f'matrix-{kind}-{r}'] for r in routes]) + ' |')
lines += ['', '复合对象/列表样本内含带类型子值；它们的 FAIL 表示子节点类型丢失。',
          '单件保险库样本通过不覆盖多件同值不同类型碰撞，后者见针对性用例 04。',
          'TAG_End 是容器终止标记，不是可编辑值。', '']
(evidence / 'type-matrix.md').write_text('\n'.join(lines), encoding='utf-8')
release = root / 'dist/editor-0.99.5-testfix-20261109'
assets = root / 'common/src/main/resources/assets/cadeditor/ui'
scripts = list(assets.rglob('*.js'))
artifacts = []
for jar in sorted(release.glob('*.jar')):
    mismatches = []
    with zipfile.ZipFile(jar) as z:
        for f in scripts:
            name = 'assets/cadeditor/ui/' + f.relative_to(assets).as_posix()
            try:
                if z.read(name) != f.read_bytes():
                    mismatches.append(name)
            except KeyError:
                mismatches.append(name + ' [missing]')
    artifacts.append({'file': str(jar), 'size': jar.stat().st_size,
                      'sha256': hashlib.sha256(jar.read_bytes()).hexdigest(),
                      'uiScriptsCompared': len(scripts), 'uiMismatches': mismatches})
assert len(artifacts) == 6, 'Expected six existing release jars, not a rebuilt set'
provenance = {'scope': 'UI source vs six existing jars, exact native execution jar, no release changes',
              'nativeExecutionJar': 'cadeditor-fabric-26.1.2-0.99.5.jar',
              'sourceFilesIndexed': index['sourceFiles'], 'boundaryLines': index['matches'],
              'artifacts': artifacts,
              'auditScripts': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                               for p in pathlib.Path(__file__).parent.iterdir() if p.is_file()}}
(evidence / 'provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding='utf-8')
shutil.copyfile(root / 'docs/NBT-ROUNDTRIP-AUDIT-2026-11-09.md', evidence / 'audit.md')
bad = [a for a in artifacts if a['uiMismatches']]
print(f'{"FAIL" if bad else "PASS"} audit archive: {len(types)} NBT types x {len(routes)} routes; '
      f'6 jars x {len(scripts)} UI scripts; mismatched jars={len(bad)}; {evidence / "provenance.json"}')
if bad:
    print(json.dumps(bad, ensure_ascii=False))
    sys.exit(1)
