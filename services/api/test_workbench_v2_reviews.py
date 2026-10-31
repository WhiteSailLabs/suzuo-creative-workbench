import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app
from app.store import MemoryStore


class WorkbenchReviewsTests(unittest.TestCase):
    def setUp(self):
        self.store = MemoryStore()
        self.patcher = patch('app.main.store', self.store)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.client = TestClient(app)
        self.pid = 'prj_suzhou_incense'
        self.base = f'/api/workbench/projects/{self.pid}'
        job = self.store.create_image_job(self.pid, {})
        self.store.complete_image_job(job['id'], {'id': 'image_review', 'kind': 'image', 'url': '/image.png', 'path': '/tmp/image.png'})
        self.ws = self.store.workspaces[self.pid]
        self.version = self.ws['versions'][-1]
        for entry in self.ws["culture"]:
            entry["verified"] = True

    def review(self, **kwargs):
        return self.client.post(self.base + '/reviews', json={
            'version_id': self.version['id'], 'asset_id': 'image_review',
            'region': '底座', 'comment': '需要增加稳定感', **kwargs})

    def test_review_binds_project_direction_version_asset_region(self):
        response = self.review()
        self.assertEqual(response.status_code, 201)
        review = response.json()
        for key, value in {'project_id': self.pid, 'direction_id': self.version['direction_id'],
                           'version_id': self.version['id'], 'asset_id': 'image_review',
                           'region': '底座', 'status': 'pending'}.items():
            self.assertEqual(review[key], value)
        self.assertEqual(self.client.get(self.base).json()['reviews'][0]['id'], review['id'])

    def test_pending_resolves_to_each_terminal_state_and_needs_changes_counts(self):
        for status in ['passed', 'needs_changes', 'alternative', 'rejected']:
            with self.subTest(status=status):
                self.version.update(changed_fields={'base': '加宽'}, constraints=['工程待验证'])
                review = self.review().json()
                before = next(p for p in self.store.list_projects() if p['id'] == self.pid)['pending_count']
                response = self.client.patch(self.base + '/reviews/' + review.get('id', 'missing'), json={'status': status})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['status'], status)
                after = next(p for p in self.store.list_projects() if p['id'] == self.pid)['pending_count']
                self.assertEqual(after, before if status == 'needs_changes' else before - 1)
                self.assertEqual(self.client.patch(self.base + '/reviews/' + review['id'], json={'status': 'rejected'}).status_code, 409)

    def test_reviews_reject_foreign_or_mismatched_targets(self):
        for payload in [{'version_id': 'foreign'}, {'asset_id': 'foreign'}, {'direction_id': 'foreign'}]:
            self.assertEqual(self.review(**payload).status_code, 422)
        review = self.review().json()
        self.assertEqual(self.client.patch('/api/workbench/projects/prj_kunqu_lamp/reviews/' + review.get('id', 'missing'), json={'status': 'rejected'}).status_code, 404)

    def test_pass_review_reports_missing_trace_changes_and_limits(self):
        review = self.review().json()
        response = self.client.patch(self.base + '/reviews/' + review.get('id', 'missing'), json={'status': 'passed'})
        self.assertEqual(response.status_code, 409)
        detail = response.json()['detail']
        self.assertFalse(detail['allowed'])
        self.assertTrue(detail['missing'])
        self.assertTrue(detail['reason'])
        self.assertTrue(detail['action'])

    def select(self):
        self.store.select_candidate_version(self.pid, self.version['id'])

    def test_internal_labels_unverified_fact_and_customer_blocks_it(self):
        self.select()
        self.store.create_cultural_reference(self.pid, {'kind': 'fact', 'title': '未核验', 'statement': '待考证陈述', 'source_title': '资料', 'verified': False})
        internal = self.client.get(self.base + '/proposal?audience=internal')
        self.assertEqual(internal.status_code, 200)
        entry = next(c for c in internal.json()['culture'] if c['title'] == '未核验')
        self.assertEqual(entry['kind'], 'to_verify')
        self.assertEqual(entry['original_kind'], 'fact')
        self.assertFalse(entry['verified'])
        for suffix in ['?audience=customer']:
            response = self.client.get(self.base + '/proposal' + suffix)
            self.assertEqual(response.status_code, 409)
            self.assertIn('verified_culture', response.json()['detail']['missing'])
        legacy = self.client.get(self.base + '/proposal')
        self.assertEqual(legacy.status_code, 200)
        self.assertNotIn('待考证陈述', str(legacy.json()))

    def test_proposal_and_manifest_exclude_unsafe_and_unlinked_assets(self):
        self.select()
        template = self.ws['assets'][0]
        from copy import deepcopy
        for asset_id, kind, status, material, version_id, sources in [
            ('failed', 'image', 'failed', None, self.version['id'], []),
            ('archived', 'image', 'archived', None, self.version['id'], []),
            ('processing', 'model_glb', 'processing', 'pbr', self.version['id'], ['image_review']),
            ('stale', 'model_glb', 'stale', 'pbr', self.version['id'], ['image_review']),
            ('white', 'model_glb', 'selected', 'unverified', self.version['id'], ['image_review']),
            ('old', 'model_glb', 'selected', 'pbr', 'old_version', ['image_review']),
            ('unlinked', 'model_glb', 'selected', 'pbr', self.version['id'], []),
            ('draft', 'model_glb', 'draft', 'pbr', self.version['id'], ['image_review']),
            ('final', 'model_glb', 'selected', 'pbr', self.version['id'], ['image_review']),
        ]:
            self.ws['assets'].append({**deepcopy(template), 'asset_id': asset_id, 'asset_type': kind,
                'status': status, 'material_status': material, 'role': 'final', 'version_id': version_id, 'source_asset_ids': sources})
            self.version['artifacts'].append({'id': asset_id, 'kind': kind, 'url': '/' + asset_id, 'internal_note': 'secret'})
        proposal = self.client.get(self.base + '/proposal?audience=customer')
        self.assertEqual(proposal.status_code, 200)
        self.assertEqual([a['id'] for a in proposal.json()['version']['artifacts']], ['image_review', 'final'])
        self.assertNotIn('secret', str(proposal.json()))
        response = self.client.get(self.base + '/manifest')
        self.assertEqual(response.status_code, 200)
        manifest = response.json()
        self.assertEqual([a['asset_id'] for a in manifest['assets']], ['image_review', 'final'])
        for field in ['brief', 'culture_sources', 'version_history']:
            self.assertTrue(manifest[field])
        for asset in manifest['assets']:
            self.assertEqual(asset['version_label'], 'V1')
            self.assertIn('source_asset_ids', asset)

    def test_manifest_history_does_not_reintroduce_excluded_artifacts(self):
        self.select()
        self.version['artifacts'].append({'id': 'orphan', 'kind': 'model_glb', 'url': '/secret.glb'})
        manifest = self.client.get(self.base + '/manifest').json()
        self.assertNotIn('/secret.glb', str(manifest))
        self.assertNotIn('path', manifest['assets'][0])

    def test_gates_describe_generation_candidate_rodin_and_proposal_requirements(self):
        empty = self.store.create_project({'name': '空项目'})['project']['id']
        for action in ['generate_image', 'modify_image', 'lock_candidate', 'generate_rodin', 'internal_review', 'internal_proposal', 'customer_proposal']:
            with self.subTest(action=action):
                gate = self.store.stage_gate_status(empty, action)
                self.assertFalse(gate['allowed'])
                for field in ['missing', 'reason', 'action']:
                    self.assertTrue(gate[field])
        self.select()
        gate = self.store.stage_gate_status(self.pid, 'lock_candidate', {'version_id': self.version['id'], 'confirmed': True})
        self.assertTrue(gate['allowed'])
        self.assertFalse(self.store.stage_gate_status(self.pid, 'generate_rodin')['allowed'])  # fixture path does not exist
        self.assertTrue(self.store.stage_gate_status(self.pid, 'internal_proposal')['allowed'])
        self.ws['assets'][0]['status'] = 'failed'
        self.assertEqual(self.client.get(self.base + '/proposal?audience=internal').status_code, 409)
        self.assertEqual(self.client.get(self.base + '/proposal?audience=customer').status_code, 409)

    def test_gate_endpoint_and_invalid_audience(self):
        response = self.client.get(self.base + '/stage-gates/internal_proposal')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['allowed'])
        self.assertEqual(self.client.get(self.base + '/proposal?audience=public').status_code, 422)
        self.assertEqual(self.client.get('/api/workbench/projects/missing/manifest').status_code, 404)

    def test_missing_candidate_uses_structured_proposal_gate(self):
        response = self.client.get(self.base + '/proposal?audience=customer')
        self.assertEqual(response.status_code, 409)
        self.assertIn('selected_image', response.json()['detail']['missing'])

    def test_candidate_requires_registered_completed_image(self):
        self.ws['assets'].clear()
        response = self.client.post(self.base + '/versions/' + self.version['id'] + '/candidate')
        self.assertEqual(response.status_code, 422)
        self.assertIsNone(self.ws['project']['candidate_version_id'])

    def test_gate_can_explain_and_clear_brief_and_modification_requirements(self):
        empty = self.store.create_project({'name': '茶杯', 'product_type': '茶杯', 'use_scene': '办公桌'})
        pid = empty['project']['id']
        self.assertTrue(self.store.stage_gate_status(pid, 'generate_image')['allowed'])
        empty['brief_revisions'][-1]['conflicts'] = [{'field': 'dimensions'}]
        self.assertIn('unresolved_conflicts', self.store.stage_gate_status(pid, 'generate_image')['missing'])
        self.assertTrue(self.store.stage_gate_status(self.pid, 'modify_image', {
            'version_id': self.version['id'], 'changes': {'base': '加宽'}, 'preserve': ['镂空']})['allowed'])

    def test_internal_review_rejects_untraceable_model_source(self):
        self.version.update(changed_fields={'base': '加宽'}, constraints=['待打样'])
        self.ws['assets'].append({**self.ws['assets'][0], 'asset_id': 'model', 'asset_type': 'model_glb', 'source_asset_ids': ['missing']})
        self.version['artifacts'].append({'id': 'model', 'kind': 'model_glb'})
        response = self.client.patch(self.base + '/reviews/' + self.review().json()['id'], json={'status': 'passed'})
        self.assertEqual(response.status_code, 409)
        self.assertIn('traceable_assets', response.json()['detail']['missing'])

    def test_image_submission_enforces_brief_gate_and_conflict_priority(self):
        from unittest.mock import AsyncMock
        empty = self.store.create_project({'name': '空项目'})['project']['id']
        base = '/api/workbench/projects/' + empty
        with patch('app.main.run_workbench_image_job', new=AsyncMock()):
            response = self.client.post(base + '/image-jobs', json={})
            self.assertEqual(response.status_code, 409)
            self.assertFalse(response.json()['detail']['allowed'])
            self.assertIn('brief_direction_scene_or_target', response.json()['detail']['missing'])
            self.assertTrue(response.json()['detail']['reason'])
            self.assertTrue(response.json()['detail']['action'])
            self.assertEqual(self.store.workspaces[empty]['jobs'], [])
            self.assertEqual(self.client.post(self.base + '/image-jobs', json={}).status_code, 202)
            self.ws['brief_revisions'][-1]['conflicts'] = [{'field': 'material'}]
            duplicate = self.client.post(self.base + '/image-jobs', json={})
            self.assertEqual(duplicate.status_code, 409)
            self.assertEqual(duplicate.json()['detail'], '当前项目已有同类生成任务正在进行')

    def test_typed_modify_context_and_actual_modify_require_changes_preserve(self):
        from unittest.mock import AsyncMock
        context = {'version_id': self.version['id'], 'changes': {'base': '加宽'}, 'preserve': ['镂空']}
        self.assertTrue(self.client.post(self.base + '/stage-gates/modify_image', json=context).json()['allowed'])
        incomplete = self.client.post(self.base + '/stage-gates/modify_image', json={'version_id': self.version['id']})
        self.assertFalse(incomplete.json()['allowed'])
        with patch('app.main.run_workbench_image_job', new=AsyncMock()):
            no_base = self.client.post(self.base + '/image-jobs', json={'changes': {'base': '加宽'}, 'preserve': ['镂空']})
            self.assertEqual(no_base.status_code, 409)
            self.assertIn('base_version', no_base.json()['detail']['missing'])
            blocked = self.client.post(self.base + '/image-jobs', json={'base_version_id': self.version['id']})
            self.assertEqual(blocked.status_code, 409)
            self.assertIn('changes', blocked.json()['detail']['missing'])
            accepted = self.client.post(self.base + '/image-jobs', json={
                'base_version_id': self.version['id'], 'changes': {'base': '加宽'}, 'preserve': ['镂空']})
            self.assertEqual(accepted.status_code, 202)
            job = accepted.json()
            self.store.fail_generation_job(job['id'], 'network')
            retry = self.client.post(self.base + '/jobs/' + job['id'] + '/retry')
            self.assertEqual(retry.status_code, 202)
            self.assertEqual(retry.json()['changes'], {'base': '加宽'})
            self.store.complete_image_job(retry.json()['id'], {'id': 'modified', 'kind': 'image', 'url': '/modified.png'})
            self.assertEqual(self.ws['versions'][-1]['changed_fields'], {'base': '加宽'})
            self.assertEqual(self.ws['versions'][-1]['preserved_fields'], ['镂空'])

    def test_rodin_submission_and_retry_enforce_current_local_reference_gate(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import AsyncMock
        self.select()
        with patch('app.main.run_workbench_rodin_job', new=AsyncMock()):
            blocked = self.client.post(self.base + '/rodin-jobs', json={'version_id': self.version['id']})
            self.assertEqual(blocked.status_code, 409)
            self.assertFalse(blocked.json()['detail']['allowed'])
            self.assertIn('local_primary_image', blocked.json()['detail']['missing'])
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'concept.png'
                path.write_bytes(b'\x89PNG\r\n\x1a\nexample')
                self.version['artifacts'][0]['path'] = str(path)
                accepted = self.client.post(self.base + '/rodin-jobs', json={'version_id': self.version['id']})
                self.assertEqual(accepted.status_code, 202)
                job = accepted.json()
                self.store.fail_generation_job(job['id'], 'network')
                path.unlink()
                retry = self.client.post(self.base + '/jobs/' + job['id'] + '/retry')
                self.assertEqual(retry.status_code, 409)
                self.assertIn('local_primary_image', retry.json()['detail']['missing'])

    def test_image_retry_rechecks_current_brief_gate(self):
        from unittest.mock import AsyncMock
        job = self.store.create_image_job(self.pid, {})
        self.store.fail_generation_job(job['id'], 'network')
        self.ws['brief_revisions'][-1]['conflicts'] = [{'field': 'material'}]
        with patch('app.main.run_workbench_image_job', new=AsyncMock()):
            response = self.client.post(self.base + '/jobs/' + job['id'] + '/retry')
            self.assertEqual(response.status_code, 409)
            self.assertIn('unresolved_conflicts', response.json()['detail']['missing'])
