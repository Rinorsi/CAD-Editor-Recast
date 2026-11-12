"""Upload six existing CAD Editor jars as private Modrinth draft versions.

Never edits projects, publishes versions, creates tags or creates releases.
Python 3.11+ standard library only; tokens stay in environment or hidden input.
"""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tomllib
import urllib.error
import urllib.request
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PROJECT_ID = 'MJW1h2CF'
PROJECT_SLUG = 'cad-editor'
OWNER = 'Rinorsi'
API = 'https://api.modrinth.com/v2'
TARGETS = [(loader, mc) for loader in ('fabric', 'neoforge')
           for mc in ('26.1.2', '26.2', '26.3')]


class DraftError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise DraftError('API 重定向已停止，凭据未转发。')


class Client:
    def __init__(self, token):
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, method, path, payload=None, content_type='application/json'):
        if not path.startswith('/') or path.startswith('//'):
            raise DraftError('无效 API 路径。')
        headers = {'User-Agent': 'Rinorsi/CAD-Editor-draft-uploader (github.com/Rinorsi/CAD-Editor-Recast)',
                   'Accept': 'application/json'}
        if self.token:
            headers['Authorization'] = self.token
        data = json.dumps(payload, ensure_ascii=False).encode() if isinstance(payload, dict) else payload
        if data is not None:
            headers['Content-Type'] = content_type
        req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=180) as response:
                body = response.read()
                return json.loads(body) if body else None
        except urllib.error.HTTPError as e:
            detail = e.read(2000).decode('utf-8', 'replace')
            if self.token:
                detail = detail.replace(self.token, '[REDACTED]')
            raise DraftError(f'Modrinth {method} {path} 返回 HTTP {e.code}: {detail}') from None
        except (OSError, ValueError) as e:
            # A timed-out POST may have committed. Never automatically retry a write.
            raise DraftError(f'Modrinth {method} {path} 未取得确定回执（{type(e).__name__}）。'
                             '请重新运行脚本核对远端；脚本会按版本号和文件哈希识别已上传内容。') from None


def properties():
    return dict(line.split('=', 1) for line in
                (ROOT / 'gradle.properties').read_text(encoding='utf-8').splitlines()
                if '=' in line and not line.lstrip().startswith('#'))


def release_notes(version):
    text = (ROOT / 'CHANGELOG.md').read_text(encoding='utf-8')
    match = re.search(r'^## ' + re.escape(version) + r'(?:[ \t][^\n]*)?\n(.*?)(?=^## |\Z)',
                      text, re.M | re.S)
    if not match or not match.group(1).strip():
        raise DraftError(f'CHANGELOG.md 缺少 {version} 的更新日志。')
    return match.group(1).strip()


