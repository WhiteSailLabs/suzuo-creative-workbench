from __future__ import annotations

import base64
import binascii
import secrets
from pathlib import Path
from typing import Any, Optional, Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .config import settings
from .intent import TextInterpretationProvider, interpret_turn_with_provider
from .providers.image import OpenAICompatibleImageProvider
from .providers.rodin import RodinProvider
from .schemas import (
    StageGateContext,
    ReviewCreate,
    ReviewResolve,
    ReviewRecord,
    AssetRecord,
    AssetPatch,
    ProjectCreate,
    DirectionCreate,
    DesignDirection,
    ConversationTurnCreate,
    CulturalReference,
    CulturalReferenceCreate,
    CulturalReferencePatch,
    DesignVersion,
    GenerationJob,
    ImageImportCreate,
    ImageJobCreate,
    InterpretedTurn,
    RodinJobCreate,
    WorkspaceOut,
)
from .store import GenerationConflict, StageGateConflict, MemoryStore


app = FastAPI(title=settings.app_name, version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = MemoryStore()
image_provider = OpenAICompatibleImageProvider()
text_interpreter = TextInterpretationProvider()
rodin_provider = RodinProvider()


async def run_workbench_image_job(job_id: str) -> None:
    try:
        workspace, job = store._job_location(job_id)
        store.start_generation_job(job_id)
        base_version = next(
            (
                item
                for item in workspace["versions"]
                if item["id"] == job.get("base_version_id")
            ),
            None,
        )
        source_image = None
        if base_version:
            source_image = next(
                (
                    item.get("path") or item.get("url")
                    for item in base_version["artifacts"]
                    if item.get("kind") == "image"
                ),
                None,
            )
        result = (
            await image_provider.edit(job["prompt"], source_image)
            if source_image
            else await image_provider.generate(job["prompt"])
        )
        images = image_provider.normalize_images(result)
        if not images:
            store.fail_generation_job(job_id, "图片服务没有返回有效图片")
            return
        artifact_id = f"artifact_image_{secrets.token_hex(5)}"
        saved = await image_provider.save_image(
            images[0], Path(settings.image_output_dir), artifact_id
        )
        store.complete_image_job(
            job_id,
            {
                "id": artifact_id,
                "kind": "image",
                "url": f"/api/workbench/assets/{artifact_id}",
                **saved,
            },
        )
    except Exception as exc:
        store.fail_generation_job(job_id, f"图片生成失败：{exc}")


async def run_workbench_rodin_job(job_id: str) -> None:
    try:
        _, job = store._job_location(job_id)
        store.start_generation_job(job_id)
        image_paths = (
            [Path(item["path"]) for item in job.get("reference_snapshot", [])]
            if job.get("input_mode") == "image"
            else None
        )
        result = await rodin_provider.generate(
            job["prompt"],
            Path(settings.rodin_output_dir),
            image_paths=image_paths,
        )
        model = result.files[0]
        artifact_id = f"artifact_glb_{secrets.token_hex(5)}"
        store.complete_rodin_job(
            job_id,
            {
                "id": artifact_id,
                "kind": "model_glb",
                "path": model.path,
                "url": f"/api/workbench/assets/{artifact_id}",
                "media_type": "model/gltf-binary",
                "generation_id": result.generation_id,
                "role": model.role,
                "input_mode": job.get("input_mode", "text"),
                "reference_artifact_ids": list(
                    job.get("reference_artifact_ids") or []
                ),
                "consistency_status": job.get("consistency_status"),
                "disclaimer": "概念模型，不是生产 CAD",
            },
        )
    except Exception as exc:
        store.fail_generation_job(job_id, f"Rodin 生成失败：{exc}")


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "suzuo-creative-workbench-api",
        "env": settings.app_env,
        "text_provider": "configured" if text_interpreter.configured else "demo-fallback",
        "image_provider": "configured" if image_provider.configured else "demo-fallback",
        "database": store.backend,
    }


@app.get("/api/workbench/projects")
async def list_workbench_projects():
    return store.list_projects()


@app.post("/api/workbench/projects", response_model=WorkspaceOut, status_code=201)
async def create_workbench_project(payload: ProjectCreate):
    try:
        return store.create_project(payload.model_dump())
    except GenerationConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def require_project(project_id: str):
    if store.workspace_for_project(project_id) is None:
        raise HTTPException(404, "文创项目不存在")


