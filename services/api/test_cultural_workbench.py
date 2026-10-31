import base64
import json
import unittest
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from app.cultural_workbench import create_seed_workspace
from app.intent import interpret_turn
from app.main import app, store


PROHIBITED_RUNTIME_TERMS = (
    "garment_type",
    "collar",
    "fabric_reference",
    "服装",
    "面料",
    "领口",
)


class CulturalWorkbenchDomainTests(unittest.TestCase):
    def _domain(self):
        from app.cultural_workbench import (
            append_brief_revision,
            create_seed_workspace,
            transition_stage,
        )

        return create_seed_workspace, append_brief_revision, transition_stage

    def test_seed_workspace_contains_only_cultural_product_domain(self):
        create_seed_workspace, _, _ = self._domain()

        workspace = create_seed_workspace()
        serialized = json.dumps(workspace, ensure_ascii=False)

        self.assertEqual(workspace["project"]["id"], "prj_suzhou_incense")
        self.assertEqual(workspace["project"]["product_type"], "桌面香插")
        self.assertEqual(workspace["project"]["stage"], "capturing")
        self.assertTrue(workspace["culture"])
        self.assertTrue(
            {item["kind"] for item in workspace["culture"]}.issubset(
                {"fact", "translation", "generated", "to_verify"}
            )
        )
        for term in PROHIBITED_RUNTIME_TERMS:
            self.assertNotIn(term, serialized)

    def test_brief_revision_is_immutable(self):
        create_seed_workspace, append_brief_revision, _ = self._domain()
        workspace = create_seed_workspace()
        original = workspace["brief_revisions"][0]

        updated = append_brief_revision(
            workspace,
            confirmed={"function": "可放线香"},
            assumptions={"material": "哑光陶瓷"},
            source_turn_id="turn_1",
        )

        self.assertEqual(original["revision"], 0)
        self.assertNotIn("function", original["confirmed"])
        self.assertEqual(updated["revision"], 1)
        self.assertEqual(updated["confirmed"]["function"], "可放线香")
        self.assertEqual(updated["source_turn_id"], "turn_1")
        self.assertEqual(len(workspace["brief_revisions"]), 2)

    def test_stage_can_return_from_review_to_concept(self):
        create_seed_workspace, _, transition_stage = self._domain()
        workspace = create_seed_workspace()
        workspace["project"]["stage"] = "reviewing"

        gate = transition_stage(workspace, "concepting", reason="评审后继续探索")

        self.assertEqual(workspace["project"]["stage"], "concepting")
        self.assertEqual(gate["stage"], "concepting")
        self.assertEqual(gate["status"], "active")
        self.assertEqual(gate["reason"], "评审后继续探索")

    def test_runtime_source_has_no_fashion_surface(self):
        repository_root = Path(__file__).resolve().parents[2]
        runtime_files = [
            repository_root / "services/api/app/store.py",
            repository_root / "services/api/app/main.py",
            repository_root / "services/api/app/schemas.py",
            repository_root / "src/App.tsx",
        ]
        runtime_files.extend(
            path
            for path in (repository_root / "src/components").glob("*.tsx")
            if not path.name.endswith(".test.tsx")
        )
        serialized = "\n".join(path.read_text() for path in runtime_files)
        for term in PROHIBITED_RUNTIME_TERMS:
            self.assertNotIn(term, serialized, f"runtime still contains {term}")


class CulturalWorkbenchApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        store.workspaces["prj_suzhou_incense"] = create_seed_workspace()

    def test_workspace_route_returns_seed_project(self):
        response = self.client.get("/api/workbench/projects/prj_suzhou_incense")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["project"]["product_type"], "桌面香插")
        self.assertEqual(payload["project"]["stage"], "capturing")

    def test_health_reports_text_interpreter_mode(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["text_provider"], "demo-fallback")

    def test_unknown_project_is_404(self):
        response = self.client.get("/api/workbench/projects/not-found")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "文创项目不存在")

    def test_first_turn_on_natural_language_project_creates_initial_direction(self):
        fresh = store.create_project({
            "name": "语音创建的苏州香插",
            "product_type": "桌面香插",
        })
        project_id = fresh["project"]["id"]

        response = self.client.post(
            f"/api/workbench/projects/{project_id}/turns",
            json={"text": "我想做一个现代的苏州园林漏景香插，保留框景和留白"},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["intent"], "DISCUSS")
        workspace = store.workspaces[project_id]
        self.assertEqual(len(workspace["directions"]), 1)
        self.assertEqual(workspace["active_direction_id"], workspace["directions"][0]["id"])
        self.assertEqual(workspace["project"]["active_direction_id"], workspace["directions"][0]["id"])
        self.assertIn("漏景", workspace["directions"][0]["name"])

    def test_initial_idea_creates_restatement_and_brief_revision(self):
        response = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/turns",
            json={"text": "我想做一个年轻人用的苏州园林香插，不要太传统。"},
        )

        self.assertEqual(response.status_code, 201)
        turn = response.json()
        self.assertIn("桌面香插", turn["restatement"])
        self.assertIn("现代", turn["restatement"])
        self.assertEqual(turn["brief_revision"], 1)

        workspace = self.client.get(
            "/api/workbench/projects/prj_suzhou_incense"
        ).json()
        brief = workspace["brief_revisions"][-1]
        self.assertEqual(brief["confirmed"]["product_type"], "桌面香插")
        self.assertEqual(brief["confirmed"]["target_user"], "年轻用户")
        self.assertEqual(brief["confirmed"]["negative_constraints"], "避免仿古与符号堆砌")

    def test_modify_turn_extracts_change_preserve_constraint(self):
        response = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/turns",
            json={"text": "保留漏景，镂空简单一点，底座更稳。"},
        )

        self.assertEqual(response.status_code, 201)
        turn = response.json()
        self.assertEqual(turn["intent"], "MODIFY")
        self.assertEqual(
            turn["change_patch"]["changes"]["hollow_structure"], "simplified"
        )
        self.assertIn("leak_view", turn["change_patch"]["preserve"])
        self.assertIn("stable_base", turn["change_patch"]["constraints"])

    def test_confirmed_modification_generation_is_a_generate_intent(self):
        turn = interpret_turn(
            "确认修改并生成新版。",
            create_seed_workspace(),
        )

        self.assertEqual(turn.intent, "GENERATE")

    def test_negated_confirmation_does_not_start_generation(self):
        turn = interpret_turn(
            "还不能确认修改并生成新版，继续讨论。",
            create_seed_workspace(),
        )

        self.assertEqual(turn.intent, "DISCUSS")

    def test_confirmed_generation_reuses_the_latest_pending_modification(self):
        workspace = store.workspaces["prj_suzhou_incense"]
        first_job = store.create_image_job("prj_suzhou_incense", {})
        store.complete_image_job(
            first_job["id"],
            {
                "id": "image_v1",
                "kind": "image",
                "path": "outputs/images/v1.png",
                "url": "/api/workbench/assets/image_v1",
                "media_type": "image/png",
                "view_label": "front",
            },
        )
        v1 = workspace["versions"][0]
        modify = store.record_turn(
            "prj_suzhou_incense",
            interpret_turn(
                "保留漏景，镂空简单一点，底座更稳。",
                workspace,
            ).model_dump(),
        )
        store.record_turn(
            "prj_suzhou_incense",
            interpret_turn("确认。", workspace).model_dump(),
        )
        confirm = store.record_turn(
            "prj_suzhou_incense",
            {
                **interpret_turn("确认修改并生成新版。", workspace).model_dump(),
                "change_patch": {
                    "changes": {"modification_scope": "沿用当前修改"},
                    "preserve": ["通用确认项"],
                    "constraints": [],
                },
            },
        )

        job = store.create_image_job(
            "prj_suzhou_incense",
            {
                "source_turn_id": confirm["id"],
                "base_version_id": v1["id"],
            },
        )

        self.assertEqual(job["change_source_turn_id"], modify["id"])
        self.assertIn('"hollow_structure": "simplified"', job["prompt"])
        self.assertIn('"leak_view"', job["prompt"])
        self.assertIn('"stable_base"', job["prompt"])

        store.complete_image_job(
            job["id"],
            {
                "id": "image_v2",
                "kind": "image",
                "path": "outputs/images/v2.png",
                "url": "/api/workbench/assets/image_v2",
                "media_type": "image/png",
                "view_label": "front",
            },
        )
        v2 = workspace["versions"][-1]
        self.assertEqual(v2["parent_version_id"], v1["id"])
        self.assertEqual(v2["source_turn_id"], confirm["id"])
        self.assertEqual(v2["change_source_turn_id"], modify["id"])
        self.assertEqual(v2["changed_fields"]["hollow_structure"], "simplified")
        self.assertIn("leak_view", v2["preserved_fields"])
        self.assertIn("stable_base", v2["constraints"])

    def test_discuss_only_does_not_create_job(self):
        response = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/turns",
            json={"text": "只是讨论一下材质，先别生成。"},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["intent"], "DISCUSS")
        workspace = self.client.get(
            "/api/workbench/projects/prj_suzhou_incense"
        ).json()
        self.assertEqual(workspace["jobs"], [])

    def test_corrected_transcript_keeps_original_turn_history(self):
        first = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/turns",
            json={"text": "底座要轻。"},
        ).json()

        corrected = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/turns",
            json={"text": "底座要稳。", "corrected_turn_id": first["id"]},
        )

        self.assertEqual(corrected.status_code, 201)
        self.assertEqual(corrected.json()["correction_of"], first["id"])
        workspace = self.client.get(
            "/api/workbench/projects/prj_suzhou_incense"
        ).json()
        self.assertEqual(len(workspace["turns"]), 2)
        self.assertEqual(workspace["turns"][0]["text"], "底座要轻。")
        self.assertEqual(workspace["turns"][1]["text"], "底座要稳。")

    def test_culture_kind_is_restricted_to_four_values(self):
        response = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/culture",
            json={
                "kind": "legend",
                "title": "未经定义的类别",
                "statement": "不应被接受",
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_cultural_fact_requires_a_source_title(self):
        response = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/culture",
            json={
                "kind": "fact",
                "title": "没有来源的事实",
                "statement": "这条内容不能直接成为文化事实。",
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_cultural_fact_can_be_downgraded_to_to_verify(self):
        created = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/culture",
            json={
                "kind": "fact",
                "title": "待复核园林说法",
                "statement": "先按文化事实录入。",
                "source_title": "内部资料卡",
                "source_url": "file://内部资料卡.pdf",
                "note": "核验时间：2026-10-31",
                "verified": True,
            },
        )
        self.assertEqual(created.status_code, 201)

        response = self.client.patch(
            "/api/workbench/projects/prj_suzhou_incense/culture/"
            + created.json()["id"],
            json={"kind": "to_verify", "verified": False},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["kind"], "to_verify")
        self.assertFalse(response.json()["verified"])

    def test_customer_safe_culture_excludes_unverified_and_generated_claims(self):
        self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/culture",
            json={
                "kind": "fact",
                "title": "已核验资料",
                "statement": "可进入客户提案的文化事实。",
                "source_title": "权威资料",
                "source_url": "https://example.com/source",
                "note": "核验时间：2026-10-31",
                "verified": True,
            },
        )
        self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/culture",
            json={
                "kind": "generated",
                "title": "AI 想象",
                "statement": "不能伪装成文化事实。",
            },
        )

        safe = store.customer_safe_culture("prj_suzhou_incense")
        titles = {item["title"] for item in safe}

        self.assertIn("已核验资料", titles)
        self.assertIn("漏景的产品转译", titles)
        self.assertNotIn("AI 想象", titles)
        self.assertNotIn("漏景", titles)

    def test_verified_cultural_fact_requires_complete_evidence(self):
        response = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/culture",
            json={
                "kind": "fact",
                "title": "缺少证据的事实",
                "statement": "不能只靠来源标题核验。",
                "source_title": "资料卡",
                "verified": True,
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertIn("来源 URL 或文件标识", response.json()["detail"])

    def test_patch_verification_requires_evidence_and_accepts_complete_record(self):
        created = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/culture",
            json={
                "kind": "fact",
                "title": "待核验事实",
                "statement": "待补齐证据。",
                "source_title": "资料卡",
                "verified": False,
            },
        ).json()
        incomplete = self.client.patch(
            "/api/workbench/projects/prj_suzhou_incense/culture/" + created["id"],
            json={"verified": True},
        )
        self.assertEqual(incomplete.status_code, 422)
        complete = self.client.patch(
            "/api/workbench/projects/prj_suzhou_incense/culture/" + created["id"],
            json={
                "source_url": "file://资料卡.pdf",
                "note": "核验时间：2026-10-31",
                "verified": True,
            },
        )
        self.assertEqual(complete.status_code, 200)
        self.assertTrue(complete.json()["verified"])

    def test_image_job_api_creates_version_and_serves_asset(self):
        turn = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/turns",
            json={"text": "生成一版苏州园林桌面香插。"},
        ).json()

        submitted = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/image-jobs",
            json={"source_turn_id": turn["id"]},
        )
        self.assertEqual(submitted.status_code, 202)

        job = self.client.get(
            "/api/workbench/projects/prj_suzhou_incense/jobs/"
            + submitted.json()["id"]
        )
        self.assertEqual(job.status_code, 200)
        self.assertEqual(job.json()["status"], "completed")

        versions = self.client.get(
            "/api/workbench/projects/prj_suzhou_incense/versions"
        ).json()
        self.assertEqual(len(versions), 1)
        asset_url = versions[0]["artifacts"][0]["url"]
        asset = self.client.get(asset_url)
        self.assertEqual(asset.status_code, 200)
        self.assertGreater(len(asset.content), 100)

    def test_first_image_generation_accepts_brief_preserve_without_modify_gate(self):
        """Brief constraints on V1 are not evidence of an existing image edit."""
        turn = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/turns",
            json={"text": "生成吧"},
        ).json()

        with patch("app.main.run_workbench_image_job", new=AsyncMock()):
            submitted = self.client.post(
                "/api/workbench/projects/prj_suzhou_incense/image-jobs",
                json={
                    "source_turn_id": turn["id"],
                    "preserve": ["面向年轻用户", "现代化表达"],
                },
            )

        self.assertEqual(submitted.status_code, 202, submitted.json())
        self.assertIsNone(submitted.json()["base_version_id"])
        self.assertEqual(submitted.json()["preserve"], ["面向年轻用户", "现代化表达"])

    def test_existing_concept_image_can_be_imported_as_version(self):
        png = b"\x89PNG\r\n\x1a\n" + b"verified-image-bytes"
        response = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/image-imports",
            json={
                "data_url": "data:image/png;base64," + base64.b64encode(png).decode(),
                "source_turn_id": None,
                "base_version_id": None,
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["status"], "completed")
        versions = self.client.get(
            "/api/workbench/projects/prj_suzhou_incense/versions"
        ).json()
        self.assertEqual(len(versions), 1)
        self.assertEqual(versions[0]["artifacts"][0]["source"], "imported")
        asset = self.client.get(versions[0]["artifacts"][0]["url"])
        self.assertEqual(asset.content, png)

    def test_rodin_api_forwards_frozen_image_and_attaches_provenance(self):
        from app.main import rodin_provider
        from app.providers.rodin import RodinFile, RodinResult

        image_directory = tempfile.TemporaryDirectory()
        self.addCleanup(image_directory.cleanup)
        image_path = Path(image_directory.name) / "front.png"
        image_path.write_bytes(b"\x89PNG\r\n\x1a\nexample")
        image_job = store.create_image_job("prj_suzhou_incense", {})
        store.complete_image_job(
            image_job["id"],
            {
                "id": "image_front",
                "kind": "image",
                "path": str(image_path),
                "url": "/api/workbench/assets/image_front",
                "media_type": "image/png",
                "view_label": "front",
            },
        )
        version = store.workspace_for_project("prj_suzhou_incense")["versions"][0]
        store.select_candidate_version("prj_suzhou_incense", version["id"])
        generated = RodinResult(
            generation_id="gen_from_image",
            status="completed",
            files=[
                RodinFile(
                    name="model.glb",
                    role="base",
                    path="outputs/rodin/model.glb",
                )
            ],
        )

        with patch.object(
            rodin_provider, "generate", new=AsyncMock(return_value=generated)
        ) as generate:
            submitted = self.client.post(
                "/api/workbench/projects/prj_suzhou_incense/rodin-jobs",
                json={"version_id": version["id"]},
            )

        self.assertEqual(submitted.status_code, 202)
        generate.assert_awaited_once_with(
            "",
            Path("outputs/rodin"),
            image_paths=[image_path],
        )
        workspace = self.client.get(
            "/api/workbench/projects/prj_suzhou_incense"
        ).json()
        artifact = workspace["versions"][0]["artifacts"][-1]
        self.assertEqual(artifact["input_mode"], "image")
        self.assertEqual(artifact["reference_artifact_ids"], ["image_front"])
        self.assertEqual(artifact["consistency_status"], "pending")

    def test_candidate_lock_and_customer_safe_proposal(self):
        turn = self.client.post(
            "/api/workbench/projects/prj_suzhou_incense/turns",
            json={"text": "生成一版苏州园林桌面香插。"},
        ).json()
        job = store.create_image_job(
            "prj_suzhou_incense", {"source_turn_id": turn["id"]}
        )
        store.complete_image_job(
            job["id"],
            {
                "id": "proposal_image",
                "kind": "image",
                "url": "data:image/png;base64,cG5n",
                "internal_note": "供应商内部备注不应外发",
            },
        )
        version_id = store.workspace_for_project("prj_suzhou_incense")["versions"][0]["id"]
        store.create_cultural_reference(
            "prj_suzhou_incense",
            {
                "kind": "generated",
                "title": "AI 想象故事",
                "statement": "不能作为文化事实进入提案。",
                "source_title": "",
                "source_url": "",
                "note": "内部备注",
                "verified": False,
            },
        )

        selected = self.client.post(
            f"/api/workbench/projects/prj_suzhou_incense/versions/{version_id}/candidate"
        )
        proposal = self.client.get(
            "/api/workbench/projects/prj_suzhou_incense/proposal"
        )

        self.assertEqual(selected.status_code, 200)
        self.assertEqual(selected.json()["status"], "selected")
        self.assertEqual(proposal.status_code, 200)
        payload = proposal.json()
        self.assertEqual(payload["version"]["id"], version_id)
        serialized = json.dumps(payload, ensure_ascii=False)
        self.assertIn("概念设计", payload["disclaimer"])
        self.assertIn("漏景的产品转译", serialized)
        self.assertNotIn("AI 想象故事", serialized)
        self.assertNotIn("供应商内部备注", serialized)
        self.assertNotIn("内部备注", serialized)

    def test_proposal_requires_selected_candidate(self):
        response = self.client.get(
            "/api/workbench/projects/prj_suzhou_incense/proposal"
        )
        self.assertEqual(response.status_code, 409)


class TextInterpreterProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_remove_phrase_is_a_modify_intent_in_fallback(self):
        from app.intent import interpret_turn

        result = interpret_turn("保留整体造型，把中间的线香去掉。", create_seed_workspace())

        self.assertEqual(result.intent, "MODIFY")
        self.assertEqual(result.change_patch.changes["remove_element"], "中间的线香")

    async def test_provider_structured_result_is_used_when_available(self):
        from app.intent import TextInterpretationProvider, interpret_turn_with_provider

        async def handler(request: httpx.Request) -> httpx.Response:
            self.assertNotIn("secret-token", str(request.url))
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps(
                                    {
                                        "intent": "MODIFY",
                                        "restatement": "只简化镂空，并保留漏景。",
                                        "changes": {"hollow_structure": "simplified"},
                                        "preserve": ["leak_view"],
                                        "constraints": [],
                                        "confirmed": {},
                                        "assumptions": {},
                                    },
                                    ensure_ascii=False,
                                )
                            }
                        }
                    ]
                },
            )

        provider = TextInterpretationProvider(
            base_url="https://example.test/v1",
            api_key="secret-token",
            model="text-model",
            transport=httpx.MockTransport(handler),
        )
        result = await interpret_turn_with_provider(
            "镂空简单一点，保留漏景。", create_seed_workspace(), provider
        )

        self.assertEqual(result.interpreter_mode, "provider")
        self.assertEqual(result.intent, "MODIFY")
        self.assertEqual(result.change_patch.changes["hollow_structure"], "simplified")
        self.assertNotIn("secret-token", result.model_dump_json())

    async def test_provider_normalizes_a_list_of_changes_without_falling_back(self):
        from app.intent import TextInterpretationProvider, interpret_turn_with_provider

        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps(
                                    {
                                        "intent": "MODIFY",
                                        "restatement": "去掉中间的线香，保留整体造型。",
                                        "changes": ["去掉中间的线香"],
                                        "preserve": ["整体造型"],
                                        "constraints": [],
                                        "confirmed": {},
                                        "assumptions": {},
                                    },
                                    ensure_ascii=False,
                                )
                            }
                        }
                    ]
                },
            )

        provider = TextInterpretationProvider(
            base_url="https://example.test/v1",
            api_key="secret-token",
            model="text-model",
            transport=httpx.MockTransport(handler),
        )
        result = await interpret_turn_with_provider(
            "把中间的线香去掉。", create_seed_workspace(), provider
        )

        self.assertEqual(result.interpreter_mode, "provider")
        self.assertEqual(
            result.change_patch.changes["requested_changes"],
            ["去掉中间的线香"],
        )

    async def test_confirmed_generation_overrides_a_provider_modify_misclassification(self):
        from app.intent import TextInterpretationProvider, interpret_turn_with_provider

        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps(
                                    {
                                        "intent": "MODIFY",
                                        "restatement": "确认修改并生成新版。",
                                        "changes": {},
                                        "preserve": [],
                                        "constraints": [],
                                        "confirmed": {},
                                        "assumptions": {},
                                    },
                                    ensure_ascii=False,
                                )
                            }
                        }
                    ]
                },
            )

        provider = TextInterpretationProvider(
            base_url="https://example.test/v1",
            api_key="secret-token",
            model="text-model",
            transport=httpx.MockTransport(handler),
        )
        result = await interpret_turn_with_provider(
            "确认修改并生成新版。", create_seed_workspace(), provider
        )

        self.assertEqual(result.interpreter_mode, "provider")
        self.assertEqual(result.intent, "GENERATE")

    async def test_no_generation_phrase_overrides_provider_modify_result(self):
        from app.intent import TextInterpretationProvider, interpret_turn_with_provider

        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": json.dumps(
                                    {
                                        "intent": "MODIFY",
                                        "restatement": "继续讨论，不生成。",
                                        "changes": {},
                                        "preserve": [],
                                        "constraints": [],
                                        "confirmed": {},
                                        "assumptions": {},
                                    },
                                    ensure_ascii=False,
                                )
                            }
                        }
                    ]
                },
            )

        provider = TextInterpretationProvider(
            base_url="https://example.test/v1",
            api_key="secret-token",
            model="text-model",
            transport=httpx.MockTransport(handler),
        )
        result = await interpret_turn_with_provider(
            "确认修改，但先别生成新版。", create_seed_workspace(), provider
        )

        self.assertEqual(result.interpreter_mode, "provider")
        self.assertEqual(result.intent, "DISCUSS")

    async def test_provider_failure_falls_back_without_losing_turn(self):
        from app.intent import TextInterpretationProvider, interpret_turn_with_provider

        async def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(503, text="unavailable")

        provider = TextInterpretationProvider(
            base_url="https://example.test/v1",
            api_key="secret-token",
            model="text-model",
            transport=httpx.MockTransport(handler),
        )
        result = await interpret_turn_with_provider(
            "保留漏景，底座更稳。", create_seed_workspace(), provider
        )

        self.assertEqual(result.interpreter_mode, "fallback")
        self.assertEqual(result.intent, "MODIFY")
        self.assertIn("stable_base", result.change_patch.constraints)


