import unittest

from app import cultural_workbench
from app.schemas import WorkspaceOut
from app.store import MemoryStore


class WorkbenchV2SeedTests(unittest.TestCase):
    def test_three_distinct_demos_have_direction_context_and_valid_output(self):
        workspaces = cultural_workbench.create_seed_workspaces()
        self.assertEqual(set(workspaces), {
            'prj_suzhou_incense', 'prj_suzhou_silk_box', 'prj_kunqu_lamp',
        })
        expected = {
            'prj_suzhou_incense': ('漏景香插', '漏景'),
            'prj_suzhou_silk_box': ('丝绸收纳盒', '丝绸'),
            'prj_kunqu_lamp': ('水袖桌面灯', '水袖'),
        }
        culture_ids = []
        for project_id, (name, cultural_cue) in expected.items():
            workspace = workspaces[project_id]
            self.assertIn(name, workspace['project']['name'])
            self.assertIn(cultural_cue, str(workspace['culture']))
            self.assertEqual(len(workspace['directions']), 1)
            direction = workspace['directions'][0]
            self.assertEqual(workspace['active_direction_id'], direction['id'])
            self.assertEqual(workspace['project']['active_direction_id'], direction['id'])
            self.assertTrue(direction['concept'])
            self.assertEqual(direction['culture_ids'], [entry['id'] for entry in workspace['culture']])
            self.assertEqual(direction['material_ids'], [])
            for field in ('assets', 'reviews', 'proposals'):
                self.assertEqual(workspace[field], [])
            public = WorkspaceOut.model_validate(workspace).model_dump()
            self.assertEqual(public['directions'][0]['id'], direction['id'])
            self.assertIn('assets', public)
            culture_ids.append({entry['id'] for entry in workspace['culture']})
        self.assertFalse(culture_ids[0] & culture_ids[1])
        self.assertFalse(culture_ids[1] & culture_ids[2])
        self.assertNotEqual(workspaces['prj_suzhou_silk_box']['brief_revisions'], workspaces['prj_kunqu_lamp']['brief_revisions'])

    def test_legacy_seed_still_returns_incense_and_fresh_state(self):
        workspace = cultural_workbench.create_seed_workspace()
        self.assertEqual(workspace['project']['id'], 'prj_suzhou_incense')
        self.assertEqual(workspace['project']['product_type'], '桌面香插')
        workspace['directions'][0]['culture_ids'].clear()
        self.assertTrue(cultural_workbench.create_seed_workspace()['directions'][0]['culture_ids'])

    def test_store_initializes_all_demos_and_keeps_overridable_dictionary(self):
        store = MemoryStore()
        self.assertEqual(len(store.workspaces), 3)
        store.workspaces = {'prj_suzhou_incense': cultural_workbench.create_seed_workspace()}
        self.assertIsNone(store.workspace_for_project('prj_kunqu_lamp'))


