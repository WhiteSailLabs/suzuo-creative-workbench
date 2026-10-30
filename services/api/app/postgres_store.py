from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .store import MemoryStore, now_iso


def normalize_dsn(value: str) -> str:
    return value.replace("postgresql+psycopg://", "postgresql://", 1)


class PostgresStore(MemoryStore):
    """Persistent store with the same shape as MemoryStore.

    The in-process dictionaries remain the read cache for the API, while every
    mutation is flushed to PostgreSQL. This keeps the local demo fast and makes
    client/project/workflow/run/artifact data survive restarts.
    """

    backend = "postgres"

    def __init__(self, dsn: str) -> None:
        self.dsn = normalize_dsn(dsn)
        self._initializing = True
        super().__init__()
        self._initializing = False
        self._ensure_schema()
        if self._count("clients") == 0:
            self.flush()
        else:
            self._load()

    def _connect(self):
        return psycopg.connect(self.dsn, row_factory=dict_row, connect_timeout=3)

    def _ensure_schema(self) -> None:
        schema_path = Path(__file__).resolve().parents[3] / "schema.sql"
        statements = [part.strip() for part in schema_path.read_text(encoding="utf-8").split(";") if part.strip()]
        with self._connect() as conn:
            for statement in statements:
                conn.execute(statement)

    def _count(self, table: str) -> int:
        allowed = {"clients", "projects", "materials", "references_library", "workflow_templates", "workflow_runs", "artifact_versions", "audit_events"}
        if table not in allowed:
            raise ValueError("invalid table")
        with self._connect() as conn:
            row = conn.execute(f"select count(*) as count from {table}").fetchone()
        return int(row["count"] if row else 0)

    @staticmethod
    def _json(value: Any) -> str:
        return json.dumps(value if value is not None else {}, ensure_ascii=False)

    @staticmethod
    def _iso(value: Any) -> str:
        return value.isoformat() if hasattr(value, "isoformat") else str(value)

    def flush(self) -> None:
        if getattr(self, "_initializing", False):
            return
        with self._connect() as conn:
            for client in self.clients.values():
                conn.execute(
                    """insert into clients (id, name, subtitle, industry, accent, created_at)
                    values (%s, %s, %s, %s, %s, %s)
                    on conflict (id) do update set name=excluded.name, subtitle=excluded.subtitle,
                    industry=excluded.industry, accent=excluded.accent""",
                    (client["id"], client["name"], client.get("subtitle", ""), client.get("industry", "服装设计"), client.get("accent", "#5B6BFF"), client.get("created_at", now_iso())),
                )
            for project in self.projects.values():
                conn.execute(
                    """insert into projects (id, client_id, name, brief, status, current_revision, created_at, updated_at)
                    values (%s, %s, %s, %s, %s, %s, %s, %s)
                    on conflict (id) do update set name=excluded.name, brief=excluded.brief, status=excluded.status,
                    current_revision=excluded.current_revision, updated_at=excluded.updated_at""",
                    (project["id"], project["client_id"], project["name"], project.get("brief", ""), project.get("status", "active"), project.get("current_revision", 0), project.get("created_at", now_iso()), project.get("updated_at", now_iso())),
                )
            for material in self.materials.values():
                conn.execute(
                    """insert into materials (id, name, category, color, texture_url, source, license, verified, tags_json)
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                    on conflict (id) do update set name=excluded.name, category=excluded.category, color=excluded.color,
                    texture_url=excluded.texture_url, source=excluded.source, license=excluded.license,
                    verified=excluded.verified, tags_json=excluded.tags_json""",
                    (material["id"], material["name"], material.get("category", ""), material.get("color"), material["texture_url"], material.get("source", ""), material.get("license", "CC0-1.0"), material.get("verified", True), self._json(material.get("tags", []))),
                )
            for reference in self.references.values():
                conn.execute(
                    """insert into references_library (id, title, source_url, thumbnail_url, license_status, purpose)
                    values (%s, %s, %s, %s, %s, %s)
                    on conflict (id) do update set title=excluded.title, source_url=excluded.source_url,
                    thumbnail_url=excluded.thumbnail_url, license_status=excluded.license_status, purpose=excluded.purpose""",
                    (reference["id"], reference["title"], reference.get("source_url", ""), reference.get("thumbnail_url", ""), reference.get("license_status", "待确认"), reference.get("purpose", "参考")),
                )
            for workflow in self.workflows.values():
                conn.execute(
                    """insert into workflow_templates (id, project_id, name, source_repo, source_license, revision, graph_json)
                    values (%s, %s, %s, %s, %s, %s, %s::jsonb)
                    on conflict (id) do update set name=excluded.name, revision=excluded.revision, graph_json=excluded.graph_json""",
                    (workflow["id"], workflow["project_id"], workflow["name"], workflow.get("source_repo", ""), workflow.get("source_license", "MIT"), workflow.get("revision", 1), self._json(workflow)),
                )
            for run in self.runs.values():
                conn.execute(
                    """insert into workflow_runs (id, project_id, node_id, status, brief_revision, prompt, parameters_json,
                    references_json, materials_json, provider, error_code, created_at, finished_at, mode, source_artifact_id,
                    phase, attempt, idempotency_key)
                    values (%s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    on conflict (id) do update set status=excluded.status, prompt=excluded.prompt,
                    parameters_json=excluded.parameters_json, references_json=excluded.references_json,
                    materials_json=excluded.materials_json, error_code=excluded.error_code, finished_at=excluded.finished_at,
                    mode=excluded.mode, source_artifact_id=excluded.source_artifact_id, phase=excluded.phase,
                    attempt=excluded.attempt, idempotency_key=excluded.idempotency_key""",
                    (run["id"], run["project_id"], run["node_id"], run.get("status", "queued"), run.get("revision", 0), run.get("prompt", ""), self._json(run.get("parameters", {})), self._json(run.get("references", [])), self._json(run.get("material_ids", [])), run.get("provider", "openai-compatible"), run.get("error_code"), run.get("created_at", now_iso()), run.get("finished_at"), run.get("mode", "generate"), run.get("source_artifact_id"), run.get("phase"), run.get("attempt", 1), run.get("idempotency_key")),
                )
            for artifact in self.artifacts.values():
                conn.execute(
                    """insert into artifact_versions (id, project_id, node_id, version, status, object_key, image_url,
                    prompt, references_json, materials_json, parent_artifact_id, created_at)
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s)
                    on conflict (id) do update set status=excluded.status, image_url=excluded.image_url,
                    prompt=excluded.prompt, references_json=excluded.references_json, materials_json=excluded.materials_json""",
                    (artifact["id"], artifact["project_id"], artifact["node_id"], artifact.get("version", 1), artifact.get("status", "published"), artifact.get("object_key", f"artifacts/{artifact['id']}.json"), artifact["image_url"], artifact.get("prompt", ""), self._json(artifact.get("references", [])), self._json(artifact.get("materials", [])), artifact.get("parent_artifact_id"), artifact.get("created_at", now_iso())),
                )
            for project_id, events in self.events.items():
                for event in events:
                    conn.execute(
                        """insert into audit_events (id, project_id, type, payload_json, created_at)
                        values (%s, %s, %s, %s::jsonb, %s) on conflict (id) do nothing""",
                        (event["id"], project_id, event.get("type", "message"), self._json(event), event.get("created_at", now_iso())),
                    )

    def _load(self) -> None:
        with self._connect() as conn:
            self.clients = {row["id"]: {**row, "created_at": self._iso(row["created_at"])} for row in conn.execute("select * from clients").fetchall()}
            self.projects = {row["id"]: {**row, "created_at": self._iso(row["created_at"]), "updated_at": self._iso(row["updated_at"])} for row in conn.execute("select * from projects").fetchall()}
            self.materials = {row["id"]: {**row, "tags": row.pop("tags_json") or []} for row in conn.execute("select * from materials").fetchall()}
            self.references = {row["id"]: row for row in conn.execute("select * from references_library").fetchall()}
            self.workflows = {}
            for row in conn.execute("select graph_json from workflow_templates").fetchall():
                graph = row["graph_json"]
                self.workflows[graph["id"]] = graph
            self.runs = {}
            for row in conn.execute("select * from workflow_runs").fetchall():
                self.runs[row["id"]] = {"id": row["id"], "project_id": row["project_id"], "node_id": row["node_id"], "status": row["status"], "revision": row["brief_revision"], "prompt": row["prompt"], "parameters": row["parameters_json"] or {}, "references": row["references_json"] or [], "material_ids": row["materials_json"] or [], "artifact_id": None, "message": "已恢复", "created_at": self._iso(row["created_at"]), "mode": row.get("mode", "generate"), "source_artifact_id": row.get("source_artifact_id"), "phase": row.get("phase"), "attempt": row.get("attempt", 1), "idempotency_key": row.get("idempotency_key"), "error_code": row.get("error_code")}
            self.artifacts = {}
            for row in conn.execute("select * from artifact_versions").fetchall():
                self.artifacts[row["id"]] = {"id": row["id"], "project_id": row["project_id"], "node_id": row["node_id"], "version": row["version"], "status": row["status"], "object_key": row["object_key"], "image_url": row["image_url"], "prompt": row["prompt"], "references": row["references_json"] or [], "materials": row["materials_json"] or [], "parent_artifact_id": row["parent_artifact_id"], "created_at": self._iso(row["created_at"])}
            self.events = defaultdict(list)
            for row in conn.execute("select * from audit_events order by created_at asc").fetchall():
                payload = row["payload_json"] or {}
                payload.update({"id": row["id"], "project_id": row["project_id"], "type": row["type"], "created_at": self._iso(row["created_at"])})
                self.events.setdefault(row["project_id"], []).append(payload)

    def create_client(self, payload: dict[str, Any]) -> dict[str, Any]:
        client = super().create_client(payload)
        self.flush()
        return client

    def confirm_reference(self, payload: dict[str, Any]) -> dict[str, Any]:
        reference = super().confirm_reference(payload)
        self.flush()
        return reference

    def create_project(self, client_id: str, payload: dict[str, Any], project_id: str | None = None) -> dict[str, Any]:
        project = super().create_project(client_id, payload, project_id)
        self.flush()
        return project

    def create_run(self, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        run = super().create_run(project_id, payload)
        self.flush()
        return run

    async def complete_run(self, run_id: str, provider: Any | None = None, storage: Any | None = None) -> dict[str, Any]:
        result = await super().complete_run(run_id, provider, storage)
        self.flush()
        return result

    async def subscribe(self, project_id: str):
        """Poll audit_events so SSE also sees events written by an RQ worker."""
        seen: set[str] = set()
        for event in self.events[project_id][-8:]:
            seen.add(event["id"])
            yield event
        while True:
            with self._connect() as conn:
                rows = conn.execute(
                    "select * from audit_events where project_id=%s order by created_at asc",
                    (project_id,),
                ).fetchall()
            for row in rows:
                if row["id"] in seen:
                    continue
                payload = row["payload_json"] or {}
                payload.update({"id": row["id"], "project_id": row["project_id"], "type": row["type"], "created_at": self._iso(row["created_at"])})
                seen.add(row["id"])
                yield payload
            await asyncio.sleep(0.5)
