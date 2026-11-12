"""Check that gallery uploads preserve project text and all version states."""
import copy
import hashlib
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.parse

spec = importlib.util.spec_from_file_location('gallery', Path(__file__).with_name('modrinth-gallery.py'))
gallery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gallery)


class FakeAPI:
    def __init__(self):
        self.project = {'id': gallery.draft.PROJECT_ID, 'slug': 'cad-editor', 'title': 'User title',
                        'body': 'User-written description', 'status': 'approved',
                        'gallery': [{'title': None, 'url': 'legacy-image'}]}
        self.writes = []
        self.deletions = []
        self.updates = []
        self.hashes = {}

    def request(self, method, path, payload=None, content_type=None):
        if method == 'GET':
            if path == '/user':
                return {'username': 'Rinorsi'}
            if path == gallery.PROJECT:
                return copy.deepcopy(self.project)
            if path == gallery.PROJECT + '/version':
                return []  # Real project listings do not include drafts.
            if path.startswith('/version/'):
                return {'id': path.split('/')[-1], 'status': 'listed', 'version_number': '0.99.8',
                        'project_id': gallery.draft.PROJECT_ID, 'loaders': ['fabric'],
                        'game_versions': ['26.3'], 'files': []}
        if method == 'POST' and path.startswith(gallery.PROJECT + '/gallery?'):
            params = urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)
            title = params['title'][0]
            url = 'https://cdn.modrinth.com/data/MJW1h2CF/images/' + hashlib.sha256(payload).hexdigest()
            self.hashes[url] = hashlib.sha256(payload).hexdigest()
            self.project['gallery'].append({'title': title, 'url': url, 'raw_url': url,
                                           'description': params['description'][0],
                                           'featured': params['featured'][0] == 'true',
                                           'ordering': int(params['ordering'][0])})
            self.writes.append(path)
            return None
        if method == 'PATCH' and path.startswith(gallery.PROJECT + '/gallery?'):
            params = urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)
            found = next(g for g in self.project['gallery'] if g['url'] == params['url'][0])
            found.update(title=params['title'][0], description=params['description'][0],
                         featured=params['featured'][0] == 'true', ordering=int(params['ordering'][0]))
            self.updates.append(path)
            return None
        if method == 'DELETE' and path.startswith(gallery.PROJECT + '/gallery?'):
            assert len(self.writes) == len(gallery.prepare()['gallery'])
            url = urllib.parse.parse_qs(urllib.parse.urlsplit(path).query)['url'][0]
            self.project['gallery'] = [g for g in self.project['gallery'] if g['url'] != url]
            self.deletions.append(url)
            return None
        raise AssertionError('Forbidden operation: ' + method + ' ' + path)


class GalleryTests(unittest.TestCase):
    def test_real_files_and_repeat_upload_preserve_text_and_versions(self):
        config = gallery.prepare()
        client = FakeAPI()
        for _ in range(2):
            record = {'gallery': []}
            with patch.object(gallery, 'image_digest', side_effect=lambda url: client.hashes[url]):
                gallery.apply(client, config, record, lambda: None)
            self.assertTrue(record['complete'])
            self.assertEqual(record['before']['body'], record['after']['body'])
            self.assertEqual(record['version_states_before'], record['version_states_after'])
            self.assertEqual(len(record['version_states_after']), 6)
        self.assertEqual(len(client.writes), len(config['gallery']))
        self.assertEqual(len(client.project['gallery']), len(config['gallery']) + 1)
        self.assertEqual(client.deletions, [])

    def test_existing_image_caption_updates_without_reupload(self):
        config = gallery.prepare()
        client = FakeAPI()
        item = config['gallery'][0]
        url = 'existing-image'
        client.hashes[url] = item['sha256']
        client.project['gallery'].append(dict(item, url=url, raw_url=url, description='Previous caption'))
        for _ in range(2):
            record = {'gallery': []}
            with patch.object(gallery, 'image_digest', side_effect=lambda url: client.hashes[url]):
                gallery.apply(client, config, record, lambda: None)
            self.assertTrue(record['complete'])
        self.assertEqual(len(client.updates), 1)
        self.assertEqual(len(client.writes), len(config['gallery']) - 1)
        self.assertEqual(client.deletions, [])

    def test_same_title_different_image_is_rejected_before_writes(self):
        config = gallery.prepare()
        client = FakeAPI()
        client.project['gallery'].append(dict(config['gallery'][0], url='different-image'))
        with patch.object(gallery, 'image_digest', return_value='wrong-hash'):
            with self.assertRaises(gallery.draft.DraftError):
                gallery.apply(client, config, {'gallery': []}, lambda: None)
        self.assertEqual(client.writes, [])
        self.assertEqual(client.updates, [])

    def test_client_rejects_text_changes_and_version_publishing_before_network(self):
        client = gallery.PageClient('fake-token')
        for method, path, data in [
            ('PATCH', gallery.PROJECT, {'body': 'overwrite'}),
            ('PATCH', '/version/Wtcje6WK', {'status': 'listed'}),
            ('POST', '/version', {'status': 'listed'}),
            ('DELETE', gallery.PROJECT, None),
        ]:
            with self.assertRaises(gallery.draft.DraftError):
                client.request(method, path, data)


if __name__ == '__main__':
    unittest.main(verbosity=2)
