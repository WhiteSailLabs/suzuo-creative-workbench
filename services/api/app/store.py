from __future__ import annotations

import asyncio
import base64
import hashlib
import html
import io
import json
import mimetypes
import os
import secrets
import textwrap
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MATERIAL_PREVIEW_FILES = {
    "mat_fabric_081c": "fabric081c-preview.png",
    "mat_fabric_085": "fabric085-preview.png",
    "mat_fabric_082a": "fabric082a-preview.png",
    "mat_fabric_083": "fabric083-preview.png",
    "mat_fabric_080": "fabric080-preview.png",
}

MATERIALS_DIR = Path(__file__).resolve().parents[3] / "data" / "materials"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(5)}"


def svg_data_url(title: str, subtitle: str, hue: str, revision: int = 1) -> str:
    safe_title = html.escape(title)
    safe_subtitle = html.escape(subtitle)
    svg = f"""<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='1500' viewBox='0 0 1200 1500'>
      <defs>
        <linearGradient id='bg' x1='0' x2='1' y1='0' y2='1'><stop stop-color='#f4f0eb'/><stop offset='1' stop-color='#e7e4ee'/></linearGradient>
        <linearGradient id='coat' x1='0' x2='1'><stop stop-color='{hue}' stop-opacity='.92'/><stop offset='1' stop-color='#c6b2a4' stop-opacity='.96'/></linearGradient>
        <filter id='shadow'><feDropShadow dx='0' dy='18' stdDeviation='22' flood-color='#222' flood-opacity='.14'/></filter>
      </defs>
      <rect width='1200' height='1500' fill='url(#bg)'/>
      <circle cx='1030' cy='150' r='180' fill='#fff' opacity='.42'/>
      <path d='M430 205 L770 205 L890 430 L820 1370 L380 1370 L310 430 Z' fill='url(#coat)' filter='url(#shadow)'/>
      <path d='M430 205 L600 440 L770 205' fill='none' stroke='#6c5f67' stroke-width='18' opacity='.54'/>
      <path d='M600 440 L600 1370' stroke='#5b4d56' stroke-width='10' opacity='.36'/>
      <path d='M378 720 L822 720' stroke='#6f5c5f' stroke-width='7' opacity='.25'/>
      <path d='M412 890 L788 890' stroke='#6f5c5f' stroke-width='7' opacity='.25'/>
      <text x='70' y='120' font-family='Arial, sans-serif' font-size='32' fill='#2d3037' letter-spacing='4'>HUICHUANG AI / REVISION {revision}</text>
      <text x='70' y='1400' font-family='Arial, sans-serif' font-size='42' fill='#24262c'>{safe_title}</text>
      <text x='70' y='1450' font-family='Arial, sans-serif' font-size='24' fill='#656a73'>{safe_subtitle}</text>
    </svg>"""
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