@app.post("/api/workbench/projects/{project_id}/directions",
          response_model=DesignDirection, status_code=201)
async def create_workbench_direction(project_id: str, payload: DirectionCreate):
    require_project(project_id)
    try:
        return store.create_direction(project_id, payload.model_dump())
    except GenerationConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/workbench/projects/{project_id}/assets", response_model=list[AssetRecord])
async def list_workbench_assets(project_id: str, type: Optional[str] = None,
                                status: Optional[str] = None, direction_id: Optional[str] = None,
                                tag: Optional[str] = None, query: Optional[str] = None):
    require_project(project_id)
    return store.list_assets(project_id, {"type": type, "status": status,
                              "direction_id": direction_id, "tag": tag, "query": query})


@app.patch("/api/workbench/projects/{project_id}/assets/{asset_id}", response_model=AssetRecord)
async def patch_workbench_asset(project_id: str, asset_id: str, payload: AssetPatch):
    require_project(project_id)
    try:
        item = store.patch_asset(project_id, asset_id, payload.model_dump(exclude_unset=True))
    except GenerationConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if item is None:
        raise HTTPException(404, "资产不存在")
    return item


@app.get("/api/workbench/projects/{project_id}/assets/{asset_id}/relations")
async def workbench_asset_relations(project_id: str, asset_id: str):
    require_project(project_id)
    item = store.asset_relations(project_id, asset_id)
    if item is None:
        raise HTTPException(404, "资产不存在")
    return item


@app.get("/api/workbench/projects/{project_id}", response_model=WorkspaceOut)
async def get_workbench_project(project_id: str) -> dict[str, Any]:
    workspace = store.workspace_for_project(project_id)
    if workspace is None:
        raise HTTPException(404, "文创项目不存在")
    return workspace


@app.post(
    "/api/workbench/projects/{project_id}/turns",
    response_model=InterpretedTurn,
    status_code=201,
)
async def create_workbench_turn(
    project_id: str, payload: ConversationTurnCreate
) -> dict[str, Any]:
    workspace = store.workspace_for_project(project_id)
    if workspace is None:
        raise HTTPException(404, "文创项目不存在")
    interpreted = (
        await interpret_turn_with_provider(payload.text, workspace, text_interpreter)
    ).model_dump()
    interpreted["correction_of"] = payload.corrected_turn_id
    return store.record_turn(project_id, interpreted)


@app.get(
    "/api/workbench/projects/{project_id}/culture",
    response_model=list[CulturalReference],
)
async def list_workbench_culture(project_id: str) -> list[dict[str, Any]]:
    workspace = store.workspace_for_project(project_id)
    if workspace is None:
        raise HTTPException(404, "文创项目不存在")
    return workspace["culture"]


@app.post(
    "/api/workbench/projects/{project_id}/culture",
    response_model=CulturalReference,
    status_code=201,
)
async def create_workbench_culture(
    project_id: str, payload: CulturalReferenceCreate
) -> dict[str, Any]:
    if store.workspace_for_project(project_id) is None:
        raise HTTPException(404, "文创项目不存在")
    return store.create_cultural_reference(project_id, payload.model_dump())


@app.patch(
    "/api/workbench/projects/{project_id}/culture/{reference_id}",
    response_model=CulturalReference,
)
async def patch_workbench_culture(
    project_id: str, reference_id: str, payload: CulturalReferencePatch
) -> dict[str, Any]:
    if store.workspace_for_project(project_id) is None:
        raise HTTPException(404, "文创项目不存在")
    try:
        item = store.patch_cultural_reference(
            project_id, reference_id, payload.model_dump(exclude_unset=True)
        )
    except GenerationConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if item is None:
        raise HTTPException(404, "文化条目不存在")
    return item


@app.post(
    "/api/workbench/projects/{project_id}/image-jobs",
    response_model=GenerationJob,
    status_code=202,
)
async def create_workbench_image_job(
    project_id: str, payload: ImageJobCreate, background_tasks: BackgroundTasks
) -> dict[str, Any]:
    if store.workspace_for_project(project_id) is None:
        raise HTTPException(404, "文创项目不存在")
    try:
        store.validate_generation_submission(project_id, "image", payload.model_dump())
        job = store.create_image_job(project_id, payload.model_dump())
    except StageGateConflict as exc:
        raise HTTPException(409, exc.detail) from exc
    except GenerationConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    background_tasks.add_task(run_workbench_image_job, job["id"])
    return job


