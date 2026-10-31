from __future__ import annotations

import base64
import html
import json
import secrets
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from .cultural_workbench import (
    CULTURE_KINDS,
    append_brief_revision,
    create_seed_workspaces,
    transition_stage,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(5)}"


def svg_data_url(title: str, subtitle: str, hue: str, revision: int = 1) -> str:
    safe_title = html.escape(title)
    safe_subtitle = html.escape(subtitle)
    svg = f"""<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1280' viewBox='0 0 1024 1280'>
      <defs><linearGradient id='bg' x1='0' x2='1' y1='0' y2='1'><stop stop-color='#f3efe6'/><stop offset='1' stop-color='#dce5dd'/></linearGradient></defs>
      <rect width='1024' height='1280' fill='url(#bg)'/>
      <path d='M322 290 Q512 105 702 290 L702 900 Q512 1000 322 900 Z' fill='{hue}' opacity='.86'/>
      <path d='M406 350 Q512 235 618 350 L618 740 Q512 820 406 740 Z' fill='#e9eee7'/>
      <path d='M512 220 L512 540' stroke='#7c6656' stroke-width='8'/>
      <circle cx='512' cy='218' r='12' fill='#a34836'/>
      <text x='64' y='1080' font-family='sans-serif' font-size='38' fill='#2f3d38'>{safe_title}</text>
      <text x='64' y='1132' font-family='sans-serif' font-size='22' fill='#69766f'>{safe_subtitle}</text>
      <text x='64' y='1190' font-family='sans-serif' font-size='16' fill='#8d958f'>SUZUO CONCEPT / V{revision}</text>
    </svg>"""
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


