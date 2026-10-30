from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse

from .config import settings
from .providers.image import OpenAICompatibleImageProvider
from .providers.search import SearchProvider
from .storage import ArtifactStorage
from .schemas import (
    ArtifactOut,
    ClientCreate,
    ClientOut,
    NodeRevisionRequest,
    ProjectCreate,
    ProjectOut,
    ReferenceImportRequest,
    ReferenceOut,
    SearchOut,
    SearchRequest,
    WorkflowNode,
    WorkflowOut,
    WorkflowRunOut,
    WorkflowRunRequest,
)
from .store import MATERIALS_DIR, MATERIAL_PREVIEW_FILES, MemoryStore, now_iso, svg_data_url


app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def create_store() -> MemoryStore:
    if settings.database_url:
        try:
            from .postgres_store import PostgresStore
            return PostgresStore(settings.database_url)
        except Exception as exc:
            if not settings.allow_demo_fallback:
                raise
            print(f"[huichuang] PostgreSQL unavailable, using memory fallback: {exc}")
    return MemoryStore()


store = create_store()
image_provider = OpenAICompatibleImageProvider()
search_provider = SearchProvider()
artifact_storage = ArtifactStorage()


def enqueue_with_rq(run_id: str) -> bool:
    if settings.queue_backend.lower() != "rq":
        return False
    try:
        from redis import Redis
        from rq import Queue

        connection = Redis.from_url(settings.redis_url)
        connection.ping()
        Queue("huichuang", connection=connection).enqueue("services.worker.worker.execute_run", run_id, job_timeout=900)
        return True
    except Exception as exc:
        if not settings.allow_demo_fallback:
            raise
        print(f"[huichuang] RQ unavailable, using inline runner: {exc}")
        return False


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "service": "huichuang-ai-api", "env": settings.app_env, "image_provider": "configured" if image_provider.configured else "demo-fallback", "database": getattr(store, "backend", "memory"), "queue": settings.queue_backend, "storage": "s3" if artifact_storage.configured else "inline"}


@app.get("/api/clients", response_model=list[ClientOut])
async def list_clients() -> list[dict[str, Any]]:
    return [store.client_out(c) for c in store.clients.values()]


@app.post("/api/clients", response_model=ClientOut)
async def create_client(payload: ClientCreate) -> dict[str, Any]:
    client = store.create_client(payload.model_dump())
    return store.client_out(client)


@app.get("/api/clients/{client_id}", response_model=ClientOut)
async def get_client(client_id: str) -> dict[str, Any]:
    client = store.clients.get(client_id)
    if not client:
        raise HTTPException(404, "客户档案不存在")
    return store.client_out(client)


@app.get("/api/clients/{client_id}/projects", response_model=list[ProjectOut])
async def list_projects(client_id: str) -> list[dict[str, Any]]:
    if client_id not in store.clients:
        raise HTTPException(404, "客户档案不存在")
    return [p for p in store.projects.values() if p["client_id"] == client_id]


@app.post("/api/clients/{client_id}/projects", response_model=ProjectOut)
async def create_project(client_id: str, payload: ProjectCreate) -> dict[str, Any]:
    if client_id not in store.clients:
        raise HTTPException(404, "客户档案不存在")
    return store.create_project(client_id, payload.model_dump())