def prepare(directory, version):
    expected = {f'cadeditor-{loader}-{mc}-{version}.jar' for loader, mc in TARGETS}
    actual = {p.name for p in directory.glob('*.jar')}
    if actual != expected:
        raise DraftError(f'发行目录必须恰好包含六个目标 JAR。缺少：{sorted(expected-actual)}；'
                         f'额外：{sorted(actual-expected)}')
    sums = directory / 'SHA256SUMS.txt'
    manifest = {}
    if sums.exists():
        for line in sums.read_text(encoding='utf-8-sig').splitlines():
            if line.strip():
                digest, name = line.split(maxsplit=1)
                name = name.lstrip('*')
                if name in manifest:
                    raise DraftError(f'校验清单有重复文件：{name}')
                manifest[name] = digest.lower()
        if set(manifest) != expected:
            raise DraftError('SHA256SUMS.txt 与六目标文件清单不一致。')
    result = []
    for loader, mc in TARGETS:
        path = directory / f'cadeditor-{loader}-{mc}-{version}.jar'
        data = path.read_bytes()
        sha256 = hashlib.sha256(data).hexdigest()
        if manifest and manifest[path.name] != sha256:
            raise DraftError(f'SHA256 校验失败：{path.name}')
        with zipfile.ZipFile(path) as jar:
            if loader == 'fabric':
                meta = json.loads(jar.read('fabric.mod.json'))
                mod_id, jar_version = meta['id'], meta['version']
                nested = [x['file'] for x in meta.get('jars', [])]
                embedded_project = meta.get('custom', {}).get('modrinth', {}).get('project-id')
            else:
                meta = tomllib.loads(jar.read('META-INF/neoforge.mods.toml').decode())
                mod = next(m for m in meta['mods'] if m['modId'] == 'cadeditor')
                mod_id, jar_version = mod['modId'], mod['version']
                nested_meta = json.loads(jar.read('META-INF/jarjar/metadata.json'))
                nested = [x['path'] for x in nested_meta['jars']]
                embedded_project = None
            if mod_id != 'cadeditor' or jar_version != version:
                raise DraftError(f'包内模组身份或版本不匹配：{path.name}')
            if embedded_project and embedded_project != PROJECT_ID:
                raise DraftError(f'包内 Modrinth 链接仍指向其他项目，请重新构建：{path.name}')
            if not any('oriel' in n.lower() and n in jar.namelist() for n in nested):
                raise DraftError(f'缺少内嵌 Oriel：{path.name}')
            if jar.read('assets/cadeditor/CHANGELOG.md') != (ROOT / 'CHANGELOG.md').read_bytes():
                raise DraftError(f'包内更新日志与源码不同：{path.name}')
        result.append({'path': path, 'loader': loader, 'mc': mc, 'sha256': sha256,
                       'sha512': hashlib.sha512(data).hexdigest(),
                       'version_number': f'{version}+{loader}-{mc}'})
    return result


def multipart(metadata, path):
    boundary = 'cadeditor-' + uuid.uuid4().hex
    prefix = (f'--{boundary}\r\nContent-Disposition: form-data; name="data"\r\n'
              'Content-Type: application/json\r\n\r\n'
              + json.dumps(metadata, ensure_ascii=False)
              + f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; '
              + f'filename="{path.name}"\r\nContent-Type: application/java-archive\r\n\r\n')
    body = prefix.encode() + path.read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
    return body, 'multipart/form-data; boundary=' + boundary


def validate_remote(remote, item):
    if (remote.get('project_id') != PROJECT_ID or remote.get('status') != 'draft'
            or remote.get('requested_status') not in (None, 'draft')
            or remote.get('version_number') != item['version_number']
            or remote.get('loaders') != [item['loader']]
            or remote.get('game_versions') != [item['mc']]):
        raise DraftError(f'远端版本不是对应的草稿，请人工核对：{item["version_number"]}')
    files = remote.get('files', [])
    if len(files) != 1 or files[0].get('hashes', {}).get('sha512') != item['sha512']:
        raise DraftError(f'远端同名版本文件不同，已停止且不会覆盖：{item["version_number"]}')