class WorkbenchV2CreationTests(unittest.TestCase):
    def setUp(self):
        self.store = MemoryStore()

    def test_project_creation_trims_name_and_has_no_inherited_demo_content(self):
        workspace = self.store.create_project({'name': '  新茶器  ', 'product_type': '茶器'})
        self.assertEqual(workspace['project']['name'], '新茶器')
        self.assertEqual(workspace['project']['product_type'], '茶器')
        self.assertEqual(workspace['project']['stage'], 'capturing')
        self.assertIsNone(workspace['project']['active_direction_id'])
        self.assertIsNone(workspace['project']['candidate_version_id'])
        self.assertEqual(workspace['brief_revisions'][0]['revision'], 0)
        self.assertEqual(workspace['brief_revisions'][0]['confirmed'], {})
        for field in ('culture', 'directions', 'turns', 'versions', 'jobs', 'assets', 'reviews', 'proposals'):
            self.assertEqual(workspace[field], [])
        self.assertIs(self.store.workspace_for_project(workspace['project']['id']), workspace)
        WorkspaceOut.model_validate(workspace)

    def test_blank_project_names_are_rejected_without_mutation(self):
        for payload in ({}, {'name': ''}, {'name': ' \t\n '}, {'name': None}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                self.store.create_project(payload)
        self.assertEqual(len(self.store.workspaces), 3)

    def test_direction_creation_updates_active_context_and_copies_input(self):
        payload = {'name': '  框景  ', 'concept': '框取烟气', 'culture_ids': ['culture_fact_2'], 'material_ids': []}
        direction = self.store.create_direction('prj_suzhou_incense', payload)
        payload['culture_ids'].clear()
        workspace = self.store.workspace_for_project('prj_suzhou_incense')
        self.assertEqual(direction['name'], '框景')
        self.assertEqual(direction['culture_ids'], ['culture_fact_2'])
        self.assertEqual(workspace['active_direction_id'], direction['id'])
        self.assertEqual(workspace['project']['active_direction_id'], direction['id'])
        self.assertEqual(len(workspace['directions']), 2)
        other = self.store.workspace_for_project('prj_kunqu_lamp')
        self.assertEqual(len(other['directions']), 1)
        WorkspaceOut.model_validate(workspace)

    def test_direction_name_required_and_missing_project_does_not_mutate_store(self):
        for payload in ({}, {'name': ''}, {'name': '  '}, {'name': None}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                self.store.create_direction('prj_suzhou_incense', payload)
        self.assertEqual(len(self.store.workspaces['prj_suzhou_incense']['directions']), 1)
        with self.assertRaises(KeyError):
            self.store.create_direction('unknown', {'name': '新方向'})
        self.assertNotIn('unknown', self.store.workspaces)

    def _generate(self, project_id, artifact_id):
        job = self.store.create_image_job(project_id, {})
        self.store.complete_image_job(job['id'], {'id': artifact_id, 'kind': 'image', 'url': 'data:image/png;base64,cG5n'})
        return self.store.workspaces[project_id]['versions'][-1]

    def test_projects_have_independent_versions_and_reject_foreign_parent(self):
        first = self._generate('prj_suzhou_incense', 'incense_image')
        second = self._generate('prj_kunqu_lamp', 'lamp_image')
        self.assertEqual(first['label'], 'V1')
        self.assertEqual(second['label'], 'V1')
        self.assertNotEqual(first['id'], second['id'])
        with self.assertRaises(ValueError):
            self.store.create_image_job('prj_kunqu_lamp', {'base_version_id': first['id']})
        self.assertEqual(len(self.store.workspaces['prj_kunqu_lamp']['versions']), 1)

    def test_versions_keep_submitted_direction_when_active_direction_changes(self):
        workspace = self.store.workspaces['prj_suzhou_incense']
        initial_direction = workspace['project']['active_direction_id']
        job = self.store.create_image_job('prj_suzhou_incense', {})
        self.store.create_direction('prj_suzhou_incense', {'name': '框景'})
        self.store.complete_image_job(job['id'], {'id': 'frozen', 'kind': 'image', 'url': 'data:image/png;base64,cG5n'})
        self.assertEqual(job['direction_id'], initial_direction)
        self.assertEqual(workspace['versions'][0]['direction_id'], initial_direction)
        public = WorkspaceOut.model_validate(workspace).model_dump()
        self.assertEqual(public['versions'][0]['direction_id'], initial_direction)
        self.assertEqual(public['jobs'][0]['direction_id'], initial_direction)

    def test_brief_revision_number_tracks_recorded_turn(self):
        self.store.record_turn('prj_suzhou_incense', {
            'id': 'turn_revision', 'brief_patch': {'confirmed': {'material': '陶瓷'}},
        })
        self.assertEqual(self.store.workspaces['prj_suzhou_incense']['project']['brief_revision'], 1)

    def test_retried_image_and_rodin_job_retain_original_direction(self):
        workspace = self.store.workspaces['prj_suzhou_incense']
        initial = workspace['active_direction_id']
        job = self.store.create_image_job('prj_suzhou_incense', {})
        self.store.fail_generation_job(job['id'], 'temporary failure')
        self.store.create_direction('prj_suzhou_incense', {'name': '框景'})
        retry = self.store.retry_generation_job(job['id'])
        self.assertEqual(retry['direction_id'], initial)
        self.store.complete_image_job(retry['id'], {
            'id': 'retry_image', 'kind': 'image', 'url': '/image.png', 'path': 'outputs/image.png',
        })
        version = workspace['versions'][0]
        self.store.select_candidate_version('prj_suzhou_incense', version['id'])
        rodin = self.store.create_rodin_job('prj_suzhou_incense', {'version_id': version['id']})
        self.assertEqual(rodin['direction_id'], initial)

    def test_project_cards_report_latest_version_counts_and_pending_work(self):
        version = self._generate('prj_suzhou_incense', 'image_1')
        workspace = self.store.workspaces['prj_suzhou_incense']
        version['artifacts'].append({'id': 'model_1', 'kind': 'model_glb', 'url': '/model.glb'})
        cards = {item['id']: item for item in self.store.list_projects()}
        card = cards['prj_suzhou_incense']
        self.assertEqual(len(cards), 3)
        self.assertEqual(card['stage'], 'reviewing')
        self.assertEqual(card['latest_version_id'], version['id'])
        self.assertEqual(card['latest_version_label'], 'V1')
        self.assertEqual(card['image_count'], 1)
        self.assertEqual(card['model_count'], 1)
        self.assertGreater(card['pending_count'], 0)
        self.assertEqual(card['updated_at'], workspace['project']['updated_at'])
        empty_card = cards['prj_kunqu_lamp']
        self.assertIsNone(empty_card['latest_version_id'])
        self.assertEqual(empty_card['image_count'], 0)
        self.assertEqual(empty_card['model_count'], 0)


if __name__ == '__main__':
    unittest.main()
