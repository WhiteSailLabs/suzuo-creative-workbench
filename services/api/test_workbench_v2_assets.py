import unittest
import json
import struct
import tempfile
import base64
from dataclasses import replace
from app.config import settings
from pathlib import Path
from unittest.mock import AsyncMock
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.main import app
from app.store import MemoryStore


class WorkbenchAssetsTests(unittest.TestCase):
    def setUp(self):
        self.store = MemoryStore()
        self.patcher = patch('app.main.store', self.store)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.client = TestClient(app)
        self.project_id = 'prj_suzhou_incense'
        self.base = f'/api/workbench/projects/{self.project_id}'

    def image(self, asset_id='image_one', base_version_id=None):
        job = self.store.create_image_job(self.project_id, {'base_version_id': base_version_id})
        self.store.complete_image_job(job['id'], {
            'id': asset_id, 'kind': 'image', 'url': f'/api/workbench/assets/{asset_id}',
            'path': f'/tmp/{asset_id}.png', 'media_type': 'image/png',
        })
        return self.store.workspaces[self.project_id]['versions'][-1]

    def test_project_collection_and_creation(self):
        response = self.client.get('/api/workbench/projects')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 3)
        created = self.client.post('/api/workbench/projects', json={'name': '茶器', 'product_type': '茶杯'})
        self.assertEqual(created.status_code, 201)
        workspace = created.json()
        self.assertEqual(workspace['project']['name'], '茶器')
        self.assertEqual(self.client.get('/api/workbench/projects/' + workspace['project']['id']).json()['assets'], [])

    def test_create_direction_endpoint(self):
        response = self.client.post(self.base + '/directions', json={'name': '留白', 'concept': '简约'})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['name'], '留白')
        self.assertEqual(self.client.get(self.base).json()['project']['active_direction_id'], response.json()['id'])

    def test_image_asset_listing_patch_and_relations_endpoints(self):
        version = self.image()
        response = self.client.get(self.base + '/assets')
        self.assertEqual(response.status_code, 200)
        asset = response.json()[0]
        self.assertEqual(asset['asset_id'], 'image_one')
        self.assertEqual(asset['asset_type'], 'image')
        self.assertEqual(asset['version_id'], version['id'])
        self.assertEqual(asset['project_id'], self.project_id)
        for field in ('direction_id', 'title', 'status', 'source_asset_ids', 'source_turn_id', 'source_culture_ids', 'tags', 'created_at', 'updated_at', 'owner', 'rights_note'):
            self.assertIn(field, asset)
        response = self.client.patch(self.base + '/assets/image_one', json={'title': '漏景初稿', 'tags': ['陶瓷']})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['title'], '漏景初稿')
        self.assertEqual(response.json()['tags'], ['陶瓷'])
        response = self.client.get(self.base + '/assets/image_one/relations')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['asset']['asset_id'], 'image_one')

    def test_unknown_project_assets_is_404(self):
        self.assertEqual(self.client.get('/api/workbench/projects/missing/assets').status_code, 404)

    def test_combined_filters_and_project_isolation(self):
        first = self.image()
        self.client.patch(self.base + '/assets/image_one', json={'title': '漏景陶瓷', 'tags': ['陶瓷'], 'status': 'reviewing'})
        self.store.create_direction(self.project_id, {'name': '另一个方向'})
        self.image('image_two', first['id'])
        filters = {'type': 'image', 'status': 'reviewing', 'direction_id': first['direction_id'], 'tag': '陶瓷', 'query': '漏景'}
        self.assertEqual([a['asset_id'] for a in self.client.get(self.base + '/assets', params=filters).json()], ['image_one'])
        for key, value in [('type', 'model_glb'), ('status', 'published'), ('direction_id', 'unknown'), ('tag', '木'), ('query', 'missing')]:
            with self.subTest(key=key):
                self.assertEqual(self.client.get(self.base + '/assets', params={**filters, key: value}).json(), [])
        other = '/api/workbench/projects/prj_kunqu_lamp/assets/image_one'
        self.assertEqual(self.client.patch(other, json={'status': 'archived'}).status_code, 404)
        self.assertEqual(self.client.get(other + '/relations').status_code, 404)

    def test_invalid_assets_cannot_be_selected_through_either_api(self):
        version = self.image()
        for status in ['archived', 'failed', 'stale']:
            with self.subTest(status=status):
                self.client.patch(self.base + '/assets/image_one', json={'status': status})
                response = self.client.patch(self.base + '/assets/image_one', json={'status': 'selected'})
                self.assertEqual(response.status_code, 422)
                response = self.client.post(self.base + '/versions/' + version['id'] + '/candidate')
                self.assertEqual(response.status_code, 422)
                self.assertIsNone(self.store.workspaces[self.project_id]['project']['candidate_version_id'])

    def test_archiving_candidate_clears_candidate_and_blocks_rodin(self):
        version = self.image()
        self.client.post(self.base + '/versions/' + version['id'] + '/candidate')
        response = self.client.patch(self.base + '/assets/image_one', json={'status': 'archived'})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(self.store.workspaces[self.project_id]['project']['candidate_version_id'])
        with patch('app.main.run_workbench_rodin_job', new=AsyncMock()):
            self.assertEqual(self.client.post(self.base + '/rodin-jobs', json={'version_id': version['id']}).status_code, 422)

    def test_relations_include_parent_inputs_and_downstream_models(self):
        v1 = self.image()
        v2 = self.image('image_two', v1['id'])
        self.store.select_candidate_version(self.project_id, v2['id'])
        job = self.store.create_rodin_job(self.project_id, {'version_id': v2['id']})
        self.store.complete_rodin_job(job['id'], {'id': 'model_two', 'kind': 'model_glb', 'url': '/model.glb'})
        relations = self.client.get(self.base + '/assets/image_two/relations').json()
        self.assertIn('parent_version', relations)
        self.assertEqual(relations['parent_version']['id'], v1['id'])
        self.assertEqual([a['asset_id'] for a in relations['input_assets']], ['image_one'])
        self.assertEqual([a['asset_id'] for a in relations['downstream_models']], ['model_two'])
        self.assertEqual(self.client.get(self.base + '/assets/model_two/relations').json()['input_assets'][0]['asset_id'], 'image_two')

    def test_duplicate_jobs_conflict_only_with_same_project_and_kind(self):
        version = self.image()
        self.store.select_candidate_version(self.project_id, version['id'])
        for status in ['submitted', 'processing']:
            with self.subTest(status=status), patch('app.main.run_workbench_image_job', new=AsyncMock()), patch('app.main.run_workbench_rodin_job', new=AsyncMock()):
                image = self.store.create_image_job(self.project_id, {})
                image['status'] = status
                self.assertEqual(self.client.post(self.base + '/image-jobs', json={}).status_code, 409)
                response = self.client.post(self.base + '/rodin-jobs', json={'version_id': version['id']})
                self.assertEqual(response.status_code, 202)
                rodin = self.store.workspaces[self.project_id]['jobs'][-1]
                rodin['status'] = status
                conflict = self.client.post(self.base + '/rodin-jobs', json={'version_id': version['id']})
                self.assertEqual(conflict.status_code, 409)
                self.assertEqual(conflict.json()['detail'], '当前项目已有同类生成任务正在进行')
                self.assertEqual(self.client.post('/api/workbench/projects/prj_kunqu_lamp/image-jobs', json={}).status_code, 202)
                self.store.fail_generation_job(image['id'], 'failed')
                retry = self.client.post(self.base + '/jobs/' + image['id'] + '/retry')
                self.assertEqual(retry.status_code, 202)
                self.assertEqual(retry.json()['attempt'], 2)
                self.assertEqual(self.client.post(self.base + '/jobs/' + image['id'] + '/retry').status_code, 409)
                for workspace in self.store.workspaces.values():
                    for job in workspace['jobs']:
                        if job['status'] in {'submitted', 'processing'}:
                            self.store.fail_generation_job(job['id'], 'cleanup')

    def test_retry_cannot_cross_project_boundary(self):
        job = self.store.create_image_job('prj_kunqu_lamp', {})
        self.store.fail_generation_job(job['id'], 'failed')
        response = self.client.post(self.base + '/jobs/' + job['id'] + '/retry')
        self.assertEqual(response.status_code, 404)

    def test_import_and_generation_both_register_assets_without_losing_artifacts(self):
        with tempfile.TemporaryDirectory() as directory, patch('app.main.settings', replace(settings, image_output_dir=directory)):
            response = self.client.post(self.base + '/image-imports', json={'data_url': 'data:image/png;base64,' + base64.b64encode(b'\x89PNG\r\n\x1a\nexample').decode()})
            self.assertEqual(response.status_code, 201)
            imported_id = response.json()['artifact_id']
            self.image('generated')
            workspace = self.client.get(self.base).json()
            self.assertEqual({a['asset_id'] for a in workspace['assets']}, {imported_id, 'generated'})
            self.assertEqual({a['id'] for v in workspace['versions'] for a in v['artifacts']}, {imported_id, 'generated'})
            self.assertEqual(self.client.get('/api/workbench/assets/' + imported_id).status_code, 200)

    def test_models_need_verified_pbr_before_selection_or_publication(self):
        version = self.image()
        self.store.select_candidate_version(self.project_id, version['id'])
        with tempfile.TemporaryDirectory() as directory:
            for asset_id, textured in [('white_model', False), ('pbr_model', True)]:
                # Minimal GLB with real material/texture references; filename alone proves nothing.
                document = {'asset': {'version': '2.0'}, 'meshes': [{'primitives': [{'material': 0}]}], 'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}} if textured else {}], 'textures': [{'source': 0}], 'images': [{'bufferView': 0, 'mimeType': 'image/png'}], 'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 4}], 'buffers': [{'byteLength': 4}]}
                body = json.dumps(document).encode(); body += b' ' * (-len(body) % 4)
                binary = b'png!'
                content = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(body) + 8 + len(binary)) + struct.pack('<II', len(body), 0x4E4F534A) + body + struct.pack('<II', len(binary), 0x004E4942) + binary
                path = Path(directory) / (asset_id + '.glb'); path.write_bytes(content)
                job = self.store.create_rodin_job(self.project_id, {'version_id': version['id']})
                self.store.complete_rodin_job(job['id'], {'id': asset_id, 'kind': 'model_glb', 'path': str(path), 'url': '/model.glb', 'role': 'final'})
                asset = next(a for a in self.client.get(self.base + '/assets').json() if a['asset_id'] == asset_id)
                self.assertEqual(asset['material_status'], 'pbr' if textured else 'unverified')
                if not textured:
                    self.assertNotEqual(asset['role'], 'final')
                    self.assertNotEqual(version['artifacts'][-1].get('role'), 'final')
                for status in ['selected', 'published']:
                    self.assertEqual(self.client.patch(self.base + '/assets/' + asset_id, json={'status': status}).status_code, 200 if textured else 422)

    def test_old_model_is_marked_stale_when_candidate_changes(self):
        v1 = self.image()
        self.store.select_candidate_version(self.project_id, v1['id'])
        job = self.store.create_rodin_job(self.project_id, {'version_id': v1['id']})
        self.store.complete_rodin_job(job['id'], {'id': 'old_model', 'kind': 'model_glb', 'url': '/old.glb'})
        v2 = self.image('new_image', v1['id'])
        self.store.select_candidate_version(self.project_id, v2['id'])
        asset = next(a for a in self.client.get(self.base + '/assets').json() if a['asset_id'] == 'old_model')
        self.assertEqual(asset['status'], 'stale')
        self.assertEqual(self.client.patch(self.base + '/assets/old_model', json={'status': 'selected'}).status_code, 422)

    def glb(self, directory, document=None):
        if document is None:
            document = {'asset': {'version': '2.0'}, 'meshes': [{'primitives': [{'material': 0}]}], 'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}}}], 'textures': [{'source': 0}], 'images': [{'bufferView': 0, 'mimeType': 'image/png'}], 'bufferViews': [{'buffer': 0, 'byteLength': 4}], 'buffers': [{'byteLength': 4}]}
        body = json.dumps(document).encode()
        body += b' ' * (-len(body) % 4)
        path = Path(directory) / 'model.glb'
        path.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(body) + 4) + struct.pack('<II', len(body), 0x4E4F534A) + body + struct.pack('<II', 4, 0x004E4942) + b'png!')
        return {'id': 'late_model', 'kind': 'model_glb', 'path': str(path), 'url': '/model.glb', 'role': 'final'}

    def test_rodin_completion_rechecks_candidate_and_frozen_input(self):
        for change in ['candidate_rollback', 'archived_input', 'failed_input', 'stale_input', 'changed_input', 'missing_input']:
            with self.subTest(change=change), tempfile.TemporaryDirectory() as directory:
                # Reset each scenario while keeping the same real store bound to the API.
                self.store.workspaces[self.project_id] = MemoryStore().workspaces[self.project_id]
                v1 = self.image()
                v2 = self.image('image_two', v1['id'])
                self.store.select_candidate_version(self.project_id, v2['id'])
                job = self.store.create_rodin_job(self.project_id, {'version_id': v2['id']})
                if change == 'candidate_rollback':
                    self.store.select_candidate_version(self.project_id, v1['id'])
                elif change.endswith('_input') and change.split('_')[0] in {'archived', 'failed', 'stale'}:
                    # Direct state change also verifies completion independently of candidate clearing in PATCH.
                    next(a for a in self.store.workspaces[self.project_id]['assets'] if a['asset_id'] == 'image_two')['status'] = change.split('_')[0]
                elif change == 'changed_input':
                    v2['artifacts'][0]['path'] = '/tmp/replaced.png'
                else:
                    v2['artifacts'].clear()
                result = self.store.complete_rodin_job(job['id'], self.glb(directory))
                self.assertEqual(result['status'], 'stale')
                asset = next(a for a in self.store.list_assets(self.project_id) if a['asset_id'] == 'late_model')
                self.assertEqual(asset['status'], 'stale')
                self.assertEqual(asset['role'], 'preview')
                self.assertEqual(v2['artifacts'][-1]['role'], 'preview')
                for status in ['selected', 'published']:
                    self.assertEqual(self.client.patch(self.base + '/assets/late_model', json={'status': status}).status_code, 422)

    def test_completed_job_replay_with_new_artifact_id_keeps_first_result(self):
        v1 = self.image()
        workspace = self.store.workspaces[self.project_id]
        image_job = workspace['jobs'][-1]
        image_result = dict(image_job)
        self.store.complete_image_job(image_job['id'], {'id': 'replayed_image', 'kind': 'image', 'url': '/replay.png'})
        self.assertEqual(image_job, image_result)
        self.assertEqual(len(workspace['versions']), 1)
        self.assertEqual([a['asset_id'] for a in workspace['assets']], ['image_one'])

    def test_completed_rodin_replay_with_new_artifact_id_keeps_first_result(self):
        version = self.image()
        self.store.select_candidate_version(self.project_id, version['id'])
        job = self.store.create_rodin_job(self.project_id, {'version_id': version['id']})
        self.store.complete_rodin_job(job['id'], {'id': 'first_model', 'kind': 'model_glb', 'url': '/first.glb'})
        result = dict(job)
        self.store.complete_rodin_job(job['id'], {'id': 'second_model', 'kind': 'model_glb', 'url': '/second.glb'})
        self.assertEqual(job, result)
        self.assertEqual([a['id'] for a in version['artifacts']], ['image_one', 'first_model'])
        self.assertEqual([a['asset_id'] for a in self.store.list_assets(self.project_id)], ['image_one', 'first_model'])

    def test_malformed_glb_json_is_unverified_without_partial_final_artifact(self):
        for document in [[], {'meshes': [None]}, {'meshes': [{'primitives': [None]}]}, {'meshes': None}]:
            with self.subTest(document=document), tempfile.TemporaryDirectory() as directory:
                self.store.workspaces[self.project_id] = MemoryStore().workspaces[self.project_id]
                version = self.image()
                self.store.select_candidate_version(self.project_id, version['id'])
                job = self.store.create_rodin_job(self.project_id, {'version_id': version['id']})
                artifact = self.glb(directory, document)
                try:
                    self.store.complete_rodin_job(job['id'], artifact)
                except Exception as exc:
                    self.fail(f'Malformed GLB must complete as unverified, raised {type(exc).__name__}: {exc}')
                self.assertEqual(version['artifacts'][-1]['role'], 'preview')
                asset = self.store.list_assets(self.project_id)[-1]
                self.assertEqual((asset['status'], asset['material_status'], asset['role']), ('draft', 'unverified', 'preview'))
                self.assertEqual(artifact['role'], 'final')  # Caller input was not mutated.

    def test_completion_is_idempotent(self):
        version = self.image()
        job = self.store.workspaces[self.project_id]['jobs'][-1]
        self.store.complete_image_job(job['id'], version['artifacts'][0])
        workspace = self.store.workspaces[self.project_id]
        self.assertEqual(len(workspace['assets']), 1)
        self.assertEqual(len(workspace['versions']), 1)


if __name__ == '__main__':
    unittest.main()