def upload(client, items, version, notes, record):
    user = client.request('GET', '/user')
    if user.get('username') != OWNER:
        raise DraftError(f'当前 Modrinth 账号不是 {OWNER}，已停止。')
    project = client.request('GET', '/project/' + PROJECT_ID)
    if project.get('id') != PROJECT_ID or project.get('slug') != PROJECT_SLUG:
        raise DraftError('原 CAD Editor 项目身份不匹配，已停止。')
    initial_status = project.get('status')
    versions = client.request('GET', '/project/' + PROJECT_ID + '/version')
    by_number = {}
    for remote in versions:
        by_number.setdefault(remote.get('version_number'), []).append(remote)
    # Resolve every conflict before the first write; published versions are not overwritten.
    for item in items:
        same = by_number.get(item['version_number'], [])
        if len(same) > 1:
            raise DraftError(f'远端有多个同名版本，请人工核对：{item["version_number"]}')
        if same:
            validate_remote(same[0], item)
    fabric = client.request('GET', '/project/fabric-api')
    if fabric.get('slug') != 'fabric-api' or not fabric.get('id'):
        raise DraftError('无法确认 Fabric API 前置项目。')
    for item in items:
        same = by_number.get(item['version_number'], [])
        if same:
            remote, action = same[0], 'already_exists'
        else:
            metadata = {
                'project_id': PROJECT_ID,
                'name': f'CAD Editor Recast {version} ({item["loader"]} {item["mc"]})',
                'version_number': item['version_number'], 'changelog': notes,
                'game_versions': [item['mc']], 'loaders': [item['loader']],
                'version_type': 'beta', 'featured': False, 'status': 'draft',
                'environment': 'client_only_server_optional',
                'file_parts': ['file'], 'primary_file': 'file',
                'dependencies': ([{'project_id': fabric['id'], 'dependency_type': 'required'}]
                                 if item['loader'] == 'fabric' else []),
            }
            body, content_type = multipart(metadata, item['path'])
            remote = client.request('POST', '/version', body, content_type)
            validate_remote(remote, item)
            action = 'created'
        confirmed = client.request('GET', '/version/' + remote['id'])
        validate_remote(confirmed, item)
        record['versions'].append({'id': confirmed['id'], 'version_number': item['version_number'],
                                   'status': confirmed['status'], 'sha256': item['sha256'],
                                   'sha512': item['sha512'], 'action': action,
                                   'url': f'https://modrinth.com/mod/{PROJECT_SLUG}/version/{confirmed["id"]}'})
        save_record(record)
        print(f'已核对草稿：{item["version_number"]} → {confirmed["id"]}', flush=True)
    after = client.request('GET', '/project/' + PROJECT_ID)
    if after.get('status') != initial_status:
        raise DraftError('项目状态发生变化，请在 Modrinth 核对；本脚本未发送项目修改请求。')
    record['project_status'] = after['status']


def save_record(record):
    path = Path(record['receipt_path'])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact-dir', type=Path, required=True)
    parser.add_argument('--apply', action='store_true', help='Upload drafts; default is local validation only')
    parser.add_argument('--prompt-token', action='store_true', help='Hidden token input if absent from environment')
    parser.add_argument('--receipt', type=Path, default=ROOT / 'logs/modrinth/draft-upload.json')
    args = parser.parse_args()
    token = os.environ.get('MODRINTH_TOKEN') or os.environ.get('MODRINTH') or ''
    try:
        props = properties()
        if props.get('modrinth_id') != PROJECT_ID:
            raise DraftError('gradle.properties 的 modrinth_id 必须指向原 CAD Editor 项目。')
        version = props['version']
        items = prepare(args.artifact_dir.resolve(), version)
        notes = release_notes(version)
        print(f'目标：CAD Editor / {PROJECT_ID}；{version}，六个草稿版本。', flush=True)
        for item in items:
            print(f'  {item["path"].name}  SHA256 {item["sha256"]}', flush=True)
        record = {'project_id': PROJECT_ID, 'project_slug': PROJECT_SLUG,
                  'receipt_path': str(args.receipt.resolve()), 'mode': 'apply' if args.apply else 'dry_run',
                  'description_preview': 'docs/modrinth-description.md', 'versions': []}
        if args.apply:
            if not token and args.prompt_token:
                token = getpass.getpass('Modrinth Token（隐藏输入，不保存）：').strip()
            if not token:
                raise DraftError('本机未配置 MODRINTH_TOKEN。可用 --prompt-token 隐藏输入，'
                                 '或通过 tools/upload-modrinth-draft.ps1 -GitHub 复用 Actions Secret。')
            upload(Client(token), items, version, notes, record)
        save_record(record)
        print('完成：仅草稿版本，未修改公开介绍、未提交审核、未发布。' if args.apply else
              '本地预检通过，未联网写入。加 --apply 才上传草稿。', flush=True)
        print(f'检查入口：https://modrinth.com/mod/{PROJECT_SLUG}/settings/versions')
        return 0
    except (DraftError, OSError, ValueError, KeyError, zipfile.BadZipFile) as e:
        message = str(e).replace(token, '[REDACTED]') if token else str(e)
        print('上传未完成：' + message, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