class ImageJobLifecycleTests(unittest.TestCase):
    def setUp(self):
        from app.store import MemoryStore

        self.store = MemoryStore()
        self.project_id = "prj_suzhou_incense"

    def _record_turn(self, text: str):
        from app.intent import interpret_turn

        workspace = self.store.workspace_for_project(self.project_id)
        turn = interpret_turn(text, workspace).model_dump()
        return self.store.record_turn(self.project_id, turn)

    def test_image_job_creates_immutable_v1_without_auto_selecting_candidate(self):
        turn = self._record_turn("我想做一个年轻人用的苏州园林香插，不要太传统。")
        job = self.store.create_image_job(
            self.project_id, {"source_turn_id": turn["id"]}
        )

        completed = self.store.complete_image_job(
            job["id"],
            {
                "id": "artifact_image_v1",
                "kind": "image",
                "url": "data:image/png;base64,cG5n",
                "path": "outputs/images/v1.png",
            },
        )
        workspace = self.store.workspace_for_project(self.project_id)

        self.assertEqual(completed["status"], "completed")
        self.assertEqual(len(workspace["versions"]), 1)
        self.assertEqual(workspace["versions"][0]["label"], "V1")
        self.assertIsNone(workspace["versions"][0]["parent_version_id"])
        self.assertIsNone(workspace["project"]["candidate_version_id"])

    def test_image_job_moves_project_from_concepting_to_reviewing(self):
        turn = self._record_turn("生成一版苏州园林香插。")

        job = self.store.create_image_job(
            self.project_id, {"source_turn_id": turn["id"]}
        )
        workspace = self.store.workspace_for_project(self.project_id)
        self.assertEqual(workspace["project"]["stage"], "concepting")

        self.store.complete_image_job(
            job["id"],
            {
                "id": "image_for_review",
                "kind": "image",
                "url": "data:image/png;base64,cG5n",
                "path": "outputs/images/review.png",
            },
        )

        self.assertEqual(workspace["project"]["stage"], "reviewing")
        self.assertEqual(
            workspace["stage_gates"][-1]["reason"],
            "二维概念已生成，等待锁定候选版本",
        )

    def test_image_job_v2_records_parent_and_change_patch(self):
        first_turn = self._record_turn("生成一版苏州园林香插。")
        first_job = self.store.create_image_job(
            self.project_id, {"source_turn_id": first_turn["id"]}
        )
        self.store.complete_image_job(
            first_job["id"],
            {"id": "image_v1", "kind": "image", "url": "data:image/png;base64,cG5n"},
        )
        v1 = self.store.workspace_for_project(self.project_id)["versions"][0]
        second_turn = self._record_turn("保留漏景，镂空简单一点，底座更稳。")
        second_job = self.store.create_image_job(
            self.project_id,
            {"source_turn_id": second_turn["id"], "base_version_id": v1["id"]},
        )

        self.store.complete_image_job(
            second_job["id"],
            {"id": "image_v2", "kind": "image", "url": "data:image/png;base64,cG5nMg=="},
        )
        v2 = self.store.workspace_for_project(self.project_id)["versions"][-1]

        self.assertEqual(v2["label"], "V2")
        self.assertEqual(v2["parent_version_id"], v1["id"])
        self.assertEqual(v2["changed_fields"]["hollow_structure"], "simplified")
        self.assertIn("leak_view", v2["preserved_fields"])

    def test_stale_image_job_is_retained_without_replacing_candidate(self):
        turn = self._record_turn("生成一版苏州园林香插。")
        job = self.store.create_image_job(
            self.project_id, {"source_turn_id": turn["id"]}
        )
        workspace = self.store.workspace_for_project(self.project_id)
        workspace["project"]["candidate_version_id"] = "version_selected"
        self._record_turn("只是讨论一下材质，先别生成。")

        result = self.store.complete_image_job(
            job["id"],
            {"id": "late_image", "kind": "image", "url": "data:image/png;base64,cG5n"},
        )

        self.assertEqual(result["status"], "stale")
        self.assertEqual(workspace["project"]["candidate_version_id"], "version_selected")
        self.assertEqual(len(workspace["versions"]), 1)

    def test_failed_image_job_can_be_retried_without_empty_version(self):
        turn = self._record_turn("生成一版苏州园林香插。")
        job = self.store.create_image_job(
            self.project_id, {"source_turn_id": turn["id"]}
        )

        failed = self.store.fail_generation_job(job["id"], "图片服务没有返回内容")
        retried = self.store.retry_generation_job(job["id"])
        workspace = self.store.workspace_for_project(self.project_id)

        self.assertEqual(failed["status"], "failed")
        self.assertEqual(workspace["versions"], [])
        self.assertEqual(retried["status"], "submitted")
        self.assertEqual(retried["attempt"], 2)
        self.assertEqual(retried["retry_of"], job["id"])


