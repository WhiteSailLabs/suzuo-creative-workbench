from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, computed_field, model_validator

from .cultural_workbench import CULTURE_KIND_LABELS


WorkbenchStage = Literal[
    "capturing", "grounding", "concepting", "prototyping",
    "reviewing", "presenting", "archived",
]
StageStatus = Literal["active", "awaiting_confirmation", "blocked", "done"]
CultureKind = Literal["fact", "translation", "designer_judgment", "generated", "to_verify"]
JobStatus = Literal["submitted", "processing", "completed", "failed", "stale"]


class ProjectState(BaseModel):
    id: str
    name: str
    product_type: str
    stage: WorkbenchStage
    stage_status: StageStatus
    active_direction_id: Optional[str] = None
    owner: str = ""
    collaborators: list[str] = Field(default_factory=list)
    target_user: str = ""
    use_scene: str = ""
    brief_revision: int = 0
    candidate_version_id: Optional[str] = None
    created_at: str
    updated_at: str


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    product_type: str = ""
    owner: str = ""
    collaborators: list[str] = Field(default_factory=list)
    target_user: str = ""
    use_scene: str = ""


class DirectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    concept: str = ""
    culture_ids: list[str] = Field(default_factory=list)
    material_ids: list[str] = Field(default_factory=list)


AssetStatus = Literal["draft", "reviewing", "selected", "published", "archived",
                      "processing", "completed", "failed", "stale"]


class AssetRecord(BaseModel):
    asset_id: str
    asset_type: str
    project_id: str
    direction_id: Optional[str] = None
    version_id: Optional[str] = None
    title: str
    status: AssetStatus
    source_asset_ids: list[str] = Field(default_factory=list)
    source_turn_id: Optional[str] = None
    source_culture_ids: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    created_at: str
    updated_at: str
    owner: str = ""
    rights_note: str = ""
    url: str = ""
    media_type: str = ""
    material_status: Optional[str] = None
    role: Optional[str] = None


class AssetPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    status: Optional[AssetStatus] = None
    tags: Optional[list[str]] = None
    owner: Optional[str] = None
    rights_note: Optional[str] = None


class DesignDirection(BaseModel):
    id: str
    name: str
    concept: str = ""
    status: Literal["draft", "reviewing", "selected", "archived"] = "draft"
    culture_ids: list[str] = Field(default_factory=list)
    material_ids: list[str] = Field(default_factory=list)
    created_at: str
    updated_at: str


class BriefRevision(BaseModel):
    revision: int
    confirmed: dict[str, Any] = Field(default_factory=dict)
    assumptions: dict[str, Any] = Field(default_factory=dict)
    conflicts: list[dict[str, Any]] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    source_turn_id: Optional[str] = None
    created_at: str


class CulturalReference(BaseModel):
    id: str
    kind: CultureKind
    title: str
    statement: str
    source_title: str = ""
    source_url: str = ""
    note: str = ""
    verified: bool = False

    @computed_field
    @property
    def kind_label(self) -> str:
        return CULTURE_KIND_LABELS[self.kind]


class CulturalReferenceCreate(BaseModel):
    kind: CultureKind
    title: str = Field(min_length=1, max_length=200)
    statement: str = Field(min_length=1, max_length=2000)
    source_title: str = ""
    source_url: str = ""
    note: str = ""
    verified: bool = False

    @model_validator(mode="after")
    def fact_has_source(self):
        if self.kind == "fact" and not self.source_title.strip():
            raise ValueError("文化事实必须提供来源标题")
        return self


class CulturalReferencePatch(BaseModel):
    kind: Optional[CultureKind] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    statement: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    source_title: Optional[str] = None
    source_url: Optional[str] = None
    note: Optional[str] = None
    verified: Optional[bool] = None


class DesignVersion(BaseModel):
    id: str
    direction_id: Optional[str] = None
    label: str
    parent_version_id: Optional[str] = None
    brief_revision: int
    source_turn_id: Optional[str] = None
    change_source_turn_id: Optional[str] = None
    changed_fields: dict[str, Any] = Field(default_factory=dict)
    preserved_fields: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    artifacts: list[dict[str, Any]] = Field(default_factory=list)
    status: Literal["draft", "reviewing", "selected", "archived", "discarded"] = "draft"
    created_at: str


