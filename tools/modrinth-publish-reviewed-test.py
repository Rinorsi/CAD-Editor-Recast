"""Exercise reviewed publication without contacting Modrinth."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('modrinth-publish-reviewed.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class FakeAPI:
    def __init__(self, items):
        self.versions = {}
        for item in items:
            loader, mc = item['version_number'].split('+')[1].split('-', 1)
            self.versions[item['id']] = {'id': item['id'], 'project_id': release.draft.PROJECT_ID,
                'version_number': item['version_number'], 'loaders': [loader], 'game_versions': [mc],
                'status': 'draft', 'version_type': 'beta', 'changelog': 'Old note',
                'files': [{'hashes': {'sha512': item['sha512']}}]}
        self.project = {'id': release.draft.PROJECT_ID, 'slug': 'cad-editor',
                        'body': 'User-edited text', 'status': 'approved'}
        self.writes = []
        self.fail_after_commit = False

    def request(self, method, path, payload=None):
        if method == 'GET':
            if path == '/user':
                return {'username': 'Rinorsi'}
            if path == '/project/' + release.draft.PROJECT_ID:
                return copy.deepcopy(self.project)
            if path.endswith('/version'):
                return [{'id': 'old-version', 'status': 'listed', 'version_number': '0.5.6'}] + [
                    copy.deepcopy(v) for v in self.versions.values() if v['status'] == 'listed']
            if path.startswith('/version/'):
                return copy.deepcopy(self.versions[path.split('/')[-1]])
        if method == 'PATCH' and path.split('/')[-1] in self.versions:
            self.versions[path.split('/')[-1]].update(payload)
            self.writes.append(path)
            if self.fail_after_commit:
                self.fail_after_commit = False
                raise release.draft.DraftError('Simulated lost response after committed PATCH')
            return None
        raise AssertionError('Unexpected operation: ' + method + ' ' + path)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.items = [{'id': version_id, 'version_number': f'0.99.8+{loader}-{mc}', 'sha512': 'a' * 128}
                      for version_id, (loader, mc) in zip(sorted(release.IDS), release.draft.TARGETS)]
        self.payload = {'changelog': '中文发布说明\n\nEnglish release note.',
                        'status': 'listed', 'version_type': 'release'}
        self.client = FakeAPI(self.items)

    def run_publish(self):
        record = {'versions': []}
        release.publish(self.client, self.items, self.payload, record, lambda: None)
        return record

    def test_publish_and_resume_do_not_duplicate_or_change_project(self):
        self.client.fail_after_commit = True
        with self.assertRaises(release.draft.DraftError):
            self.run_publish()
        result = self.run_publish()
        self.assertTrue(result['complete'])
        self.assertEqual(len(self.client.writes), 6)
        self.assertEqual(result['listed_version_count'], 7)
        self.assertEqual(self.client.project['body'], 'User-edited text')
        self.run_publish()
        self.assertEqual(len(self.client.writes), 6)

    def test_file_mismatch_stops_all_writes(self):
        last_id = self.items[-1]['id']
        self.client.versions[last_id]['files'][0]['hashes']['sha512'] = 'b' * 128
        with self.assertRaises(release.draft.DraftError):
            self.run_publish()
        self.assertEqual(self.client.writes, [])

    def test_scope_guard_blocks_other_versions_and_project_edits(self):
        client = release.Publisher('fake-token', self.payload)
        for path, payload in [('/version/other', self.payload),
                              ('/project/MJW1h2CF', {'body': 'overwrite'}),
                              ('/version/Wtcje6WK', {'status': 'listed'})]:
            with self.assertRaises(release.draft.DraftError):
                client.request('PATCH', path, payload)


if __name__ == '__main__':
    unittest.main(verbosity=2)
