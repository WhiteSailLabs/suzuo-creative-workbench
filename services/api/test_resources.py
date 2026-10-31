import unittest
from app.resources import find_local_resources, resource_prompt
class ResourceTests(unittest.TestCase):
    def test_search_matches_culture(self):
        w = {'culture': [{'id': 'a', 'title': '漏景', 'statement': '前后遮挡', 'source_url': 'https://example.org'}]}
        self.assertEqual(find_local_resources(w, '漏景香插')[0]['id'], 'culture:a')
        self.assertEqual(find_local_resources(w, '丝绸'), [])
    def test_prompt_contains_reference(self):
        self.assertIn('虚实关系', resource_prompt([{'title': '漏窗', 'description': '虚实关系', 'source_url': 'https://example.org'}]))

class ResourceGenerationTests(unittest.TestCase):
    def test_retry_retains_resource_snapshot(self):
        from app.store import MemoryStore
        store = MemoryStore()
        pid = next(iter(store.workspaces))
        job = store.create_image_job(pid, {})
        job['design_resources'] = [{'id': 'met:1', 'title': '陶瓷'}]
        store.fail_generation_job(job['id'], 'network')
        retried = store.retry_generation_job(job['id'])
        self.assertEqual(retried['design_resources'], job['design_resources'])
        self.assertIsNot(retried['design_resources'], job['design_resources'])
    def test_image_prompt_keeps_request_instead_of_forcing_incense(self):
        from app.store import MemoryStore
        store = MemoryStore()
        pid = next(iter(store.workspaces))
        w = store.workspaces[pid]
        w['turns'].append({'id': 'custom', 'text': '青灰陶瓷桌面灯', 'intent': 'DISCUSS', 'change_patch': {}})
        prompt = store._compose_image_prompt(w, 'custom')
        self.assertIn('青灰陶瓷桌面灯', prompt)
        self.assertNotIn('展示稳定底座、镂空层次与香烟路径', prompt)
    def test_agent_plan_endpoint_preserves_v3_base(self):
        from app.intent import TextInterpretationProvider
        provider = TextInterpretationProvider(base_url='https://ark.cn-beijing.volces.com/api/plan/v3', api_key='test', model='doubao-seed-evolving')
        self.assertEqual(provider._endpoint(), 'https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions')
    def test_generated_asset_attributes_only_selected_culture(self):
        from app.store import MemoryStore
        store = MemoryStore()
        pid = next(iter(store.workspaces))
        job = store.create_image_job(pid, {})
        job['design_resources'] = []
        store.complete_image_job(job['id'], {'id':'test_image','kind':'image','url':'data:image/png;base64,eA=='})
        asset = next(a for a in store.workspaces[pid]['assets'] if a['asset_id'] == 'test_image')
        self.assertEqual(asset['source_culture_ids'], [])
    def test_local_material_search_returns_real_preview_and_license(self):
        from app.resources import find_material_resources
        results = find_material_resources('找织物纹理')
        self.assertTrue(results)
        self.assertTrue(results[0]['image_url'].startswith('/assets/'))
        self.assertEqual(results[0]['license'], 'CC0-1.0')
        self.assertEqual(find_material_resources('漏窗'), [])

class VisualReferenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_selected_images_are_submitted_as_actual_files(self):
        import httpx, base64
        from app.providers.image import OpenAICompatibleImageProvider
        def handler(request):
            body = request.read()
            self.assertEqual(request.url.path, '/v1/images/edits')
            self.assertIn(b'name="image[]"', body)
            self.assertIn(b'first-reference', body)
            self.assertIn(b'second-reference', body)
            self.assertIn(b'use fabric texture', body)
            return httpx.Response(200, json={'data': [{'b64_json': 'eA=='}]})
        provider = OpenAICompatibleImageProvider(base_url='https://example.test/v1', api_key='test', transport=httpx.MockTransport(handler))
        images = ['data:image/png;base64,' + base64.b64encode(value).decode() for value in [b'first-reference', b'second-reference']]
        result = await provider.with_references('use fabric texture', images)
        self.assertTrue(result['data'])
