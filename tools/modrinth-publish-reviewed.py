"""Publish the six reviewed 0.99.8 drafts using their original upload receipt.

No changes by default. --apply sets only changelog, version_type and status.
Never creates versions, uploads new jars or edits the project page.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

spec = importlib.util.spec_from_file_location('draft', Path(__file__).with_name('modrinth-draft.py'))
draft = importlib.util.module_from_spec(spec)
spec.loader.exec_module(draft)
VERSION = '0.99.8'
IDS = {'Wtcje6WK', 'aKnkLbVm', 'sXvTDOHL', 'EqQI0V34', 'bYzq7rfN', 'xwN80lRh'}


def prepare(manifest_path):
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    items = manifest['versions']
    expected = {f'{VERSION}+{loader}-{mc}' for loader, mc in draft.TARGETS}
    if (manifest.get('project_id') != draft.PROJECT_ID or manifest.get('mode') != 'apply'
            or len(items) != 6 or {v['id'] for v in items} != IDS
            or {v['version_number'] for v in items} != expected):
        raise draft.DraftError('回执必须恰好对应原项目已检查的六个 0.99.8 草稿。')
    for item in items:
        if item.get('status') != 'draft' or not re.fullmatch(r'[0-9a-f]{128}', item['sha512']):
            raise draft.DraftError('原上传回执的草稿状态或哈希无效。')
    notes = (draft.ROOT / 'docs/releases/0.99.8-modrinth.md').read_text(encoding='utf-8').strip()
    if not notes or len(notes.splitlines()) != 3:
        raise draft.DraftError('发布说明必须只有已定稿的中英文两句。')
    return items, {'changelog': notes, 'version_type': 'release', 'status': 'listed'}


class Publisher(draft.Client):
    def __init__(self, token, payload):
        super().__init__(token)
        self.payload = payload

    def request(self, method, path, payload=None, content_type='application/json'):
        if method != 'GET':
            if method != 'PATCH' or path not in {'/version/' + x for x in IDS} or payload != self.payload:
                raise draft.DraftError('禁止修改六个已检查版本以外的内容。')
        return super().request(method, path, payload, content_type)


def validate(remote, item, payload, published=False):
    loader, mc = item['version_number'].split('+', 1)[1].split('-', 1)
    if (remote.get('id') != item['id'] or remote.get('project_id') != draft.PROJECT_ID
            or remote.get('version_number') != item['version_number']
            or remote.get('loaders') != [loader] or remote.get('game_versions') != [mc]
            or remote.get('status') not in ('draft', 'listed')
            or len(remote.get('files', [])) != 1
            or remote['files'][0].get('hashes', {}).get('sha512') != item['sha512']):
        raise draft.DraftError('远端身份、文件或状态与已检查的包不一致：' + item['version_number'])
    if published or remote['status'] == 'listed':
        if any(remote.get(key) != value for key, value in payload.items()):
            raise draft.DraftError('已公开版本的发布内容不一致，请核对：' + item['version_number'])


def publish(client, items, payload, record, save):
    if client.request('GET', '/user').get('username') != draft.OWNER:
        raise draft.DraftError('当前 Modrinth 账号不是 Rinorsi，已停止。')
    project = client.request('GET', '/project/' + draft.PROJECT_ID)
    if project.get('id') != draft.PROJECT_ID or project.get('slug') != draft.PROJECT_SLUG:
        raise draft.DraftError('原项目身份不匹配。')
    record['project_before'] = project
    before_list = client.request('GET', '/project/' + draft.PROJECT_ID + '/version')
    remotes = {}
    # Read drafts by exact ID: project version listings intentionally omit drafts.
    # Check every target before the first public write.
    for item in items:
        remote = client.request('GET', '/version/' + item['id'])
        validate(remote, item, payload)
        remotes[item['id']] = remote
    save()
    for item in items:
        remote = remotes[item['id']]
        if remote['status'] == 'draft':
            client.request('PATCH', '/version/' + item['id'], payload)
        confirmed = client.request('GET', '/version/' + item['id'])
        validate(confirmed, item, payload, published=True)
        record['versions'].append({'id': confirmed['id'], 'version_number': confirmed['version_number'],
                                   'status': confirmed['status'], 'version_type': confirmed['version_type'],
                                   'changelog': confirmed['changelog'], 'sha512': item['sha512'],
                                   'url': f'https://modrinth.com/mod/cad-editor/version/{confirmed["id"]}'})
        save()
        print('已正式发布并核对：' + item['version_number'], flush=True)
    after = client.request('GET', '/project/' + draft.PROJECT_ID)
    protected = ('id', 'slug', 'title', 'description', 'body', 'license', 'source_url',
                 'issues_url', 'wiki_url', 'discord_url', 'gallery', 'icon_url', 'status')
    if any(project.get(key) != after.get(key) for key in protected):
        raise draft.DraftError('项目页面发生变化，请核对；本脚本未修改项目。')
    after_list = client.request('GET', '/project/' + draft.PROJECT_ID + '/version')
    stable_keys = ('status', 'version_number', 'version_type', 'name', 'changelog',
                   'files', 'loaders', 'game_versions', 'featured', 'dependencies')
    before_other = {v['id']: {k: v.get(k) for k in stable_keys} for v in before_list if v['id'] not in IDS}
    after_other = {v['id']: {k: v.get(k) for k in stable_keys} for v in after_list if v['id'] not in IDS}
    if before_other != after_other or not IDS <= {v['id'] for v in after_list}:
        raise draft.DraftError('版本列表未包含六个新版或旧版发生变化，请核对。')
    record['complete'] = True
    record['listed_version_count'] = len(after_list)
    save()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--output', type=Path, default=draft.ROOT / 'logs/modrinth/published-0.99.8.json')
    args = parser.parse_args()
    token = os.environ.get('MODRINTH_TOKEN') or os.environ.get('MODRINTH') or ''
    record = {'project_id': draft.PROJECT_ID, 'complete': False, 'versions': []}
    def save():
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    try:
        items, payload = prepare(args.manifest)
        print('原项目 MJW1h2CF：正式发布六个已检查的 0.99.8 包。', flush=True)
        print(payload['changelog'], flush=True)
        if not args.apply:
            print('本地预检通过，未执行发布。')
            return 0
        if not token:
            raise draft.DraftError('缺少 MODRINTH_TOKEN / MODRINTH。')
        publish(Publisher(token, payload), items, payload, record, save)
        print('完成：https://modrinth.com/mod/cad-editor/versions')
        return 0
    except (draft.DraftError, OSError, ValueError, KeyError) as error:
        message = str(error).replace(token, '[REDACTED]') if token else str(error)
        record['error'] = message
        save()
        print('发布未完成：' + message, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