class RodinJobLifecycleTests(unittest.TestCase):
    def setUp(self):
        from app.intent import interpret_turn
        from app.store import MemoryStore

        self.store = MemoryStore()
        self.project_id = "prj_suzhou_incense"
        workspace = self.store.workspace_for_project(self.project_id)
        turn = interpret_turn("生成一版苏州园林香插。", workspace).model_dump()
        turn = self.store.record_turn(self.project_id, turn)
        image_job = self.store.create_image_job(
            self.project_id, {"source_turn_id": turn["id"]}
        )
        self.store.complete_image_job(
            image_job["id"],
            {
                "id": "image_seed",
                "kind": "image",
                "url": "/api/workbench/assets/image_seed",
                "path": "outputs/images/seed.png",
                "media_type": "image/png",
                "view_label": "front",
            },
        )
        self.version = workspace["versions"][0]
        self.store.select_candidate_version(self.project_id, self.version["id"])

    def test_rodin_job_requires_the_locked_candidate_version(self):
        workspace = self.store.workspace_for_project(self.project_id)
        workspace["project"]["candidate_version_id"] = None
        self.version["status"] = "draft"
        with self.assertRaisesRegex(ValueError, "锁定.*候选"):
            self.store.create_rodin_job(
                self.project_id, {"version_id": self.version["id"]}
            )

        self.store.select_candidate_version(self.project_id, self.version["id"])
        job = self.store.create_rodin_job(
            self.project_id, {"version_id": self.version["id"]}
        )
        workspace = self.store.workspace_for_project(self.project_id)

        self.assertEqual(job["status"], "submitted")
        self.assertEqual(workspace["project"]["stage"], "prototyping")

    def test_rodin_completion_returns_candidate_to_review(self):
        job = self.store.create_rodin_job(
            self.project_id, {"version_id": self.version["id"]}
        )

        self.store.complete_rodin_job(
            job["id"],
            {
                "id": "review_glb",
                "kind": "model_glb",
                "path": "outputs/rodin/review.glb",
                "url": "/api/workbench/assets/review_glb",
            },
        )
        workspace = self.store.workspace_for_project(self.project_id)

        self.assertEqual(workspace["project"]["stage"], "reviewing")
        self.assertEqual(
            workspace["stage_gates"][-1]["reason"],
            "二维与三维成果已关联，等待评审",
        )

    def test_default_rodin_job_freezes_image_reference_snapshot(self):
        job = self.store.create_rodin_job(
            self.project_id, {"version_id": self.version["id"]}
        )

        self.assertEqual(job["input_mode"], "image")
        self.assertEqual(job["reference_artifact_ids"], ["image_seed"])
        self.assertEqual(
            job["reference_snapshot"],
            [
                {
                    "artifact_id": "image_seed",
                    "path": "outputs/images/seed.png",
                    "media_type": "image/png",
                    "view_label": "front",
                }
            ],
        )
        self.assertEqual(job["consistency_status"], "pending")
        self.assertEqual(job["prompt"], "")

    def test_default_rodin_job_rejects_version_without_local_image(self):
        self.version["artifacts"][0].pop("path")

        with self.assertRaisesRegex(ValueError, "二维参考图"):
            self.store.create_rodin_job(
                self.project_id, {"version_id": self.version["id"]}
            )

    def test_rodin_job_selects_at_most_five_views_in_stable_order(self):
        self.version["artifacts"].extend(
            {
                "id": f"image_{label}",
                "kind": "image",
                "path": f"outputs/images/{label}.png",
                "media_type": "image/png",
                "view_label": label,
            }
            for label in ["unknown", "top", "back", "right", "left", "unknown"]
        )

        job = self.store.create_rodin_job(
            self.project_id, {"version_id": self.version["id"]}
        )

        self.assertEqual(
            [item["view_label"] for item in job["reference_snapshot"]],
            ["front", "left", "right", "back", "top"],
        )
        self.assertEqual(len(job["reference_snapshot"]), 5)

    def test_rodin_retry_preserves_original_reference_snapshot(self):
        job = self.store.create_rodin_job(
            self.project_id, {"version_id": self.version["id"]}
        )
        original_snapshot = list(job["reference_snapshot"])
        self.version["artifacts"].append(
            {
                "id": "image_added_later",
                "kind": "image",
                "path": "outputs/images/later.png",
                "media_type": "image/png",
                "view_label": "back",
            }
        )
        self.store.fail_generation_job(job["id"], "Rodin CLI 执行失败")

        retried = self.store.retry_generation_job(job["id"])

        self.assertEqual(retried["reference_snapshot"], original_snapshot)
        self.assertEqual(retried["reference_artifact_ids"], ["image_seed"])

    def test_rodin_job_attaches_glb_without_creating_duplicate_version(self):
        job = self.store.create_rodin_job(
            self.project_id, {"version_id": self.version["id"]}
        )
        self.assertEqual(job["status"], "submitted")
        self.assertEqual(self.store.start_generation_job(job["id"])["status"], "processing")

        completed = self.store.complete_rodin_job(
            job["id"],
            {
                "id": "artifact_glb_v1",
                "kind": "model_glb",
                "path": "outputs/rodin/model.glb",
                "url": "/api/workbench/assets/artifact_glb_v1",
                "generation_id": "gen_1",
                "disclaimer": "概念模型，不是生产 CAD",
            },
        )
        workspace = self.store.workspace_for_project(self.project_id)

        self.assertEqual(completed["status"], "completed")
        self.assertEqual(len(workspace["versions"]), 1)
        self.assertEqual(len(workspace["versions"][0]["artifacts"]), 2)
        self.assertEqual(
            workspace["versions"][0]["artifacts"][-1]["disclaimer"],
            "概念模型，不是生产 CAD",
        )

    def test_failed_rodin_job_can_be_retried(self):
        job = self.store.create_rodin_job(
            self.project_id, {"version_id": self.version["id"]}
        )
        self.store.fail_generation_job(job["id"], "Rodin CLI 执行失败")

        retried = self.store.retry_generation_job(job["id"])

        self.assertEqual(retried["kind"], "rodin")
        self.assertEqual(retried["attempt"], 2)
        self.assertEqual(retried["retry_of"], job["id"])
        self.assertEqual(retried["version_id"], self.version["id"])

    def test_late_rodin_job_is_stale_but_attaches_to_original_version(self):
        job = self.store.create_rodin_job(
            self.project_id, {"version_id": self.version["id"]}
        )
        from app.intent import interpret_turn

        workspace = self.store.workspace_for_project(self.project_id)
        turn = interpret_turn("保留漏景，镂空简单一点，底座更稳。", workspace).model_dump()
        turn = self.store.record_turn(self.project_id, turn)
        image_job = self.store.create_image_job(
            self.project_id,
            {"source_turn_id": turn["id"], "base_version_id": self.version["id"]},
        )
        self.store.complete_image_job(
            image_job["id"],
            {"id": "image_v2", "kind": "image", "url": "data:image/png;base64,cG5nMg=="},
        )

        completed = self.store.complete_rodin_job(
            job["id"],
            {
                "id": "late_glb",
                "kind": "model_glb",
                "path": "outputs/rodin/late.glb",
                "url": "/api/workbench/assets/late_glb",
                "generation_id": "gen_late",
                "disclaimer": "概念模型，不是生产 CAD",
            },
        )

        self.assertEqual(completed["status"], "stale")
        self.assertEqual(len(workspace["versions"]), 2)
        self.assertIn("late_glb", [item["id"] for item in self.version["artifacts"]])


if __name__ == "__main__":
    unittest.main()