class MemoryStore:
    """Single-user in-memory store for the cultural-creative MVP."""

    backend = "memory"

    def __init__(self) -> None:
        self.workspaces: dict[str, dict[str, Any]] = create_seed_workspaces()

    def list_projects(self) -> list[dict[str, Any]]:
        """Return project cards derived from each project's own workspace."""
        cards = []
        for workspace in self.workspaces.values():
            versions = workspace["versions"]
            latest = versions[-1] if versions else None
            artifacts = [artifact for version in versions for artifact in version["artifacts"]]
            pending = sum(job["status"] in {"submitted", "processing", "failed", "stale"}
                          for job in workspace["jobs"])
            pending += sum(version["status"] in {"draft", "reviewing"} for version in versions)
            pending += sum(entry["kind"] == "to_verify" or
                           (entry["kind"] == "fact" and not entry.get("verified"))
                           for entry in workspace["culture"])
            cards.append({
                **deepcopy(workspace["project"]),
                "latest_version_id": latest["id"] if latest else None,
                "latest_version_label": latest["label"] if latest else None,
                "image_count": sum(item.get("kind") == "image" for item in artifacts),
                "model_count": sum(item.get("kind") == "model_glb" for item in artifacts),
                "pending_count": pending,
            })
        return cards

    def create_project(self, payload: dict[str, Any]) -> dict[str, Any]:
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("项目名称不能为空")
        now = now_iso()
        project = {
            "id": new_id("prj"), "name": name.strip(),
            "product_type": payload.get("product_type") or "",
            "owner": payload.get("owner") or "",
            "collaborators": deepcopy(payload.get("collaborators") or []),
            "target_user": payload.get("target_user") or "",
            "use_scene": payload.get("use_scene") or "",
            "stage": "capturing", "stage_status": "active",
            "active_direction_id": None, "candidate_version_id": None,
            "brief_revision": 0, "created_at": now, "updated_at": now,
        }
        workspace = {
            "project": project, "active_direction_id": None,
            "directions": [], "culture": [], "assets": [], "reviews": [],
            "proposals": [], "turns": [], "versions": [], "jobs": [],
            "brief_revisions": [{
                "revision": 0, "confirmed": {}, "assumptions": {},
                "conflicts": [], "missing": [], "source_turn_id": None,
                "created_at": now,
            }],
            "stage_gates": [{"stage": "capturing", "status": "active",
                             "reason": "等待用户表达第一轮设计意图", "updated_at": now}],
        }
        self.workspaces[project["id"]] = workspace
        return workspace

    def create_direction(self, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        workspace = self.workspaces[project_id]
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("方向名称不能为空")
        now = now_iso()
        direction = {
            "id": new_id("direction"), "name": name.strip(),
            "concept": payload.get("concept") or "", "status": "draft",
            "culture_ids": deepcopy(payload.get("culture_ids") or []),
            "material_ids": deepcopy(payload.get("material_ids") or []),
            "created_at": now, "updated_at": now,
        }
        workspace["directions"].append(direction)
        workspace["active_direction_id"] = direction["id"]
        workspace["project"].update(active_direction_id=direction["id"], updated_at=now)
        return direction

    def workspace_for_project(self, project_id: str) -> dict[str, Any] | None:
        return self.workspaces.get(project_id)

    def record_turn(self, project_id: str, turn: dict[str, Any]) -> dict[str, Any]:
        workspace = self.workspaces[project_id]
        brief_patch = turn.get("brief_patch") or {}
        revision = append_brief_revision(
            workspace,
            confirmed=brief_patch.get("confirmed") or {},
            assumptions=brief_patch.get("assumptions") or {},
            source_turn_id=turn["id"],
        )
        recorded = deepcopy(turn)
        recorded["brief_revision"] = revision["revision"]
        workspace["turns"].append(recorded)
        return recorded

    def create_cultural_reference(
        self, project_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        if payload.get("kind") not in CULTURE_KINDS:
            raise ValueError("未知文化资料类型")
        item = {"id": new_id("culture"), **deepcopy(payload)}
        self.workspaces[project_id]["culture"].append(item)
        return item

    def patch_cultural_reference(
        self, project_id: str, reference_id: str, payload: dict[str, Any]
    ) -> dict[str, Any] | None:
        workspace = self.workspaces[project_id]
        item = next(
            (entry for entry in workspace["culture"] if entry["id"] == reference_id),
            None,
        )
        if item is None:
            return None
        candidate = {
            **item,
            **{key: value for key, value in payload.items() if value is not None},
        }
        if candidate["kind"] not in CULTURE_KINDS:
            raise ValueError("未知文化资料类型")
        if candidate["kind"] == "fact" and not candidate.get("source_title", "").strip():
            raise ValueError("文化事实必须提供来源标题")
        item.update(candidate)
        return item

    def customer_safe_culture(self, project_id: str) -> list[dict[str, Any]]:
        return [
            deepcopy(item)
            for item in self.workspaces[project_id]["culture"]
            if item["kind"] == "translation"
            or (
                item["kind"] == "fact"
                and item.get("verified") is True
                and bool(item.get("source_title", "").strip())
            )
        ]

    def _job_location(self, job_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        for workspace in self.workspaces.values():
            job = next(
                (item for item in workspace["jobs"] if item["id"] == job_id), None
            )
            if job is not None:
                return workspace, job
        raise KeyError(job_id)

    @staticmethod
    def _has_change_patch(turn: dict[str, Any] | None) -> bool:
        if not turn:
            return False
        patch = turn.get("change_patch") or {}
        return bool(
            patch.get("changes") or patch.get("preserve") or patch.get("constraints")
        )

    @staticmethod
    def _is_confirmed_generation_turn(turn: dict[str, Any] | None) -> bool:
        if not turn:
            return False
        text = str(turn.get("text", ""))
        return any(
            token in text for token in ("确认", "确定", "就按这个", "可以")
        ) and any(token in text for token in ("生成", "出一版", "新版"))

    def _change_source_turn(
        self, workspace: dict[str, Any], source_turn_id: str | None
    ) -> dict[str, Any] | None:
        turns = workspace["turns"]
        source_index = next(
            (index for index, item in enumerate(turns) if item["id"] == source_turn_id),
            len(turns),
        )
        source = turns[source_index] if source_index < len(turns) else None
        if self._is_confirmed_generation_turn(source):
            for turn in reversed(turns[:source_index]):
                if turn.get("intent") == "GENERATE":
                    break
                if turn.get("intent") == "MODIFY" and self._has_change_patch(turn):
                    return turn
        if self._has_change_patch(source):
            return source
        for turn in reversed(turns[:source_index]):
            if turn.get("intent") == "GENERATE":
                break
            if turn.get("intent") == "MODIFY" and self._has_change_patch(turn):
                return turn
        return None

    def _compose_image_prompt(
        self,
        workspace: dict[str, Any],
        source_turn_id: str | None,
        change_source_turn_id: str | None = None,
    ) -> str:
        brief = workspace["brief_revisions"][-1]
        translations = [
            item["statement"]
            for item in workspace["culture"]
            if item["kind"] == "translation"
        ]
        turn = next(
            (
                item
                for item in workspace["turns"]
                if item["id"] == (change_source_turn_id or source_turn_id)
            ),
            None,
        )
        change = turn.get("change_patch", {}) if turn else {}
        return (
            "现代苏州文创桌面香插产品概念图，克制、安静、可实际放置线香；"
            f"设计 Brief：{json.dumps(brief['confirmed'], ensure_ascii=False)}；"
            f"文化转译：{'；'.join(translations)}；"
            f"本轮变化：{json.dumps(change.get('changes', {}), ensure_ascii=False)}；"
            f"必须保留：{json.dumps(change.get('preserve', []), ensure_ascii=False)}；"
            f"结构约束：{json.dumps(change.get('constraints', []), ensure_ascii=False)}；"
            "纯色背景，产品设计渲染，展示稳定底座、镂空层次与香烟路径，不使用文字和旅游纪念品式符号。"
        )

    def create_image_job(
        self, project_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        workspace = self.workspaces[project_id]
        now = now_iso()
        source_turn_id = payload.get("source_turn_id")
        change_source_turn = self._change_source_turn(workspace, source_turn_id)
        change_source_turn_id = (
            change_source_turn["id"] if change_source_turn else None
        )
        job = {
            "id": new_id("job_image"),
            "kind": "image",
            "direction_id": workspace["project"].get("active_direction_id"),
            "status": "submitted",
            "version_id": None,
            "artifact_id": None,
            "message": "图片任务已提交",
            "prompt": payload.get("prompt")
            or self._compose_image_prompt(
                workspace, source_turn_id, change_source_turn_id
            ),
            "brief_revision": workspace["brief_revisions"][-1]["revision"],
            "source_turn_id": source_turn_id,
            "change_source_turn_id": change_source_turn_id,
            "base_version_id": payload.get("base_version_id"),
            "attempt": int(payload.get("attempt", 1)),
            "retry_of": payload.get("retry_of"),
            "created_at": now,
            "updated_at": now,
        }
        if job["base_version_id"] and not any(
            version["id"] == job["base_version_id"]
            for version in workspace["versions"]
        ):
            raise ValueError("基础设计版本不存在")
        workspace["jobs"].append(job)
        transition_stage(
            workspace,
            "concepting",
            status="active",
            reason="正在把本轮对话转成二维概念",
        )
        return job

    def start_generation_job(self, job_id: str) -> dict[str, Any]:
        _, job = self._job_location(job_id)
        job.update(
            status="processing", message="生成服务处理中", updated_at=now_iso()
        )
        return job

    def complete_image_job(
        self, job_id: str, artifact: dict[str, Any]
    ) -> dict[str, Any]:
        workspace, job = self._job_location(job_id)
        if not artifact.get("url") and not artifact.get("path"):
            raise ValueError("图片成果为空")
        change_source_turn = next(
            (
                item
                for item in workspace["turns"]
                if item["id"]
                == (job.get("change_source_turn_id") or job.get("source_turn_id"))
            ),
            None,
        )
        change = (
            change_source_turn.get("change_patch", {}) if change_source_turn else {}
        )
        version = {
            "id": new_id("version"),
            "label": f"V{len(workspace['versions']) + 1}",
            "direction_id": job.get("direction_id"),
            "parent_version_id": job.get("base_version_id"),
            "brief_revision": job["brief_revision"],
            "source_turn_id": job.get("source_turn_id"),
            "change_source_turn_id": job.get("change_source_turn_id"),
            "changed_fields": deepcopy(change.get("changes", {})),
            "preserved_fields": list(change.get("preserve", [])),
            "constraints": list(change.get("constraints", [])),
            "artifacts": [deepcopy(artifact)],
            "status": "draft",
            "created_at": now_iso(),
        }
        workspace["versions"].append(version)
        stale = job["brief_revision"] != workspace["brief_revisions"][-1]["revision"]
        job.update(
            status="stale" if stale else "completed",
            version_id=version["id"],
            artifact_id=artifact["id"],
            message="图片已生成，但基于旧 Brief" if stale else "图片已生成",
            updated_at=now_iso(),
        )
        if not stale:
            transition_stage(
                workspace,
                "reviewing",
                status="awaiting_confirmation",
                reason="二维概念已生成，等待锁定候选版本",
            )
        return job

    def fail_generation_job(self, job_id: str, message: str) -> dict[str, Any]:
        workspace, job = self._job_location(job_id)
        job.update(status="failed", message=message, updated_at=now_iso())
        transition_stage(
            workspace,
            "concepting" if job["kind"] == "image" else "prototyping",
            status="blocked",
            reason=message,
        )
        return job

    def retry_generation_job(self, job_id: str) -> dict[str, Any]:
        workspace, job = self._job_location(job_id)
        if job["status"] != "failed":
            raise ValueError("只有失败任务可以重试")
        common = {
            "prompt": job.get("prompt", ""),
            "attempt": int(job.get("attempt", 1)) + 1,
            "retry_of": job["id"],
        }
        if job["kind"] == "rodin":
            return self.create_rodin_job(
                workspace["project"]["id"],
                {
                    **common,
                    "version_id": job["version_id"],
                    "input_mode": job.get("input_mode", "text"),
                    "reference_snapshot": deepcopy(
                        job.get("reference_snapshot") or []
                    ),
                },
            )
        retried = self.create_image_job(
            workspace["project"]["id"],
            {
                **common,
                "source_turn_id": job.get("source_turn_id"),
                "base_version_id": job.get("base_version_id"),
            },
        )
        retried["direction_id"] = job.get("direction_id")
        return retried

    def create_rodin_job(
        self, project_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        workspace = self.workspaces[project_id]
        version = next(
            (
                item
                for item in workspace["versions"]
                if item["id"] == payload["version_id"]
            ),
            None,
        )
        if version is None:
            raise ValueError("三维任务关联的设计版本不存在")
        if workspace["project"].get("candidate_version_id") != version["id"]:
            raise ValueError("请先锁定当前二维版本为候选，再生成三维模型")
        brief = next(
            item
            for item in workspace["brief_revisions"]
            if item["revision"] == version["brief_revision"]
        )
        translations = [
            item["statement"]
            for item in workspace["culture"]
            if item["kind"] == "translation"
        ]
        input_mode = payload.get("input_mode") or "image"
        reference_snapshot: list[dict[str, Any]] = []
        if input_mode == "image":
            reference_snapshot = deepcopy(payload.get("reference_snapshot") or [])
            if not reference_snapshot:
                view_order = {
                    "front": 0,
                    "left": 1,
                    "right": 2,
                    "back": 3,
                    "top": 4,
                    "unknown": 5,
                }
                candidates = [
                    (index, artifact)
                    for index, artifact in enumerate(version["artifacts"])
                    if artifact.get("kind") == "image" and artifact.get("path")
                ]
                candidates.sort(
                    key=lambda item: (
                        view_order.get(item[1].get("view_label", "unknown"), 5),
                        item[0],
                    )
                )
                reference_snapshot = [
                    {
                        "artifact_id": artifact["id"],
                        "path": artifact["path"],
                        "media_type": artifact.get("media_type", "image/png"),
                        "view_label": artifact.get("view_label", "unknown"),
                    }
                    for _, artifact in candidates[:5]
                ]
            if not reference_snapshot:
                raise ValueError("当前版本没有可用于三维生成的二维参考图")
            prompt = payload.get("prompt", "")
        elif input_mode == "text":
            prompt = payload.get("prompt") or (
                "A modern desktop incense holder concept inspired by Suzhou gardens. "
                "Restrained matte ceramic, stable base, simplified layered openings, no text, single object. "
                f"Brief: {json.dumps(brief['confirmed'], ensure_ascii=False)}. "
                f"Cultural translations: {'; '.join(translations)}. "
                f"Changes: {json.dumps(version['changed_fields'], ensure_ascii=False)}. "
                f"Constraints: {json.dumps(version.get('constraints', []), ensure_ascii=False)}."
            )
        else:
            raise ValueError("不支持的 Rodin 输入模式")
        now = now_iso()
        job = {
            "id": new_id("job_rodin"),
            "kind": "rodin",
            "direction_id": version.get("direction_id"),
            "status": "submitted",
            "version_id": version["id"],
            "artifact_id": None,
            "message": "Rodin 三维任务已提交",
            "prompt": prompt,
            "brief_revision": version["brief_revision"],
            "source_turn_id": version.get("source_turn_id"),
            "base_version_id": None,
            "attempt": int(payload.get("attempt", 1)),
            "retry_of": payload.get("retry_of"),
            "input_mode": input_mode,
            "reference_artifact_ids": [
                item["artifact_id"] for item in reference_snapshot
            ],
            "reference_snapshot": reference_snapshot,
            "consistency_status": (
                "pending" if input_mode == "image" else "not_applicable"
            ),
            "created_at": now,
            "updated_at": now,
        }
        workspace["jobs"].append(job)
        transition_stage(
            workspace,
            "prototyping",
            status="active",
            reason="正在从锁定的二维候选生成三维模型",
        )
        return job

    def complete_rodin_job(
        self, job_id: str, artifact: dict[str, Any]
    ) -> dict[str, Any]:
        workspace, job = self._job_location(job_id)
        version = next(
            item for item in workspace["versions"] if item["id"] == job["version_id"]
        )
        version["artifacts"].append(deepcopy(artifact))
        stale = (
            workspace["versions"][-1]["id"] != version["id"]
            or workspace["brief_revisions"][-1]["revision"] != job["brief_revision"]
        )
        job.update(
            status="stale" if stale else "completed",
            artifact_id=artifact["id"],
            message="三维模型已完成，但关联旧版本" if stale else "三维概念模型已完成",
            updated_at=now_iso(),
        )
        if not stale:
            transition_stage(
                workspace,
                "reviewing",
                status="awaiting_confirmation",
                reason="二维与三维成果已关联，等待评审",
            )
        return job

    def generation_job(self, project_id: str, job_id: str) -> dict[str, Any] | None:
        return next(
            (job for job in self.workspaces[project_id]["jobs"] if job["id"] == job_id),
            None,
        )

    def find_artifact(self, artifact_id: str) -> dict[str, Any] | None:
        for workspace in self.workspaces.values():
            for version in workspace["versions"]:
                artifact = next(
                    (
                        item
                        for item in version["artifacts"]
                        if item["id"] == artifact_id
                    ),
                    None,
                )
                if artifact is not None:
                    return artifact
        return None

    def select_candidate_version(
        self, project_id: str, version_id: str
    ) -> dict[str, Any] | None:
        workspace = self.workspaces[project_id]
        selected = next(
            (item for item in workspace["versions"] if item["id"] == version_id),
            None,
        )
        if selected is None:
            return None
        for version in workspace["versions"]:
            if version["status"] == "selected":
                version["status"] = "reviewing"
        selected["status"] = "selected"
        workspace["project"]["candidate_version_id"] = version_id
        transition_stage(
            workspace,
            "prototyping",
            status="awaiting_confirmation",
            reason="二维候选已锁定，可以生成三维模型",
        )
        return selected

    def proposal_for_project(self, project_id: str) -> dict[str, Any] | None:
        workspace = self.workspaces[project_id]
        candidate_id = workspace["project"].get("candidate_version_id")
        if not candidate_id:
            return None
        version = next(
            item for item in workspace["versions"] if item["id"] == candidate_id
        )
        brief = next(
            item
            for item in workspace["brief_revisions"]
            if item["revision"] == version["brief_revision"]
        )
        public_artifact_fields = {
            "id", "kind", "url", "media_type", "role", "disclaimer"
        }
        artifacts = [
            {
                key: value
                for key, value in artifact.items()
                if key in public_artifact_fields
            }
            for artifact in version["artifacts"]
        ]
        culture = [
            {
                key: item.get(key, "")
                for key in (
                    "id", "kind", "title", "statement", "source_title", "source_url"
                )
            }
            for item in self.customer_safe_culture(project_id)
        ]
        return {
            "project": {
                "id": workspace["project"]["id"],
                "name": workspace["project"]["name"],
                "product_type": workspace["project"]["product_type"],
            },
            "brief": deepcopy(brief["confirmed"]),
            "culture": culture,
            "version": {
                "id": version["id"],
                "label": version["label"],
                "changed_fields": deepcopy(version["changed_fields"]),
                "preserved_fields": list(version["preserved_fields"]),
                "constraints": list(version["constraints"]),
                "artifacts": artifacts,
            },
            "disclaimer": "本提案为概念设计与沟通材料，三维模型不是生产 CAD，尺寸、结构、材料与工艺须经工程验证。",
        }
