"""Audit final Editor jars, without requiring Gradle or the Oriel source tree."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import tomllib
import zipfile


def audit(path, mode, inputs):
    with zipfile.ZipFile(path) as jar:
        names = jar.namelist()
        assert 'assets/cadeditor/ui/index.html' in names, 'Editor page missing'
        assert 'NOTICE' in names, 'Editor third-party notice missing'
        forbidden = [n for n in names if re.search(
            r'(?:^|/)(?:test-vault|dev-sources[.]properties|java[.]args)(?:/|$)|'
            r'(?:clientonly|autotest|matrixsmoke|backendprobe|mctest)', n, re.I)]
        assert not forbidden, f'development entries: {forbidden}'
        if 'fabric.mod.json' in names:
            loader = 'fabric'
            meta = json.loads(jar.read('fabric.mod.json'))
            assert meta['id'] == 'cadeditor'
            assert meta['depends']['oriel'] == '>=0.15.0 <0.16.0'
            declared = [x['file'] for x in meta.get('jars', [])]
        else:
            loader = 'neoforge'
            meta = tomllib.loads(jar.read('META-INF/neoforge.mods.toml').decode())
            assert meta['mods'][0]['modId'] == 'cadeditor'
            dep = next(d for d in meta['dependencies']['cadeditor'] if d['modId'] == 'oriel')
            assert dep['versionRange'] == '[0.15.0,0.16.0)'
            declared = []
            if 'META-INF/jarjar/metadata.json' in names:
                entries = json.loads(jar.read('META-INF/jarjar/metadata.json'))['jars']
                for entry in entries:
                    if entry['identifier']['group'] == 'dev.oriel':
                        assert entry['version']['range'] == '[0.15.0,0.16.0)'
                        assert entry['version']['artifactVersion'] == '0.15.0'
                        declared.append(entry['path'])
        nested = [n for n in names if n.endswith('.jar')]
        if mode == 'external':
            assert not nested and not declared, 'external jar retains nested dependency'
        else:
            assert len(nested) == 1 and declared == nested, (declared, nested)
            data = jar.read(nested[0])
            digest = hashlib.sha256(data).hexdigest()
            matches = [i for i in inputs if i['loader'] == loader and i['sha256'] == digest]
            assert len(matches) == 1, 'nested jar differs from audited frozen slim input'
            assert matches[0]['mc'] in path.name, 'wrong Minecraft variant embedded'
            with zipfile.ZipFile(io.BytesIO(data)) as inner:
                entries = inner.namelist()
                assert 'assets/oriel/ui/ore.css' in entries
                assert 'dev/oriel/mod/client/OrielScreens.class' in entries
                assert 'META-INF/licenses/rhino/LICENSE.txt' in entries
                assert 'META-INF/licenses/rhino/SOURCE.txt' in entries
                assert any(n.startswith('META-INF/licenses/fonts/') for n in entries)
                assert any('NOTICE' in n for n in entries)
                assert any('LICENSE' in n for n in entries)
        return dict(file=str(path.resolve()), mode=mode, loader=loader,
                    bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                    nested=nested, status='PASS')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['embedded', 'external'], required=True)
    parser.add_argument('--inputs', type=Path, required=True)
    parser.add_argument('jars', nargs='+', type=Path)
    args = parser.parse_args()
    inputs = json.loads(args.inputs.read_text(encoding='utf-8-sig'))
    print(json.dumps([audit(p, args.mode, inputs) for p in args.jars], indent=2))
