"""Upload English screenshots without modifying project text or any version.

No writes by default. --apply uploads images and updates matching image captions.
Uses the same environment token and redirect protection as the draft uploader.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import urllib.parse
import urllib.request

spec = importlib.util.spec_from_file_location('draft', Path(__file__).with_name('modrinth-draft.py'))
draft = importlib.util.module_from_spec(spec)
spec.loader.exec_module(draft)
ROOT = draft.ROOT
PROJECT = '/project/' + draft.PROJECT_ID
PROTECTED_FIELDS = ('id', 'slug', 'title', 'status', 'icon_url', 'description', 'body',
                    'license', 'source_url', 'issues_url', 'wiki_url', 'discord_url')


class PageClient(draft.Client):
    def request(self, method, path, payload=None, content_type='application/json'):
        if method != 'GET':
            allowed = method in ('POST', 'PATCH', 'DELETE') and path.startswith(PROJECT + '/gallery?')
            if not allowed:
                raise draft.DraftError('此脚本只能替换原项目图库图片，禁止修改介绍、其他设置或版本。')
        return super().request(method, path, payload, content_type)


def local_file(name):
    path = (ROOT / name).resolve()
    if not path.is_relative_to(ROOT):
        raise draft.DraftError('文件路径超出仓库范围。')
    return path


def prepare():
    config = json.loads((ROOT / 'docs/modrinth-gallery.json').read_text(encoding='utf-8'))
    if config['project_id'] != draft.PROJECT_ID or config['project_slug'] != draft.PROJECT_SLUG:
        raise draft.DraftError('项目配置未指向原 CAD Editor。')
    for item in config['gallery']:
        data = local_file(item['file']).read_bytes()
        if not data.startswith(b'\x89PNG\r\n\x1a\n') or len(data) > 5 * 1024 * 1024:
            raise draft.DraftError('图库文件必须是 5 MiB 以内的 PNG。')
        if not item['title'].isascii() or not item['description'].isascii():
            raise draft.DraftError('图库标题和说明必须使用英文。')
        if item['title'] != item['description']:
            raise draft.DraftError('图库标题和说明必须相同。')
        item['sha256'] = hashlib.sha256(data).hexdigest()
    return config


def image_digest(url):
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != 'https' or parsed.netloc != 'cdn.modrinth.com'
            or not parsed.path.startswith('/data/' + draft.PROJECT_ID + '/images/')):
        raise draft.DraftError('图库原图 URL 不属于原项目的 Modrinth CDN。')
    opener = urllib.request.build_opener(draft.NoRedirect)
    request = urllib.request.Request(url, headers={'User-Agent': 'Rinorsi/CAD-Editor-Recast'})
    with opener.open(request, timeout=60) as response:
        data = response.read(5 * 1024 * 1024 + 1)
    return hashlib.sha256(data).hexdigest()


def gallery_match(project, item, strict=True):
    same = [g for g in project.get('gallery', []) if g.get('title') == item['title']]
    if len(same) > 1:
        raise draft.DraftError('图库存在重复标题，请人工核对：' + item['title'])
    if same:
        found = same[0]
        if (image_digest(found.get('raw_url') or found['url']) != item['sha256']
                or (strict and any(found.get(key) != item[key] for key in ('description', 'featured', 'ordering')))):
            raise draft.DraftError('图库同名图片或信息不同，停止且不覆盖：' + item['title'])
        return found
    return None


def version_states(client, protected):
    versions = client.request('GET', PROJECT + '/version')
    versions += [client.request('GET', '/version/' + version_id) for version_id in protected]
    return {v['id']: {'status': v['status'], 'version_number': v['version_number'],
                       'project_id': v['project_id'], 'loaders': v['loaders'],
                       'game_versions': v['game_versions'],
                       'files': [{'hashes': f['hashes'], 'url': f['url'],
                                  'filename': f['filename'], 'size': f['size']} for f in v['files']]}
            for v in versions}


def apply(client, config, record, save):
    if client.request('GET', '/user').get('username') != draft.OWNER:
        raise draft.DraftError('当前账号不是 Rinorsi，已停止。')
    before = client.request('GET', PROJECT)
    if before.get('id') != draft.PROJECT_ID or before.get('slug') != draft.PROJECT_SLUG:
        raise draft.DraftError('原项目身份不匹配，已停止。')
    record['before'] = before
    record['version_states_before'] = version_states(client, config['protected_versions'])
    for item in config['gallery']:
        gallery_match(before, item, strict=False)
    wanted_titles = {item['title'] for item in config['gallery']}
    previous_gallery = [g for g in before.get('gallery', []) if g.get('title') not in wanted_titles]
    save()
    project = before
    for item in config['gallery']:
        found = gallery_match(project, item, strict=False)
        if found and any(found.get(key) != item[key] for key in ('description', 'featured', 'ordering')):
            query = {key: item[key] for key in ('title', 'description', 'ordering')}
            query.update(url=found['url'], featured=str(item['featured']).lower())
            client.request('PATCH', PROJECT + '/gallery?' + urllib.parse.urlencode(query))
            project = client.request('GET', PROJECT)
            found = gallery_match(project, item)
        if not found:
            query = {key: item[key] for key in ('title', 'description', 'ordering')}
            query.update(ext='png', featured=str(item['featured']).lower())
            client.request('POST', PROJECT + '/gallery?' + urllib.parse.urlencode(query),
                           local_file(item['file']).read_bytes(), 'image/png')
            project = client.request('GET', PROJECT)
            found = gallery_match(project, item)
            if not found:
                raise draft.DraftError('图库未读回新增图片，请核对后再重跑。')
        record['gallery'].append({'title': found['title'], 'url': found.get('raw_url') or found['url'],
                                  'sha256': item['sha256']})
        save()
        print('已核对英文图片：' + item['title'], flush=True)
    if config.get('replace_previous_gallery'):
        # Remove only the initial old images after all replacements have been verified.
        # Original URLs and metadata are retained in the receipt for restoration if needed.
        for old in previous_gallery:
            client.request('DELETE', PROJECT + '/gallery?' + urllib.parse.urlencode({'url': old['url']}))
            print('已移除旧版图库图片：' + old['url'], flush=True)
    project = client.request('GET', PROJECT)
    if any(project.get(k) != before.get(k) for k in PROTECTED_FIELDS):
        raise draft.DraftError('项目文案、设置或状态发生变化，请核对；本脚本只替换图库图片。')
    for item in config['gallery']:
        if not gallery_match(project, item):
            raise draft.DraftError('替换后图库图片缺失，请核对。')
    record['version_states_after'] = version_states(client, config['protected_versions'])
    if record['version_states_after'] != record['version_states_before']:
        raise draft.DraftError('版本状态或文件发生变化，请核对；本脚本未修改版本。')
    record['after'] = project
    record['complete'] = True
    save()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--receipt', type=Path, default=ROOT / 'logs/modrinth/gallery-upload.json')
    args = parser.parse_args()
    token = os.environ.get('MODRINTH_TOKEN') or os.environ.get('MODRINTH') or ''
    record = {'project_id': draft.PROJECT_ID, 'complete': False, 'gallery': []}
    def save():
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    try:
        config = prepare()
        print('目标：原 CAD Editor / MJW1h2CF；核对 ' + str(len(config['gallery'])) + ' 张英文图库图片。', flush=True)
        print('介绍和其他设置保留；所有版本均不修改。', flush=True)
        if not args.apply:
            print('本地预检通过，未联网写入。加 --apply 才上传图库图片。')
            return 0
        if not token:
            raise draft.DraftError('缺少 MODRINTH_TOKEN / MODRINTH。请使用 Actions Secret。')
        apply(PageClient(token), config, record, save)
        print('完成：https://modrinth.com/mod/cad-editor；未发布或修改任何版本。')
        return 0
    except (draft.DraftError, OSError, ValueError, KeyError) as error:
        message = str(error).replace(token, '[REDACTED]') if token else str(error)
        record['error'] = message
        save()
        print('截图上传未完成：' + message, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