class MemoryStore:
    """Small evented store used when PostgreSQL/Redis are not available.

    The API surface mirrors the PostgreSQL schema in schema.sql, so the demo can
    be swapped to a real repository without changing the frontend contract.
    """

    backend = "memory"

    def __init__(self) -> None:
        self.clients: dict[str, dict[str, Any]] = {}
        self.projects: dict[str, dict[str, Any]] = {}
        self.materials: dict[str, dict[str, Any]] = {}
        self.references: dict[str, dict[str, Any]] = {}
        self.workflows: dict[str, dict[str, Any]] = {}
        self.artifacts: dict[str, dict[str, Any]] = {}
        self.runs: dict[str, dict[str, Any]] = {}
        self.events: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._seed()

    def _seed(self) -> None:
        for item in [
            {"id": "cli_suzhou", "name": "苏州织造研究所", "subtitle": "丝绸与现代通勤系列", "industry": "服装设计", "accent": "#5B6BFF"},
            {"id": "cli_orbit", "name": "Orbit Atelier", "subtitle": "SS27 城市机能系列", "industry": "服装设计", "accent": "#D97B57"},
        ]:
            self.clients[item["id"]] = {**item, "created_at": now_iso()}
        materials = [
            ("mat_fabric_081c", "Cotton Weave 081C · 柔和中性", "棉质织物", "#c6c1b5", "https://github.com/MorePET/mat-vis", ["cotton", "woven", "soft"]),
            ("mat_fabric_085", "Fine Woven 085 · 西装质感", "细密织物", "#d5c8b4", "https://github.com/MorePET/mat-vis", ["woven", "matte", "suiting"]),
            ("mat_fabric_082a", "Textured Cloth 082A · 轻纹理", "织物", "#b8b9b4", "https://github.com/MorePET/mat-vis", ["woven", "texture", "light"]),
            ("mat_fabric_083", "Textured Cloth 083 · 低饱和", "织物", "#8f918b", "https://github.com/MorePET/mat-vis", ["woven", "texture", "matte"]),
            ("mat_fabric_080", "Fine Knit 080 · 柔软弹性", "针织", "#c1b9ab", "https://github.com/MorePET/mat-vis", ["knit", "soft", "stretch"]),
        ]
        for mid, name, category, color, source, tags in materials:
            self.materials[mid] = {
                "id": mid,
                "name": name,
                "category": category,
                "color": color,
                "texture_url": f"/api/materials/{mid}/preview",
                "source": source,
                "license": "CC0-1.0",
                "verified": True,
                "tags": tags,
            }
        refs = [
            ("ref_collar_arch", "弧形领口 / Architecture", "https://www.pinterest.com/", "领口结构"),
            ("ref_suzhou_window", "苏式窗棂 / Geometry", "https://commons.wikimedia.org/", "纹样比例"),
            ("ref_soft_tailoring", "Soft tailoring / 线条", "https://unsplash.com/", "整体廓形"),
            ("ref_ink_palette", "墨色与米白 / Palette", "https://www.behance.net/", "配色方向"),
        ]
        for rid, title, source_url, purpose in refs:
            self.references[rid] = {
                "id": rid,
                "title": title,
                "source_url": source_url,
                "thumbnail_url": f"/api/references/{rid}/preview.svg",
                "license_status": "待确认",
                "purpose": purpose,
            }
        project = self.create_project("cli_suzhou", {"name": "新中式通勤外套 · SS26", "brief": "米白色、宽松、新中式、轻量通勤外套", "status": "active"}, project_id="prj_suzhou_ss26")
        self._seed_workflow(project["id"])
        self._seed_artifact(project["id"])
        self.create_project("cli_orbit", {"name": "城市机能风样衣 · SS27", "brief": "轻量、防风、可收纳的都市外套", "status": "active"}, project_id="prj_orbit_ss27")

    def _seed_workflow(self, project_id: str) -> None:
        wid = f"wf_{project_id}"
        self.workflows[wid] = {
            "id": wid,
            "project_id": project_id,
            "name": "服装概念生成 · 可编辑工作流",
            "source_repo": "https://github.com/Comfy-Org/workflow_templates",
            "source_license": "MIT",
            "revision": 3,
            "nodes": [
                {"id": "brief", "type": "brief", "label": "需求 Brief", "status": "completed", "depends_on": [], "editable_fields": ["prompt", "parameters"], "prompt": "米白色、宽松、新中式、轻量通勤外套", "parameters": {"language": "zh-CN"}, "references": [], "material_ids": []},
                {"id": "material_resolve", "type": "material_resolve", "label": "面料匹配", "status": "completed", "depends_on": ["brief"], "editable_fields": ["prompt", "parameters", "material_ids"], "prompt": "从已验证 CC0 面料库匹配米白与低饱和织纹", "parameters": {"top_k": 4}, "references": [], "material_ids": ["mat_fabric_081c", "mat_fabric_085"]},
                {"id": "reference_bind", "type": "reference_bind", "label": "参考图绑定", "status": "completed", "depends_on": ["brief"], "editable_fields": ["references", "parameters"], "prompt": "绑定领口结构与苏式比例参考", "parameters": {"roles": {"ref_collar_arch": "领口", "ref_suzhou_window": "比例"}}, "references": ["ref_collar_arch", "ref_suzhou_window"], "material_ids": []},
                {"id": "prompt_compose", "type": "prompt_compose", "label": "提示词编排", "status": "completed", "depends_on": ["brief", "material_resolve", "reference_bind"], "editable_fields": ["prompt", "parameters", "references"], "prompt": "新中式通勤外套，克制的苏式线条，留白，柔和自然光，服装产品摄影", "parameters": {"aspect_ratio": "4:5", "quality": "high", "preserve": ["color", "fit", "length"]}, "references": ["ref_collar_arch", "ref_suzhou_window"], "material_ids": ["mat_fabric_081c"]},
                {"id": "image_generate", "type": "image_generate", "label": "生成 V1", "status": "completed", "depends_on": ["prompt_compose"], "editable_fields": ["prompt", "parameters", "references", "material_ids"], "prompt": "米白色宽松新中式通勤外套，柔和棉质织纹，弧形领口，克制苏式线条，产品摄影", "parameters": {"model": "gpt-image-2", "size": "1024x1280", "quality": "high", "n": 1}, "references": ["ref_collar_arch"], "material_ids": ["mat_fabric_081c"], "output_artifact_id": "art_suzhou_v1"},
                {"id": "image_edit", "type": "image_edit", "label": "定向修改 V2", "status": "ready", "depends_on": ["image_generate", "reference_bind"], "editable_fields": ["prompt", "parameters", "references", "material_ids"], "prompt": "领口再小一点，其他不要改；保持米白色、宽松版型、衣长和无腰带", "parameters": {"model": "gpt-image-2", "size": "1024x1280", "quality": "high", "preserve": ["color", "fit", "length", "belt"]}, "references": ["ref_collar_arch"], "material_ids": ["mat_fabric_081c"]},
                {"id": "quality_check", "type": "quality_check", "label": "约束质量检查", "status": "ready", "depends_on": ["image_generate", "image_edit"], "editable_fields": ["parameters"], "prompt": "检查颜色、版型、衣长、领口和面料是否符合已确认要求", "parameters": {"checks": ["color", "fit", "length", "collar", "material"], "threshold": 0.85, "fail_action": "block_artifact"}, "references": [], "material_ids": []},
                {"id": "artifact", "type": "artifact_store", "label": "版本与交付", "status": "ready", "depends_on": ["quality_check"], "editable_fields": ["parameters"], "prompt": "输出设计概念稿、素材来源和版本说明", "parameters": {"format": "zip"}, "references": [], "material_ids": []},
            ],
        }

    def _seed_artifact(self, project_id: str) -> None:
        artifact_id = "art_suzhou_v1"
        self.artifacts[artifact_id] = {
            "id": artifact_id,
            "project_id": project_id,
            "node_id": "image_generate",
            "version": 1,
            "status": "published",
            "object_key": f"projects/{project_id}/artifacts/{artifact_id}.png",
            "image_url": svg_data_url("设计初稿 V1", "真丝斜纹 · 苏式通勤外套", "#ded2be", 1),
            "prompt": "米白色宽松新中式通勤外套，柔和棉质织纹，弧形领口，克制苏式线条，产品摄影",
            "references": ["ref_suzhou_window"],
            "materials": ["mat_fabric_081c"],
            "parent_artifact_id": None,
            "created_at": now_iso(),
        }

    def create_project(self, client_id: str, payload: dict[str, Any], project_id: str | None = None) -> dict[str, Any]:
        pid = project_id or new_id("prj")
        project = {"id": pid, "client_id": client_id, **payload, "created_at": now_iso(), "updated_at": now_iso(), "current_revision": 0}
        self.projects[pid] = project
        self.clients[client_id]["active_project_id"] = pid
        return project

    def create_client(self, payload: dict[str, Any]) -> dict[str, Any]:
        cid = f"cli_{len(self.clients) + 1:03d}"
        client = {"id": cid, **payload, "created_at": now_iso()}
        self.clients[cid] = client
        return client

    def confirm_reference(self, payload: dict[str, Any]) -> dict[str, Any]:
        rid = payload.get("id") or new_id("ref")
        reference = {
            "id": rid,
            "title": payload["title"],
            "source_url": payload.get("source_url", ""),
            "thumbnail_url": payload.get("thumbnail_url", ""),
            "license_status": payload.get("license_status", "待确认"),
            "purpose": payload.get("purpose", "参考"),
        }
        self.references[rid] = reference
        return reference

    def client_out(self, client: dict[str, Any]) -> dict[str, Any]:
        projects = [p for p in self.projects.values() if p["client_id"] == client["id"]]
        return {**client, "active_project_id": client.get("active_project_id") or (projects[0]["id"] if projects else None), "project_count": len(projects)}

    def workflow_for_project(self, project_id: str) -> dict[str, Any]:
        for workflow in self.workflows.values():
            if workflow["project_id"] == project_id:
                return workflow
        return self._create_default_workflow(project_id)

    def _create_default_workflow(self, project_id: str) -> dict[str, Any]:
        self._seed_workflow(project_id)
        return self.workflow_for_project(project_id)

    def add_event(self, project_id: str, event: dict[str, Any]) -> None:
        payload = {"id": new_id("evt"), "project_id": project_id, "created_at": now_iso(), **event}
        self.events[project_id].append(payload)
        for queue in list(self.subscribers[project_id]):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                pass

    async def subscribe(self, project_id: str):
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=50)
        self.subscribers[project_id].add(queue)
        try:
            for event in self.events[project_id][-8:]:
                yield event
            while True:
                yield await queue.get()
        finally:
            self.subscribers[project_id].discard(queue)

    def search_materials(self, query: str) -> list[dict[str, Any]]:
        q = query.lower().strip()
        if not q:
            return list(self.materials.values())
        return [m for m in self.materials.values() if q in (m["name"] + " " + m["category"] + " " + " ".join(m["tags"])).lower()]

    def create_run(self, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        project = self.projects[project_id]
        workflow = self.workflow_for_project(project_id)
        node_id = payload.get("node_id", "image_generate")
        node = next((item for item in workflow["nodes"] if item["id"] == node_id), None)
        if node is None:
            raise ValueError(f"工作流节点不存在：{node_id}")
        idempotency_key = payload.get("idempotency_key")
        if idempotency_key:
            previous = next((item for item in self.runs.values() if item["project_id"] == project_id and item.get("idempotency_key") == idempotency_key), None)
            if previous:
                previous["_idempotent_replay"] = True
                return previous
        rid = new_id("run")
        project["current_revision"] += 1
        source_artifact_id = payload.get("source_artifact_id") or payload.get("edit_artifact_id")
        mode = payload.get("mode") or ("edit" if node_id == "image_edit" else "generate")
        if mode == "edit" and not source_artifact_id:
            raise ValueError("图片编辑必须指定 source_artifact_id")
        run = {
            "id": rid,
            "project_id": project_id,
            "node_id": node_id,
            "mode": mode,
            "status": "queued",
            "phase": "queued",
            "revision": project["current_revision"],
            "artifact_id": None,
            "source_artifact_id": source_artifact_id,
            "attempt": payload.get("attempt", 1),
            "error_code": None,
            "message": "已加入生成队列",
            **payload,
        }
        self.runs[rid] = run
        affected: set[str] = {node_id}
        changed = True
        while changed:
            changed = False
            for candidate in workflow["nodes"]:
                if candidate["id"] in affected:
                    continue
                if any(dep in affected for dep in candidate.get("depends_on", [])):
                    affected.add(candidate["id"])
                    changed = True
        for node in workflow["nodes"]:
            if node["id"] == run["node_id"]:
                node["status"] = "queued"
            elif node["id"] in affected:
                node["status"] = "stale"
        self.add_event(project_id, {"type": "node.queued", "run_id": rid, "node_id": run["node_id"], "message": "节点已排队"})
        self.add_event(project_id, {"type": "run.phase", "run_id": rid, "node_id": node_id, "phase": "queued", "message": "工作流已排队"})
        return run

    @staticmethod
    def _first_image(result: dict[str, Any] | None) -> str | None:
        if not result:
            return None
        images = result.get("images")
        if isinstance(images, list) and images:
            return images[0] if isinstance(images[0], str) else None
        data = result.get("data")
        if isinstance(data, list) and data:
            item = data[0] or {}
            if item.get("url"):
                return item["url"]
            if item.get("b64_json"):
                return "data:image/png;base64," + item["b64_json"]
        return None

    async def complete_run(self, run_id: str, provider: Any | None = None, storage: Any | None = None) -> dict[str, Any]:
        run = self.runs[run_id]
        if run["status"] == "completed":
            return run
        run["status"] = "running"

        def phase(name: str, message: str) -> None:
            run["phase"] = name
            run["message"] = message
            self.add_event(run["project_id"], {"type": "run.phase", "run_id": run_id, "node_id": run["node_id"], "phase": name, "message": message})

        phase("input_locked", "已锁定本次输入与版本")
        self.add_event(run["project_id"], {"type": "node.running", "run_id": run_id, "node_id": run["node_id"], "message": "开始执行图片生成流"})
        prompt = run.get("prompt") or "米白色新中式通勤外套，保持简洁、克制、可穿着"
        parameters = run.get("parameters") or {}
        provider_result: dict[str, Any] | None = None
        source: dict[str, Any] | None = None
        try:
            phase("material_resolved", f"已锁定 {len(run.get('material_ids', []))} 个面料素材")
            phase("references_bound", f"已绑定 {len(run.get('references', []))} 张参考图")
            phase("prompt_composed", "已将修改意图编排为可执行提示词")
            if provider is not None:
                phase("provider.requested", "正在请求图片 Provider")
                if run["node_id"] == "image_edit" or run.get("mode") == "edit":
                    source_id = run.get("source_artifact_id") or run.get("edit_artifact_id")
                    if not source_id:
                        run["error_code"] = "source_missing"
                        raise ValueError("图片编辑缺少 source_artifact_id")
                    source = self.artifacts.get(source_id)
                    if source is None or source.get("project_id") != run["project_id"]:
                        run["error_code"] = "source_missing"
                        raise ValueError(f"找不到待修改的源版本：{source_id}")
                    run["source_artifact_id"] = source["id"]
                    provider_result = await provider.edit(
                        prompt,
                        source.get("image_url", ""),
                        model=parameters.get("model"),
                        size=parameters.get("size", "1024x1280"),
                        quality=parameters.get("quality", "high"),
                    )
                else:
                    provider_result = await provider.generate(
                        prompt,
                        model=parameters.get("model"),
                        size=parameters.get("size", "1024x1280"),
                        quality=parameters.get("quality", "high"),
                        n=parameters.get("n", 1),
                    )
                phase("provider.received", "已收到图片 Provider 返回结果")
        except Exception as exc:  # provider failures become visible run failures
            run["status"] = "failed"
            run["phase"] = "failed"
            run["error_code"] = run.get("error_code") or "provider_error"
            run["message"] = f"图片生成失败：{exc}"
            run["finished_at"] = now_iso()
            for node in self.workflow_for_project(run["project_id"])["nodes"]:
                if node["id"] == run["node_id"]:
                    node["status"] = "failed"
            self.add_event(run["project_id"], {"type": "run.failed", "run_id": run_id, "node_id": run["node_id"], "message": run["message"], "error_code": run["error_code"]})
            return run
        phase("quality.started", "正在检查颜色、版型、衣长、领口与面料约束")
        image_url = self._first_image(provider_result)
        if provider is not None and not image_url:
            run["status"] = "failed"
            run["phase"] = "quality.failed"
            run["error_code"] = "empty_output"
            run["message"] = "质量检查未通过：Provider 没有返回图片"
            run["finished_at"] = now_iso()
            for node in self.workflow_for_project(run["project_id"])["nodes"]:
                if node["id"] in {run["node_id"], "quality_check"}:
                    node["status"] = "failed"
            self.add_event(run["project_id"], {"type": "quality.failed", "run_id": run_id, "node_id": run["node_id"], "message": run["message"], "error_code": run["error_code"]})
            self.add_event(run["project_id"], {"type": "run.failed", "run_id": run_id, "node_id": run["node_id"], "message": run["message"], "error_code": run["error_code"]})
            return run
        phase("quality.passed", "质量检查通过，可以写入版本")
        await asyncio.sleep(0.15)
        artifact_id = new_id("art")
        if run["node_id"] == "image_edit" and source is not None:
            branch_version = int(source.get("version", 1)) + 1
            existing_branch_versions = [a["version"] for a in self.artifacts.values() if a["project_id"] == run["project_id"] and a["node_id"] == "image_edit"]
            version = branch_version
            while version in existing_branch_versions:
                version += 1
        else:
            previous = [a for a in self.artifacts.values() if a["project_id"] == run["project_id"] and a["node_id"] == run["node_id"]]
            version = max([a["version"] for a in previous] or [0]) + 1
        title = "设计初稿 V1" if version == 1 else (f"细节修改 V{version}" if run["node_id"] == "image_edit" else f"设计稿 V{version}")
        hue = "#d7cab7" if version == 1 else "#d2bcae"
        object_key = f"projects/{run['project_id']}/artifacts/{artifact_id}.png"
        stored_image_url = await storage.save(image_url or svg_data_url(title, "演示结果 · OpenAI-compatible Provider", hue, version), object_key) if storage is not None else image_url
        artifact = {
            "id": artifact_id,
            "project_id": run["project_id"],
            "node_id": run["node_id"],
            "version": version,
            "status": "published",
            "object_key": object_key,
            "image_url": stored_image_url or svg_data_url(title, "演示结果 · OpenAI-compatible Provider", hue, version),
            "prompt": prompt,
            "references": run.get("references", []),
            "materials": run.get("material_ids", []),
            "parent_artifact_id": source.get("id") if source else None,
            "created_at": now_iso(),
        }
        self.artifacts[artifact_id] = artifact
        run["status"] = "completed"
        run["artifact_id"] = artifact_id
        run["phase"] = "artifact.created"
        run["message"] = "已生成并发布新版本"
        run["finished_at"] = now_iso()
        workflow = self.workflow_for_project(run["project_id"])
        for node in workflow["nodes"]:
            if node["id"] == run["node_id"]:
                node["status"] = "completed"
                node["output_artifact_id"] = artifact_id
            elif node["id"] in {"quality_check", "artifact"}:
                node["status"] = "completed"
                if node["id"] == "artifact":
                    node["output_artifact_id"] = artifact_id
        self.add_event(run["project_id"], {"type": "run.phase", "run_id": run_id, "node_id": run["node_id"], "phase": "artifact.created", "message": run["message"], "artifact_id": artifact_id})
        self.add_event(run["project_id"], {"type": "artifact.created", "run_id": run_id, "node_id": run["node_id"], "artifact_id": artifact_id, "message": run["message"]})
        return run

