from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ClientCreate(BaseModel):
    name: str
    subtitle: str = ""
    industry: str = "服装设计"
    accent: str = "#5B6BFF"


class ClientOut(ClientCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: str
    active_project_id: str | None = None
    project_count: int = 0


class ProjectCreate(BaseModel):
    name: str
    brief: str = ""
    status: Literal["active", "archived"] = "active"


class ProjectOut(ProjectCreate):
    id: str
    client_id: str
    created_at: str
    updated_at: str
    current_revision: int = 0


class MaterialOut(BaseModel):
    id: str
    name: str
    category: str
    color: str
    texture_url: str
    source: str
    license: str
    verified: bool = True
    tags: list[str] = Field(default_factory=list)


class ReferenceOut(BaseModel):
    id: str
    title: str
    source_url: str
    thumbnail_url: str
    license_status: str = "待确认"
    purpose: str = "参考"


class ReferenceImportRequest(BaseModel):
    id: str | None = None
    title: str
    source_url: str
    thumbnail_url: str = ""
    license_status: str = "待确认"
    purpose: str = "参考"


class WorkflowNode(BaseModel):
    id: str
    type: str
    label: str
    status: Literal["ready", "queued", "running", "completed", "stale", "failed"] = "ready"
    depends_on: list[str] = Field(default_factory=list)
    editable_fields: list[str] = Field(default_factory=list)
    prompt: str = ""
    parameters: dict[str, Any] = Field(default_factory=dict)
    references: list[str] = Field(default_factory=list)
    material_ids: list[str] = Field(default_factory=list)
    output_artifact_id: str | None = None


class WorkflowOut(BaseModel):
    id: str
    project_id: str
    name: str
    source_repo: str
    source_license: str
    revision: int
    nodes: list[WorkflowNode]


class WorkflowRunRequest(BaseModel):
    node_id: str = "image_generate"
    mode: Literal["generate", "edit"] = "edit"
    prompt: str = ""
    references: list[str] = Field(default_factory=list)
    material_ids: list[str] = Field(default_factory=list)
    source_artifact_id: str | None = None
    edit_artifact_id: str | None = None
    idempotency_key: str | None = None
    attempt: int = Field(default=1, ge=1, le=5)
    parameters: dict[str, Any] = Field(default_factory=dict)


class WorkflowRunOut(BaseModel):
    id: str
    project_id: str
    node_id: str
    status: Literal["queued", "running", "completed", "failed"]
    revision: int
    artifact_id: str | None = None
    message: str = ""
    phase: str | None = None
    attempt: int = 1
    source_artifact_id: str | None = None
    error_code: str | None = None


class NodeRevisionRequest(BaseModel):
    prompt: str | None = None
    parameters: dict[str, Any] | None = None
    references: list[str] | None = None
    material_ids: list[str] | None = None


class ArtifactOut(BaseModel):
    id: str
    project_id: str
    node_id: str
    version: int
    status: str
    image_url: str
    prompt: str
    references: list[str] = Field(default_factory=list)
    materials: list[str] = Field(default_factory=list)
    created_at: str
    object_key: str | None = None
    parent_artifact_id: str | None = None


class SearchRequest(BaseModel):
    query: str
    kind: Literal["reference", "material", "all"] = "all"


class SearchOut(BaseModel):
    query: str
    provider: str
    results: list[ReferenceOut] = Field(default_factory=list)