class GenerationJob(BaseModel):
    design_resources: list[dict[str, Any]] = Field(default_factory=list)
    changes: dict[str, Any] = Field(default_factory=dict)
    preserve: list[str] = Field(default_factory=list)
    id: str
    direction_id: Optional[str] = None
    kind: Literal["image", "rodin"]
    status: JobStatus
    version_id: Optional[str] = None
    artifact_id: Optional[str] = None
    message: str = ""
    prompt: str = ""
    brief_revision: int = 0
    source_turn_id: Optional[str] = None
    change_source_turn_id: Optional[str] = None
    base_version_id: Optional[str] = None
    attempt: int = 1
    retry_of: Optional[str] = None
    input_mode: Optional[Literal["image", "text"]] = None
    reference_artifact_ids: list[str] = Field(default_factory=list)
    reference_snapshot: list[dict[str, Any]] = Field(default_factory=list)
    consistency_status: Optional[
        Literal["pending", "passed", "failed", "not_applicable"]
    ] = None
    created_at: str
    updated_at: str


class StageGateContext(BaseModel):
    version_id: Optional[str] = None
    confirmed: bool = False
    input_mode: Literal["image", "text"] = "image"
    changes: dict[str, Any] = Field(default_factory=dict)
    preserve: list[str] = Field(default_factory=list)


class ImageJobCreate(BaseModel):
    resource_ids: list[str] = Field(default_factory=list, max_length=12)
    changes: dict[str, Any] = Field(default_factory=dict)
    preserve: list[str] = Field(default_factory=list)
    source_turn_id: Optional[str] = None
    base_version_id: Optional[str] = None
    prompt: str = ""


class ImageImportCreate(BaseModel):
    data_url: str = Field(min_length=24, max_length=20_000_000)
    source_turn_id: Optional[str] = None
    base_version_id: Optional[str] = None


class RodinJobCreate(BaseModel):
    version_id: str
    prompt: str = ""
    input_mode: Literal["image", "text"] = "image"


class StageGate(BaseModel):
    stage: WorkbenchStage
    status: StageStatus
    reason: str = ""
    updated_at: str


class WorkspaceOut(BaseModel):
    project: ProjectState
    active_direction_id: Optional[str] = None
    directions: list[DesignDirection] = Field(default_factory=list)
    assets: list[dict[str, Any]] = Field(default_factory=list)
    reviews: list[dict[str, Any]] = Field(default_factory=list)
    proposals: list[dict[str, Any]] = Field(default_factory=list)
    proposal_asset_ids: list[str] = Field(default_factory=list)
    proposal_selection_explicit: bool = False
    brief_revisions: list[BriefRevision] = Field(default_factory=list)
    culture: list[CulturalReference] = Field(default_factory=list)
    turns: list[dict[str, Any]] = Field(default_factory=list)
    versions: list[DesignVersion] = Field(default_factory=list)
    jobs: list[GenerationJob] = Field(default_factory=list)
    stage_gates: list[StageGate] = Field(default_factory=list)


class ProposalAssetSelection(BaseModel):
    proposal_asset_ids: list[str] = Field(default_factory=list)


class ChangePatch(BaseModel):
    changes: dict[str, Any] = Field(default_factory=dict)
    preserve: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)


class ConversationTurnCreate(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    corrected_turn_id: Optional[str] = None


class InterpretedTurn(BaseModel):
    id: str
    text: str
    intent: Literal["DISCUSS", "GENERATE", "MODIFY", "CONFIRM", "EXPORT"]
    restatement: str
    change_patch: ChangePatch = Field(default_factory=ChangePatch)
    brief_patch: dict[str, dict[str, Any]] = Field(default_factory=dict)
    brief_revision: int
    interpreter_mode: Literal["provider", "fallback"] = "fallback"
    correction_of: Optional[str] = None
    created_at: str


ReviewStatus = Literal["pending", "passed", "needs_changes", "alternative", "rejected"]


class ReviewCreate(BaseModel):
    version_id: str
    asset_id: Optional[str] = None
    direction_id: Optional[str] = None
    region: str = "整体"
    comment: str = Field(min_length=1, max_length=5000)


class ReviewResolve(BaseModel):
    status: Literal["passed", "needs_changes", "alternative", "rejected"]
    comment: Optional[str] = Field(default=None, min_length=1, max_length=5000)


class ReviewRecord(ReviewCreate):
    id: str
    project_id: str
    status: ReviewStatus
    created_at: str
    updated_at: str
