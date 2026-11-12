"""Exercise draft-only upload, retries and conflicts without contacting Modrinth."""
import copy
from email.parser import BytesParser
from email.policy import default
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('draft', Path(__file__).with_name('modrinth-draft.py'))
draft = importlib.util.module_from_spec(spec)
spec.loader.exec_module(draft)


class FakeAPI:
    def __init__(self):
        self.username = 'Rinorsi'
        self.project_id = draft.PROJECT_ID
        self.versions = []
        self.writes = []
        self.fail_after_commit = False

    def request(self, method, path, payload=None, content_type=None):
        if method == 'GET':
            if path == '/user':
                return {'username': self.username}
            if path == '/project/' + draft.PROJECT_ID:
                return {'id': self.project_id, 'slug': 'cad-editor', 'status': 'approved'}
            if path.endswith('/version'):
                return copy.deepcopy(self.versions)
            if path == '/project/fabric-api':
                return {'id': 'actual-fabric-api-id', 'slug': 'fabric-api'}
            if path.startswith('/version/'):
                return copy.deepcopy(next(v for v in self.versions if v['id'] == path.split('/')[-1]))
        if method == 'POST' and path == '/version':
            msg = BytesParser(policy=default).parsebytes(
                ('Content-Type: ' + content_type + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + payload)
            self.writes.append(path)
            parts = list(msg.iter_parts())
            assert len(parts) == 2
            assert parts[0].get_param('name', header='content-disposition') == 'data'
            assert parts[1].get_param('name', header='content-disposition') == 'file'
            data = json.loads(parts[0].get_payload(decode=True))
            assert data['status'] == 'draft'
            assert 'requested_status' not in data
            assert data['project_id'] == draft.PROJECT_ID
            assert data['environment'] == 'client_only_server_optional'
            if data['loaders'] == ['fabric']:
                assert data['dependencies'] == [{'project_id': 'actual-fabric-api-id', 'dependency_type': 'required'}]
            else:
                assert data['dependencies'] == []
            data['id'] = str(len(self.versions) + 1)
            data['files'] = [{'hashes': {'sha512': hashlib.sha512(parts[1].get_payload(decode=True)).hexdigest()}}]
            self.versions.append(data)
            if self.fail_after_commit:
                self.fail_after_commit = False
                raise draft.DraftError('模拟服务端已保存、客户端未收到回执')
            return copy.deepcopy(data)
        raise AssertionError('Unapproved API operation: ' + method + ' ' + path)


class DraftTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.items = []
        for loader, mc in draft.TARGETS:
            path = self.root / f'cadeditor-{loader}-{mc}-0.99.8.jar'
            path.write_bytes(('binary-' + loader + mc).encode())
            self.items.append({'path': path, 'loader': loader, 'mc': mc,
                               'version_number': f'0.99.8+{loader}-{mc}',
                               'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                               'sha512': hashlib.sha512(path.read_bytes()).hexdigest()})
        self.api = FakeAPI()

    def upload(self):
        record = {'versions': [], 'receipt_path': str(self.root / 'receipt.json')}
        draft.upload(self.api, self.items, '0.99.8', '中文玩家更新日志', record)
        return record

    def test_upload_six_then_repeat_without_duplicate(self):
        first = self.upload()
        second = self.upload()
        self.assertEqual(len(self.api.writes), 6)
        self.assertEqual(first['project_status'], 'approved')
        self.assertTrue(all(v['status'] == 'draft' for v in first['versions']))
        self.assertTrue(all(v['action'] == 'already_exists' for v in second['versions']))
        self.assertNotIn('中文玩家更新日志', json.dumps(first))

    def test_uncertain_post_is_recovered_without_duplicate(self):
        self.api.fail_after_commit = True
        with self.assertRaises(draft.DraftError):
            self.upload()
        record = self.upload()
        self.assertEqual(len(self.api.writes), 6)
        self.assertEqual(record['versions'][0]['action'], 'already_exists')

    def test_public_version_blocks_all_writes(self):
        self.upload()
        self.api.writes.clear()
        self.api.versions[-1]['status'] = 'listed'
        with self.assertRaises(draft.DraftError):
            self.upload()
        self.assertEqual(self.api.writes, [])

    def test_different_hash_blocks_all_writes(self):
        self.upload()
        self.api.writes.clear()
        self.api.versions[-1]['files'][0]['hashes']['sha512'] = 'different'
        with self.assertRaises(draft.DraftError):
            self.upload()
        self.assertEqual(self.api.writes, [])

    def test_wrong_owner_or_project_cannot_write(self):
        for field in ('username', 'project_id'):
            with self.subTest(field=field):
                api = FakeAPI()
                setattr(api, field, 'other')
                self.api = api
                with self.assertRaises(draft.DraftError):
                    self.upload()
                self.assertEqual(api.writes, [])

    def test_missing_or_extra_jar_fails_preflight(self):
        self.items[0]['path'].unlink()
        with self.assertRaises(draft.DraftError):
            draft.prepare(self.root, '0.99.8')
        (self.root / 'unrelated.jar').write_bytes(b'unrelated')
        with self.assertRaises(draft.DraftError):
            draft.prepare(self.root, '0.99.8')

    def test_real_release_notes_are_not_empty(self):
        self.assertIn('盔甲架', draft.release_notes(draft.properties()['version']))


if __name__ == '__main__':
    unittest.main(verbosity=2)
