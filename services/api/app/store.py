from __future__ import annotations

import base64
import html
import json
import secrets
import struct
from pathlib import Path
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


class GenerationConflict(ValueError):
    pass


class StageGateConflict(ValueError):
    def __init__(self, detail):
        self.detail = detail
        super().__init__(detail["reason"])


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
            pending += sum(r["status"] in {"pending", "needs_changes"} for r in workspace["reviews"])
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
            "proposals": [], "proposal_asset_ids": [], "proposal_selection_explicit": False, "turns": [], "versions": [], "jobs": [],
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

    def activate_direction(self, project_id: str, direction_id: str) -> dict[str, Any]:
        """Validate ownership before synchronously changing either active field."""
        workspace = self.workspaces[project_id]
        direction = next((item for item in workspace["directions"]
                          if item["id"] == direction_id), None)
        if direction is None:
            raise KeyError("方向不存在或不属于当前项目")
        now = now_iso()
        workspace["active_direction_id"] = direction_id
        workspace["project"].update(active_direction_id=direction_id, updated_at=now)
        direction["updated_at"] = now
        return workspace

    def workspace_for_project(self, project_id: str) -> dict[str, Any] | None:
        workspace = self.workspaces.get(project_id)
        if workspace is not None:
            self._prune_proposal_asset_ids(workspace)
        return workspace

    @staticmethod
    def _has_pbr(artifact: dict[str, Any]) -> bool:
        """Inspect embedded GLB material references; names/roles are not evidence."""
        try:
            with Path(artifact.get("path", "")).open("rb") as stream:
                magic, version, total = struct.unpack("<4sII", stream.read(12))
                size, chunk_type = struct.unpack("<II", stream.read(8))
                if magic != b"glTF" or version != 2 or chunk_type != 0x4E4F534A or size > 20_000_000:
                    return False
                if total != Path(artifact["path"]).stat().st_size or size + 20 > total:
                    return False
                document = json.loads(stream.read(size))
                bin_size, bin_type = struct.unpack("<II", stream.read(8))
                if bin_type != 0x004E4942 or bin_size + size + 28 != total:
                    return False
            if not isinstance(document, dict):
                return False
            materials = document.get("materials", [])
            textures = document.get("textures", [])
            images = document.get("images", [])
            views = document.get("bufferViews", [])
            used = [p.get("material") for mesh in document.get("meshes", [])
                    for p in mesh.get("primitives", [])]
            if not used:
                return False
            for index in used:
                if not isinstance(index, int) or index < 0:
                    return False
                material = materials[index]
                if "KHR_materials_unlit" in material.get("extensions", {}):
                    return False
                texture_index = material["pbrMetallicRoughness"]["baseColorTexture"]["index"]
                if not isinstance(texture_index, int) or texture_index < 0:
                    return False
                source = textures[texture_index]["source"]
                if not isinstance(source, int) or source < 0:
                    return False
                image = images[source]
                view_index = image["bufferView"]
                if not isinstance(view_index, int) or view_index < 0:
                    return False
                view = views[view_index]
                if (view.get("buffer") != 0 or view.get("byteLength", 0) <= 0
                    or view.get("byteOffset", 0) < 0
                    or view.get("byteOffset", 0) + view["byteLength"] > bin_size):
                    return False
            return True
        except (OSError, ValueError, KeyError, IndexError, TypeError, AttributeError, struct.error):
            return False

    @staticmethod
    def _guard_generation(workspace, kind):
        if any(j["kind"] == kind and j["status"] in {"submitted", "processing"}
               for j in workspace["jobs"]):
            raise GenerationConflict("当前项目已有同类生成任务正在进行")

    def _asset_record(self, workspace, version, artifact, job):
        """Build and validate a record without publishing partial completion state."""
        now = now_iso()
        direction = next((d for d in workspace["directions"]
                          if d["id"] == version.get("direction_id")), {})
        parent = next((v for v in workspace["versions"]
                       if v["id"] == version.get("parent_version_id")), {})
        item = {
            "asset_id": artifact["id"], "asset_type": artifact["kind"],
            "project_id": workspace["project"]["id"],
            "direction_id": version.get("direction_id"), "version_id": version["id"],
            "title": artifact.get("title") or f"{version['label']} {artifact['kind']}",
            "status": job["status"],
            "source_asset_ids": list(job.get("reference_artifact_ids") or
                                     [a["id"] for a in parent.get("artifacts", []) if a.get("kind") == "image"]),
            "source_turn_id": job.get("source_turn_id"),
            "source_culture_ids": list(direction.get("culture_ids", [])),
            "tags": [], "created_at": now, "updated_at": now,
            "owner": workspace["project"].get("owner", ""), "rights_note": "",
            "url": artifact.get("url", ""), "media_type": artifact.get("media_type", ""),
        }
        if artifact["kind"] == "model_glb":
            pbr = self._has_pbr(artifact)
            item["material_status"] = "pbr" if pbr else "unverified"
            item["role"] = "final" if pbr and item["status"] == "completed" else "preview"
            if not pbr and item["status"] == "completed":
                item["status"] = "draft"
        return item

    @staticmethod
    def _save_asset(workspace, item):
        existing = next((a for a in workspace["assets"]
                         if a["asset_id"] == item["asset_id"]), None)
        if existing:
            existing.update({k: v for k, v in item.items()
                             if k not in {"title", "tags", "created_at", "owner", "rights_note"}})
            return existing
        workspace["assets"].append(item)
        return item

    def _upsert_asset(self, workspace, version, artifact, job):
        return self._save_asset(workspace, self._asset_record(workspace, version, artifact, job))

    def list_assets(self, project_id: str, filters=None):
        filters = filters or {}
        result = []
        for item in self.workspaces[project_id]["assets"]:
            if any(filters.get(key) and item.get(field) != filters[key]
                   for key, field in (("type", "asset_type"), ("status", "status"),
                                      ("direction_id", "direction_id"))):
                continue
            if filters.get("tag") and filters["tag"] not in item["tags"]:
                continue
            query = (filters.get("query") or "").strip().casefold()
            if query and query not in " ".join([item["title"], *item["tags"], item["rights_note"]]).casefold():
                continue
            result.append(deepcopy(item))
        return result

    def patch_asset(self, project_id: str, asset_id: str, payload):
        workspace = self.workspaces[project_id]
        item = next((a for a in workspace["assets"] if a["asset_id"] == asset_id), None)
        if item is None:
            return None
        payload = {k: v for k, v in payload.items()
                   if k in {"title", "status", "tags", "owner", "rights_note"} and v is not None}
        target = payload.get("status")
        if target in {"selected", "published"}:
            if item["status"] in {"archived", "failed", "stale", "processing"}:
                raise ValueError("归档、失败、过期或处理中的资产不能设为候选或发布")
            if item["asset_type"] == "model_glb" and item.get("material_status") != "pbr":
                raise ValueError("最终三维模型必须是带 PBR 贴图材质的 GLB")
            if item["asset_type"] == "image":
                self.select_candidate_version(project_id, item["version_id"])
        item.update(payload)
        item["updated_at"] = now_iso()
        workspace["project"]["updated_at"] = item["updated_at"]
        if target in {"archived", "failed", "stale"} and item["asset_type"] == "image":
            version = next((v for v in workspace["versions"] if v["id"] == item["version_id"]), None)
            if version and workspace["project"].get("candidate_version_id") == version["id"]:
                workspace["project"]["candidate_version_id"] = None
                version["status"] = "reviewing"
        self._prune_proposal_asset_ids(workspace)
        return deepcopy(item)

    @staticmethod
    def _proposal_asset_allowed(workspace, item: dict[str, Any]) -> bool:
        candidate_id = workspace["project"].get("candidate_version_id")
        if not candidate_id or item.get("version_id") != candidate_id:
            return False
        if item.get("status") not in {"selected", "published"}:
            return False
        if item.get("asset_type") == "image":
            return True
        if item.get("asset_type") != "model_glb":
            return False
        if item.get("material_status") != "pbr" or item.get("role") != "final":
            return False
        candidate_images = {
            asset["asset_id"] for asset in workspace["assets"]
            if asset.get("version_id") == candidate_id
            and asset.get("asset_type") == "image"
            and asset.get("status") in {"selected", "published"}
        }
        return bool(candidate_images.intersection(item.get("source_asset_ids", [])))

    def _prune_proposal_asset_ids(self, workspace) -> list[str]:
        current = list(workspace.setdefault("proposal_asset_ids", []))
        valid = {item["asset_id"] for item in workspace["assets"] if self._proposal_asset_allowed(workspace, item)}
        workspace["proposal_asset_ids"] = [asset_id for asset_id in current if asset_id in valid]
        return list(workspace["proposal_asset_ids"])

    def add_proposal_asset(self, project_id: str, asset_id: str) -> dict[str, Any]:
        workspace = self.workspaces[project_id]
        workspace["proposal_selection_explicit"] = True
        self._prune_proposal_asset_ids(workspace)
        item = next((asset for asset in workspace["assets"] if asset["asset_id"] == asset_id), None)
        if item is None:
            raise KeyError("资产不存在或不属于当前项目")
        if not self._proposal_asset_allowed(workspace, item):
            raise ValueError("资产不符合当前候选提案选材条件")
        if asset_id not in workspace["proposal_asset_ids"]:
            workspace["proposal_asset_ids"].append(asset_id)
        return {"proposal_asset_ids": list(workspace["proposal_asset_ids"])}

    def remove_proposal_asset(self, project_id: str, asset_id: str) -> dict[str, Any]:
        workspace = self.workspaces[project_id]
        workspace["proposal_selection_explicit"] = True
        ids = self._prune_proposal_asset_ids(workspace)
        if asset_id in ids:
            workspace["proposal_asset_ids"] = [item for item in ids if item != asset_id]
        return {"proposal_asset_ids": list(workspace["proposal_asset_ids"])}

    def asset_relations(self, project_id: str, asset_id: str):
        workspace = self.workspaces[project_id]
        item = next((a for a in workspace["assets"] if a["asset_id"] == asset_id), None)
        if item is None:
            return None
        version = next((v for v in workspace["versions"] if v["id"] == item["version_id"]), None)
        parent = next((v for v in workspace["versions"]
                       if version and v["id"] == version.get("parent_version_id")), None)
        return deepcopy({
            "asset": item, "version": version, "parent_version": parent,
            "input_assets": [a for a in workspace["assets"] if a["asset_id"] in item["source_asset_ids"]],
            "downstream_models": [a for a in workspace["assets"]
                                  if a["asset_type"] == "model_glb" and asset_id in a["source_asset_ids"]],
        })

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

    def validate_generation_submission(self, project_id, kind, payload):
        """API boundary guard, shared by submissions and retries; duplicates win."""
        workspace = self.workspaces[project_id]
        self._guard_generation(workspace, kind)
        if kind == "rodin":
            action = "generate_rodin"
            context = {"version_id": payload.get("version_id"),
                       "input_mode": payload.get("input_mode") or "image"}
        else:
            source = self._change_source_turn(workspace, payload.get("source_turn_id"))
            modifying = (payload.get("base_version_id") or payload.get("changes") or payload.get("preserve")
                         or (source and source.get("intent") == "MODIFY"))
            action = "modify_image" if modifying else "generate_image"
            patch = source.get("change_patch", {}) if source else {}
            context = {"version_id": payload.get("base_version_id"),
                       "changes": payload.get("changes") or patch.get("changes"),
                       "preserve": payload.get("preserve") or patch.get("preserve")}
        gate = self.stage_gate_status(project_id, action, context)
        if not gate["allowed"]:
            raise StageGateConflict(gate)

    def create_image_job(
        self, project_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        workspace = self.workspaces[project_id]
        self._guard_generation(workspace, "image")
        now = now_iso()
        source_turn_id = payload.get("source_turn_id")
        change_source_turn = self._change_source_turn(workspace, source_turn_id)
        change_source_turn_id = (
            change_source_turn["id"] if change_source_turn else None
        )
        explicit_changes = payload.get("changes") or {}
        explicit_preserve = payload.get("preserve") or []
        prompt = payload.get("prompt") or self._compose_image_prompt(workspace, source_turn_id, change_source_turn_id)
        if explicit_changes or explicit_preserve:
            prompt += f"；本轮明确变化：{json.dumps(explicit_changes, ensure_ascii=False)}；明确保留：{json.dumps(explicit_preserve, ensure_ascii=False)}"
        job = {
            "changes": deepcopy(explicit_changes), "preserve": list(explicit_preserve),
            "id": new_id("job_image"),
            "kind": "image",
            "direction_id": workspace["project"].get("active_direction_id"),
            "status": "submitted",
            "version_id": None,
            "artifact_id": None,
            "message": "图片任务已提交",
            "prompt": prompt,
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
        if job.get("artifact_id"):
            return job
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
            "changed_fields": deepcopy(job.get("changes") or change.get("changes", {})),
            "preserved_fields": list(job.get("preserve") or change.get("preserve", [])),
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
        registered = self._upsert_asset(workspace, version, artifact, job)
        if artifact.get("kind") == "model_glb":
            saved = next(a for a in version["artifacts"] if a["id"] == artifact["id"])
            saved.update(role=registered["role"], material_status=registered["material_status"])
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
                "changes": deepcopy(job.get("changes", {})),
                "preserve": list(job.get("preserve", [])),
            },
        )
        retried["direction_id"] = job.get("direction_id")
        return retried

    def create_rodin_job(
        self, project_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        workspace = self.workspaces[project_id]
        self._guard_generation(workspace, "rodin")
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
        if any(a["version_id"] == version["id"] and a["asset_type"] == "image"
               and a["status"] in {"archived", "failed", "stale", "processing"}
               for a in workspace["assets"]):
            raise ValueError("当前二维参考资产不可用，请重新锁定候选")
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

    @staticmethod
    def _rodin_inputs_current(workspace, version, job):
        if workspace["project"].get("candidate_version_id") != version["id"]:
            return False
        if version.get("status") != "selected":
            return False
        snapshot = job.get("reference_snapshot") or []
        if job.get("input_mode") != "image":
            return True
        if not snapshot or [a["artifact_id"] for a in snapshot] != job.get("reference_artifact_ids"):
            return False
        invalid = {"archived", "failed", "stale", "processing"}
        for reference in snapshot:
            artifact = next((a for a in version["artifacts"]
                             if a["id"] == reference["artifact_id"] and a.get("kind") == "image"), None)
            if artifact is None or artifact.get("path") != reference.get("path"):
                return False
            if artifact.get("media_type", "image/png") != reference.get("media_type", "image/png"):
                return False
            asset = next((a for a in workspace["assets"]
                          if a["asset_id"] == reference["artifact_id"]), None)
            # Legacy artifacts may predate the registry, but any registered record must remain eligible.
            if asset and (asset["version_id"] != version["id"] or asset["status"] in invalid):
                return False
        return True

    def complete_rodin_job(
        self, job_id: str, artifact: dict[str, Any]
    ) -> dict[str, Any]:
        workspace, job = self._job_location(job_id)
        # Completion is once per attempt, independent of the callback's artifact ID.
        if job.get("artifact_id"):
            return job
        version = next(
            item for item in workspace["versions"] if item["id"] == job["version_id"]
        )
        stale = (
            workspace["versions"][-1]["id"] != version["id"]
            or workspace["brief_revisions"][-1]["revision"] != job["brief_revision"]
            or not self._rodin_inputs_current(workspace, version, job)
        )
        completed = {
            **job,
            "status": "stale" if stale else "completed",
            "artifact_id": artifact["id"],
            "message": "三维模型已完成，但关联旧版本" if stale else "三维概念模型已完成",
            "updated_at": now_iso(),
        }
        normalized = deepcopy(artifact)
        registered = self._asset_record(workspace, version, normalized, completed)
        normalized.update(role=registered["role"], material_status=registered["material_status"])
        # All parsing and role normalization finish before any shared state is changed.
        self._save_asset(workspace, registered)
        version["artifacts"].append(normalized)
        job.update(completed)
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
        images = [a for a in workspace["assets"] if a["version_id"] == version_id and a["asset_type"] == "image"]
        if not images or not any(a.get("kind") == "image" and a.get("id") in {i["asset_id"] for i in images} for a in selected["artifacts"]):
            raise ValueError("请先完成二维图像生成，再锁定候选")
        if selected["status"] in {"archived", "discarded"} or any(
            a["status"] in {"archived", "failed", "stale", "processing"} for a in images
        ):
            raise ValueError("归档、失败、过期或处理中的资产不能设为候选")
        for asset in workspace["assets"]:
            if asset["asset_type"] == "image" and asset["status"] == "selected":
                asset.update(status="reviewing", updated_at=now_iso())
        for asset in images:
            asset.update(status="selected", updated_at=now_iso())
        for version in workspace["versions"]:
            if version["status"] == "selected":
                version["status"] = "reviewing"
        for asset in workspace["assets"]:
            if (asset["asset_type"] == "model_glb" and asset["version_id"] != version_id
                and asset["status"] not in {"archived", "failed"}):
                asset.update(status="stale", role="preview", updated_at=now_iso())
                old_version = next((v for v in workspace["versions"] if v["id"] == asset["version_id"]), None)
                if old_version:
                    for artifact in old_version["artifacts"]:
                        if artifact["id"] == asset["asset_id"]:
                            artifact["role"] = "preview"
        selected["status"] = "selected"
        workspace["project"]["candidate_version_id"] = version_id
        self._prune_proposal_asset_ids(workspace)
        transition_stage(
            workspace,
            "prototyping",
            status="awaiting_confirmation",
            reason="二维候选已锁定，可以生成三维模型",
        )
        return selected

    def create_review(self, project_id, payload):
        workspace = self.workspaces[project_id]
        version = next((v for v in workspace["versions"] if v["id"] == payload["version_id"]), None)
        if version is None:
            raise ValueError("评审版本不属于当前项目")
        direction_id = version.get("direction_id")
        if payload.get("direction_id") and payload["direction_id"] != direction_id:
            raise ValueError("评审方向与版本不一致")
        if payload.get("asset_id") and not any(
            a["asset_id"] == payload["asset_id"] and a["version_id"] == version["id"]
            for a in workspace["assets"]
        ):
            raise ValueError("评审资产与版本不一致")
        now = now_iso()
        review = {**deepcopy(payload), "id": new_id("review"), "project_id": project_id,
                  "direction_id": direction_id, "status": "pending", "created_at": now, "updated_at": now}
        workspace["reviews"].append(review)
        return deepcopy(review)

    def resolve_review(self, project_id, review_id, payload):
        workspace = self.workspaces[project_id]
        review = next((r for r in workspace["reviews"] if r["id"] == review_id), None)
        if review is None:
            return None
        if review["status"] != "pending":
            raise GenerationConflict("评审已处理，请创建新一轮评审")
        if payload["status"] not in {"passed", "needs_changes", "alternative", "rejected"}:
            raise ValueError("无效评审状态")
        if payload["status"] == "passed":
            gate = self.stage_gate_status(project_id, "internal_review", {"version_id": review["version_id"]})
            if not gate["allowed"]:
                raise StageGateConflict(gate)
        review.update({k: v for k, v in payload.items() if k in {"status", "comment"} and v is not None})
        review["updated_at"] = now_iso()
        return deepcopy(review)

    def _deliverable_assets(self, workspace):
        candidate_id = workspace["project"].get("candidate_version_id")
        version = next((v for v in workspace["versions"] if v["id"] == candidate_id), None)
        if not version or version["status"] != "selected":
            return []
        artifact_ids = {a["id"] for a in version["artifacts"]}
        images = [a for a in workspace["assets"] if a["version_id"] == candidate_id
                  and a["asset_id"] in artifact_ids and a["asset_type"] == "image"
                  and a["status"] in {"selected", "published"}]
        image_ids = {a["asset_id"] for a in images}
        models = [a for a in workspace["assets"] if a["version_id"] == candidate_id
                  and a["asset_id"] in artifact_ids and a["asset_type"] == "model_glb"
                  and a["status"] in {"selected", "published"}
                  and a.get("material_status") == "pbr" and a.get("role") == "final"
                  and image_ids.intersection(a.get("source_asset_ids", []))]
        return images + models

    def _proposal_assets(self, workspace):
        selected_ids = self._prune_proposal_asset_ids(workspace)
        explicit = workspace.get("proposal_selection_explicit", bool(selected_ids))
        if explicit:
            by_id = {asset["asset_id"]: asset for asset in workspace["assets"]}
            return [by_id[asset_id] for asset_id in selected_ids if asset_id in by_id]
        return self._deliverable_assets(workspace)

    def stage_gate_status(self, project_id, action, context=None):
        workspace = self.workspaces[project_id]
        context = context or {}
        missing = []
        version = next((v for v in workspace["versions"] if v["id"] == context.get("version_id", workspace["project"].get("candidate_version_id"))), None)
        brief = workspace["brief_revisions"][-1]
        values = {**brief.get("assumptions", {}), **brief.get("confirmed", {})}
        project = workspace["project"]
        guidance = "在版本详情补充来源、本轮变化和限制"
        if action == "generate_image":
            known = [values.get("product_type") or project.get("product_type"),
                     values.get("use_scene") or project.get("use_scene"),
                     values.get("target_user") or project.get("target_user")]
            if sum(bool(v) for v in known) < 2:
                missing.append("brief_direction_scene_or_target")
            if brief.get("conflicts"):
                missing.append("unresolved_conflicts")
            guidance = "在设计 Brief 补齐产品方向、使用场景或目标中至少两项并解决冲突"
        elif action == "modify_image":
            if not version:
                missing.append("base_version")
            if not context.get("changes"):
                missing.append("changes")
            if not context.get("preserve"):
                missing.append("preserve")
            guidance = "在工作台选择基础版本并说明变化和至少一个保留项"
        elif action == "lock_candidate":
            images = [a for a in workspace["assets"] if version and a["version_id"] == version["id"] and a["asset_type"] == "image"]
            if not images or any(a["status"] not in {"completed", "reviewing", "selected", "published"} for a in images):
                missing.append("completed_image")
            if not context.get("confirmed"):
                missing.append("user_confirmation")
            guidance = "在作品详情确认已完成的二维图并锁定候选"
        elif action == "generate_rodin":
            if not version or version["id"] != project.get("candidate_version_id"):
                missing.append("locked_candidate")
            image_ids = {a["asset_id"] for a in self._deliverable_assets(workspace) if a["asset_type"] == "image"}
            if not version or not any(a["id"] in image_ids and a.get("path") and Path(a["path"]).is_file() for a in version["artifacts"]):
                missing.append("local_primary_image")
            if context.get("input_mode", "image") not in {"image", "text"}:
                missing.append("input_mode")
            guidance = "在工作台锁定候选并导入有效本地主图，确认输入模式与来源"
        elif action == "internal_review":
            assets = [a for a in workspace["assets"] if version and a["version_id"] == version["id"]]
            asset_ids = {a["asset_id"] for a in workspace["assets"]}
            if (not version or not assets
                or any(not any(a["id"] == item["asset_id"] for a in version["artifacts"]) for item in assets)
                or any(source not in asset_ids for item in assets for source in item.get("source_asset_ids", []))
                or any(item["asset_type"] == "model_glb" and not item.get("source_asset_ids") for item in assets)):
                missing.append("traceable_assets")
            if not version or not version.get("changed_fields"):
                missing.append("changed_fields")
            if not version or not version.get("constraints"):
                missing.append("constraints")
        elif action in {"internal_proposal", "customer_proposal"}:
            if not any(a["asset_type"] == "image" for a in self._deliverable_assets(workspace)):
                missing.append("selected_image")
            if any(not c.get("kind") or "verified" not in c for c in workspace["culture"]):
                missing.append("typed_culture")
            if action == "customer_proposal" and any(c["kind"] == "fact" and not c.get("verified") for c in workspace["culture"]):
                missing.append("verified_culture")
            guidance = "在作品详情锁定可用二维候选，在文化依据中补齐类型并核验对外文化事实"
        else:
            raise ValueError("未知阶段动作")
        return {"stage": action, "allowed": not missing, "missing": missing,
                "reason": "缺少阶段必填信息：" + "、".join(missing) if missing else "阶段条件已满足",
                "action": guidance if missing else "可以继续"}

    def _proposal_culture(self, project_id, audience):
        entries = (self.workspaces[project_id]["culture"] if audience == "internal"
                   else self.customer_safe_culture(project_id))
        fields = {"id", "kind", "title", "statement", "source_title", "source_url", "verified"}
        result = []
        for entry in entries:
            item = {k: deepcopy(v) for k, v in entry.items() if k in fields}
            if audience == "internal" and entry["kind"] == "fact" and not entry.get("verified"):
                item.update(kind="to_verify", original_kind="fact", warning="待核验，不可作为确定文化事实")
            result.append(item)
        return result

    def asset_manifest(self, project_id, audience="internal"):
        if audience not in {"internal", "customer"}:
            raise ValueError("未知提案受众")
        gate = self.stage_gate_status(project_id, audience + "_proposal")
        if not gate["allowed"]:
            raise StageGateConflict(gate)
        workspace = self.workspaces[project_id]
        assets = self._proposal_assets(workspace)
        versions = {v["id"]: v for v in workspace["versions"]}
        safe_fields = {"asset_id", "asset_type", "project_id", "direction_id", "version_id", "title", "status", "source_asset_ids", "source_culture_ids", "url", "media_type", "material_status", "role"}
        history_fields = {"id", "label", "parent_version_id", "brief_revision", "changed_fields", "preserved_fields", "constraints", "status", "created_at"}
        candidate = versions[workspace["project"]["candidate_version_id"]]
        brief = next(b for b in workspace["brief_revisions"] if b["revision"] == candidate["brief_revision"])
        return {"project_id": project_id, "audience": audience,
                "candidate_version_id": candidate["id"],
                "assets": [{**{k: deepcopy(v) for k, v in a.items() if k in safe_fields}, "version_label": versions[a["version_id"]]["label"]} for a in assets],
                "brief": deepcopy(brief), "culture_sources": self._proposal_culture(project_id, audience),
                "version_history": [{k: deepcopy(v) for k, v in version.items() if k in history_fields} for version in workspace["versions"]]}

    def proposal_for_project(self, project_id: str, audience: str | None = None) -> dict[str, Any] | None:
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
        if audience not in {None, "internal", "customer"}:
            raise ValueError("未知提案受众")
        gate = self.stage_gate_status(project_id, "customer_proposal" if audience == "customer" else "internal_proposal")
        if not gate["allowed"]:
            raise StageGateConflict(gate)
        eligible = {a["asset_id"] for a in self._proposal_assets(workspace)}
        public_artifact_fields = {"id", "kind", "url", "media_type", "role", "disclaimer"}
        artifacts = [{**{key: value for key, value in artifact.items() if key in public_artifact_fields},
                      "version_id": version["id"], "version_label": version["label"],
                      "source_asset_ids": next(a["source_asset_ids"] for a in workspace["assets"] if a["asset_id"] == artifact["id"])}
                     for artifact in version["artifacts"] if artifact["id"] in eligible]
        culture = self._proposal_culture(project_id, audience)
        return {
            "project": {
                "id": workspace["project"]["id"],
                "name": workspace["project"]["name"],
                "product_type": workspace["project"]["product_type"],
            },
            "audience": audience or "customer",
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