@app.post(
    "/api/workbench/projects/{project_id}/image-imports",
    response_model=GenerationJob,
    status_code=201,
)
async def import_workbench_image(
    project_id: str, payload: ImageImportCreate
) -> dict[str, Any]:
    if store.workspace_for_project(project_id) is None:
        raise HTTPException(404, "文创项目不存在")
    media_types = {
        "image/png": (".png", b"\x89PNG\r\n\x1a\n"),
        "image/jpeg": (".jpg", b"\xff\xd8\xff"),
        "image/webp": (".webp", b"RIFF"),
    }
    try:
        header, encoded = payload.data_url.split(",", 1)
        media_type = header.removeprefix("data:").removesuffix(";base64")
        extension, magic = media_types[media_type]
        content = base64.b64decode(encoded, validate=True)
    except (ValueError, KeyError, binascii.Error) as exc:
        raise HTTPException(422, "只支持有效的 PNG、JPEG 或 WebP 图片") from exc
    if not content.startswith(magic):
        raise HTTPException(422, "图片内容与声明格式不一致")
    if media_type == "image/webp" and content[8:12] != b"WEBP":
        raise HTTPException(422, "图片内容与声明格式不一致")

    artifact_id = f"artifact_image_{secrets.token_hex(5)}"
    target_dir = Path(settings.image_output_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{artifact_id}{extension}"
    target.write_bytes(content)
    try:
        job = store.create_image_job(
            project_id,
            {
                "source_turn_id": payload.source_turn_id,
                "base_version_id": payload.base_version_id,
                "prompt": "导入已有概念图",
            },
        )
        completed = store.complete_image_job(
            job["id"],
            {
                "id": artifact_id,
                "kind": "image",
                "path": str(target),
                "url": f"/api/workbench/assets/{artifact_id}",
                "media_type": media_type,
                "source": "imported",
            },
        )
        completed["message"] = "已有概念图已导入"
        return completed
    except GenerationConflict as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(422, str(exc)) from exc


@app.post(
    "/api/workbench/projects/{project_id}/rodin-jobs",
    response_model=GenerationJob,
    status_code=202,
)
async def create_workbench_rodin_job(
    project_id: str, payload: RodinJobCreate, background_tasks: BackgroundTasks
) -> dict[str, Any]:
    if store.workspace_for_project(project_id) is None:
        raise HTTPException(404, "文创项目不存在")
    try:
        store.validate_generation_submission(project_id, "rodin", payload.model_dump())
        job = store.create_rodin_job(project_id, payload.model_dump())
    except StageGateConflict as exc:
        raise HTTPException(409, exc.detail) from exc
    except GenerationConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    background_tasks.add_task(run_workbench_rodin_job, job["id"])
    return job


@app.get(
    "/api/workbench/projects/{project_id}/jobs/{job_id}",
    response_model=GenerationJob,
)
async def get_workbench_job(project_id: str, job_id: str) -> dict[str, Any]:
    if store.workspace_for_project(project_id) is None:
        raise HTTPException(404, "文创项目不存在")
    job = store.generation_job(project_id, job_id)
    if job is None:
        raise HTTPException(404, "生成任务不存在")
    return job


@app.post(
    "/api/workbench/projects/{project_id}/jobs/{job_id}/retry",
    response_model=GenerationJob,
    status_code=202,
)
async def retry_workbench_job(
    project_id: str, job_id: str, background_tasks: BackgroundTasks
) -> dict[str, Any]:
    if store.workspace_for_project(project_id) is None:
        raise HTTPException(404, "文创项目不存在")
    if store.generation_job(project_id, job_id) is None:
        raise HTTPException(404, "生成任务不存在")
    try:
        original = store.generation_job(project_id, job_id)
        if original["status"] != "failed":
            raise ValueError("只有失败任务可以重试")
        store.validate_generation_submission(project_id, original["kind"], original)
        job = store.retry_generation_job(job_id)
    except StageGateConflict as exc:
        raise HTTPException(409, exc.detail) from exc
    except GenerationConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except (KeyError, ValueError) as exc:
        raise HTTPException(422, str(exc)) from exc
    runner = run_workbench_rodin_job if job["kind"] == "rodin" else run_workbench_image_job
    background_tasks.add_task(runner, job["id"])
    return job


@app.get(
    "/api/workbench/projects/{project_id}/versions",
    response_model=list[DesignVersion],
)
async def list_workbench_versions(project_id: str) -> list[dict[str, Any]]:
    workspace = store.workspace_for_project(project_id)
    if workspace is None:
        raise HTTPException(404, "文创项目不存在")
    return workspace["versions"]


@app.post(
    "/api/workbench/projects/{project_id}/versions/{version_id}/candidate",
    response_model=DesignVersion,
)
async def select_workbench_candidate(
    project_id: str, version_id: str
) -> dict[str, Any]:
    if store.workspace_for_project(project_id) is None:
        raise HTTPException(404, "文创项目不存在")
    try:
        version = store.select_candidate_version(project_id, version_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if version is None:
        raise HTTPException(404, "设计版本不存在")
    return version


@app.post("/api/workbench/projects/{project_id}/reviews", response_model=ReviewRecord, status_code=201)
async def create_workbench_review(project_id: str, payload: ReviewCreate):
    require_project(project_id)
    try:
        return store.create_review(project_id, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.patch("/api/workbench/projects/{project_id}/reviews/{review_id}", response_model=ReviewRecord)
async def resolve_workbench_review(project_id: str, review_id: str, payload: ReviewResolve):
    require_project(project_id)
    try:
        review = store.resolve_review(project_id, review_id, payload.model_dump(exclude_unset=True))
    except StageGateConflict as exc:
        raise HTTPException(409, exc.detail) from exc
    except GenerationConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if review is None:
        raise HTTPException(404, "评审不存在")
    return review


@app.post("/api/workbench/projects/{project_id}/stage-gates/{action}")
async def check_workbench_stage_gate(project_id: str, action: str, payload: StageGateContext):
    require_project(project_id)
    try:
        return store.stage_gate_status(project_id, action, payload.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/workbench/projects/{project_id}/stage-gates/{action}")
async def workbench_stage_gate(project_id: str, action: str, version_id: Optional[str] = None,
                               confirmed: bool = False, input_mode: str = "image"):
    require_project(project_id)
    try:
        return store.stage_gate_status(project_id, action, {"version_id": version_id, "confirmed": confirmed, "input_mode": input_mode} if version_id else {"confirmed": confirmed, "input_mode": input_mode})
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/workbench/projects/{project_id}/manifest")
async def workbench_manifest(project_id: str, audience: Literal["internal", "customer"] = "internal"):
    require_project(project_id)
    try:
        return store.asset_manifest(project_id, audience)
    except StageGateConflict as exc:
        raise HTTPException(409, exc.detail) from exc


@app.get("/api/workbench/projects/{project_id}/proposal")
async def get_workbench_proposal(project_id: str, audience: Optional[Literal["internal", "customer"]] = None) -> dict[str, Any]:
    if store.workspace_for_project(project_id) is None:
        raise HTTPException(404, "文创项目不存在")
    try:
        proposal = store.proposal_for_project(project_id, audience)
    except StageGateConflict as exc:
        raise HTTPException(409, exc.detail) from exc
    if proposal is None:
        raise HTTPException(409, store.stage_gate_status(project_id, "customer_proposal" if audience == "customer" else "internal_proposal"))
    return proposal


@app.get("/api/workbench/assets/{artifact_id}")
async def get_workbench_asset(artifact_id: str) -> FileResponse:
    artifact = store.find_artifact(artifact_id)
    if artifact is None or not artifact.get("path"):
        raise HTTPException(404, "成果文件不存在")
    target = Path(artifact["path"]).resolve()
    allowed_roots = (
        Path(settings.image_output_dir).resolve(),
        Path(settings.rodin_output_dir).resolve(),
    )
    if not any(target == root or root in target.parents for root in allowed_roots):
        raise HTTPException(403, "成果文件路径无效")
    if not target.is_file():
        raise HTTPException(404, "成果文件不存在")
    return FileResponse(target, media_type=artifact.get("media_type"))