@app.get("/api/projects/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str) -> dict[str, Any]:
    project = store.projects.get(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    return project


@app.get("/api/projects/{project_id}/materials", response_model=list[dict[str, Any]])
async def list_project_materials(project_id: str, q: str = Query("")) -> list[dict[str, Any]]:
    if project_id not in store.projects:
        raise HTTPException(404, "项目不存在")
    return store.search_materials(q)


@app.get("/api/materials/search", response_model=list[dict[str, Any]])
async def search_materials(q: str = Query("")) -> list[dict[str, Any]]:
    return store.search_materials(q)


@app.get("/api/materials/{material_id}/preview")
async def material_preview(material_id: str) -> Response:
    material = store.materials.get(material_id)
    if not material:
        raise HTTPException(404, "面料不存在")
    preview_name = MATERIAL_PREVIEW_FILES.get(material_id)
    preview_path = MATERIALS_DIR / preview_name if preview_name else None
    if preview_path and preview_path.exists():
        return FileResponse(preview_path, media_type="image/png")
    color = material["color"]
    svg = f"""<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'><defs><pattern id='p' width='18' height='18' patternUnits='userSpaceOnUse'><rect width='18' height='18' fill='{color}'/><path d='M0 0L18 18M18 0L0 18' stroke='#fff' opacity='.17' stroke-width='2'/></pattern></defs><rect width='640' height='480' fill='url(#p)'/><text x='32' y='420' font-family='Arial' font-size='24' fill='#ffffff' opacity='.86'>{material["name"]}</text></svg>"""
    return Response(svg, media_type="image/svg+xml")


@app.get("/api/references", response_model=list[ReferenceOut])
async def list_references(q: str = Query("")) -> list[dict[str, Any]]:
    query = q.lower().strip()
    if not query:
        return list(store.references.values())
    return [r for r in store.references.values() if query in (r["title"] + " " + r.get("purpose", "")).lower()]


@app.get("/api/references/{reference_id}/preview.svg")
async def reference_preview(reference_id: str) -> Response:
    reference = store.references.get(reference_id)
    if not reference:
        raise HTTPException(404, "参考图不存在")
    svg = f"""<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'><defs><linearGradient id='g' x1='0' x2='1'><stop stop-color='#e9e6df'/><stop offset='1' stop-color='#b7c3d8'/></linearGradient></defs><rect width='640' height='480' fill='url(#g)'/><path d='M170 90L470 90L540 390L100 390Z' fill='#f4f1ea' opacity='.75'/><path d='M170 90L320 230L470 90' fill='none' stroke='#404858' stroke-width='8' opacity='.7'/><text x='28' y='444' font-family='Arial' font-size='22' fill='#1d2634'>{reference["title"]}</text></svg>"""
    return Response(svg, media_type="image/svg+xml")


@app.get("/api/projects/{project_id}/workflow", response_model=WorkflowOut)
async def get_workflow(project_id: str) -> dict[str, Any]:
    if project_id not in store.projects:
        raise HTTPException(404, "项目不存在")
    return store.workflow_for_project(project_id)


@app.patch("/api/projects/{project_id}/nodes/{node_id}", response_model=WorkflowOut)
async def revise_node(project_id: str, node_id: str, payload: NodeRevisionRequest) -> dict[str, Any]:
    workflow = store.workflow_for_project(project_id)
    target = next((n for n in workflow["nodes"] if n["id"] == node_id), None)
    if not target:
        raise HTTPException(404, "工作流节点不存在")
    data = payload.model_dump(exclude_none=True)
    if "material_ids" in data:
        target["material_ids"] = data.pop("material_ids")
    target.update(data)
    target["status"] = "stale"
    affected = set()
    changed = True
    while changed:
        changed = False
        for node in workflow["nodes"]:
            if node["id"] in affected or node["id"] == node_id:
                continue
            if any(dep == node_id or dep in affected for dep in node.get("depends_on", [])):
                affected.add(node["id"])
                node["status"] = "stale"
                changed = True
    store.add_event(project_id, {"type": "workflow.updated", "node_id": node_id, "affected_nodes": list(affected), "message": "节点已修改，下游节点标记为过期"})
    if hasattr(store, "flush"):
        store.flush()
    return workflow


@app.post("/api/projects/{project_id}/runs", response_model=WorkflowRunOut)
async def start_run(project_id: str, payload: WorkflowRunRequest, background_tasks: BackgroundTasks) -> dict[str, Any]:
    if project_id not in store.projects:
        raise HTTPException(404, "项目不存在")
    try:
        run = store.create_run(project_id, payload.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    replay = bool(run.pop("_idempotent_replay", False))
    if not replay and not enqueue_with_rq(run["id"]):
        background_tasks.add_task(store.complete_run, run["id"], image_provider, artifact_storage)
    return run


@app.get("/api/projects/{project_id}/runs", response_model=list[WorkflowRunOut])
async def list_runs(project_id: str) -> list[dict[str, Any]]:
    return [r for r in store.runs.values() if r["project_id"] == project_id]


@app.get("/api/projects/{project_id}/artifacts", response_model=list[ArtifactOut])
async def list_artifacts(project_id: str) -> list[dict[str, Any]]:
    return sorted([a for a in store.artifacts.values() if a["project_id"] == project_id], key=lambda a: (a["node_id"], a["version"]))


@app.get("/api/artifacts/{artifact_id}/preview.svg")
async def artifact_preview(artifact_id: str) -> Response:
    artifact = store.artifacts.get(artifact_id)
    if not artifact:
        raise HTTPException(404, "成果不存在")
    title = "V2 细节修改" if artifact["version"] > 1 else "设计初稿 V1"
    svg = svg_data_url(title, artifact["prompt"][:70], "#d5c3b5" if artifact["version"] > 1 else "#d9ceb9", artifact["version"])
    raw = __import__("base64").b64decode(svg.split(",", 1)[1])
    return Response(raw, media_type="image/svg+xml")


@app.get("/api/projects/{project_id}/events")
async def project_events(project_id: str, request: Request) -> StreamingResponse:
    if project_id not in store.projects:
        raise HTTPException(404, "项目不存在")

    async def event_stream():
        async for event in store.subscribe(project_id):
            if await request.is_disconnected():
                break
            yield f"event: {event.get('type', 'message')}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})


@app.post("/api/search", response_model=SearchOut)
async def search_web(payload: SearchRequest) -> dict[str, Any]:
    remote = await search_provider.search(payload.query)
    if remote.get("results"):
        results = []
        for index, item in enumerate(remote["results"]):
            results.append({
                "id": item.get("id") or f"search_{index + 1}",
                "title": item.get("title") or item.get("name") or payload.query,
                "source_url": item.get("source_url") or item.get("url") or item.get("link") or "",
                "thumbnail_url": item.get("thumbnail_url") or item.get("thumbnail") or item.get("image") or "",
                "license_status": item.get("license_status") or item.get("license") or "待确认",
                "purpose": item.get("purpose") or "联网参考",
            })
        return {"query": payload.query, "provider": remote.get("provider", "remote"), "results": results}
    local_refs = [r for r in store.references.values() if payload.query.lower() in (r["title"] + " " + r["purpose"]).lower()]
    return {"query": payload.query, "provider": "local-fallback", "results": local_refs}


@app.post("/api/references/confirm", response_model=ReferenceOut)
async def confirm_reference(payload: ReferenceImportRequest) -> dict[str, Any]:
    """Persist a searched reference only after explicit user confirmation."""
    return store.confirm_reference(payload.model_dump(exclude_none=True))


@app.post("/api/image/generate")
async def image_generate(payload: dict[str, Any]) -> dict[str, Any]:
    return await image_provider.generate(payload.get("prompt", ""), model=payload.get("model"), size=payload.get("size", "1024x1280"), quality=payload.get("quality", "high"), n=payload.get("n", 1))


@app.post("/api/image/edit")
async def image_edit(payload: dict[str, Any]) -> dict[str, Any]:
    return await image_provider.edit(payload.get("prompt", ""), payload.get("image", ""), model=payload.get("model"), size=payload.get("size", "1024x1280"), quality=payload.get("quality", "high"))

