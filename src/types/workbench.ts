export type WorkbenchStage = 'capturing' | 'grounding' | 'concepting' | 'prototyping' | 'reviewing' | 'presenting' | 'archived'
export type WorkbenchIntent = 'DISCUSS' | 'GENERATE' | 'MODIFY' | 'CONFIRM' | 'EXPORT'
export type CultureKind = 'fact' | 'translation' | 'designer_judgment' | 'generated' | 'to_verify'
export type JobStatus = 'submitted' | 'processing' | 'completed' | 'failed' | 'stale'

export type ChangePatch = { changes: Record<string, unknown>; preserve: string[]; constraints: string[] }
export type ConversationTurn = { id: string; brief_patch?: Record<string, Record<string, unknown>>; correction_of?: string | null; text: string; intent: WorkbenchIntent; restatement: string; change_patch: ChangePatch; brief_revision: number; interpreter_mode: 'provider' | 'fallback'; created_at: string }
export type ConversationDisplayTurn = { id: string; role?: 'user' | 'assistant'; text: string; intent?: WorkbenchIntent; changePatch?: ChangePatch; pendingConfirmation?: boolean }
export type BriefRevision = { revision: number; confirmed: Record<string, unknown>; assumptions: Record<string, unknown>; conflicts: Array<Record<string, unknown>>; missing: string[]; source_turn_id: string | null; created_at: string }
export type CulturalReference = { id: string; kind_label?: string; kind: CultureKind; title: string; statement: string; source_title: string; source_url: string; note: string; verified: boolean }
export type ConsistencyStatus = 'pending' | 'passed' | 'failed' | 'not_applicable'
export type Artifact = { id: string; version_id?: string; version_label?: string; source_asset_ids?: string[]; role?: string; material_status?: string; kind: string; url?: string; path?: string; media_type?: string; disclaimer?: string; input_mode?: 'image' | 'text' | null; reference_artifact_ids?: string[]; consistency_status?: ConsistencyStatus | null; view_label?: 'front' | 'left' | 'right' | 'back' | 'top' | 'unknown' }
export type DesignVersion = { id: string; direction_id?: string | null; label: string; parent_version_id: string | null; brief_revision: number; source_turn_id: string | null; change_source_turn_id?: string | null; changed_fields: Record<string, unknown>; preserved_fields: string[]; constraints: string[]; artifacts: Artifact[]; status: 'draft' | 'reviewing' | 'selected' | 'archived' | 'discarded'; created_at: string }
export type GenerationJob = { id: string; direction_id?: string | null; changes?: Record<string, unknown>; preserve?: string[]; brief_revision?: number; source_turn_id?: string | null; base_version_id?: string | null; attempt?: number; retry_of?: string | null; created_at?: string; kind: 'image' | 'rodin'; status: JobStatus; version_id: string | null; artifact_id: string | null; message: string; prompt: string; updated_at: string; change_source_turn_id?: string | null; input_mode?: 'image' | 'text' | null; reference_artifact_ids?: string[]; reference_snapshot?: Array<{ artifact_id: string; path: string; media_type: string; view_label: string }>; consistency_status?: ConsistencyStatus | null }
// Optional v2 additions allow the existing 1.0 workspace/test fixtures to remain readable.
export type Workspace = {
  project: ProjectState
  active_direction_id?: string | null; directions?: DesignDirection[]; assets?: AssetRecord[]; reviews?: ReviewRecord[]; proposals?: Record<string, unknown>[]; proposal_asset_ids?: string[]
  brief_revisions: BriefRevision[]; culture: CulturalReference[]; turns: ConversationTurn[]; versions: DesignVersion[]; jobs: GenerationJob[]
  stage_gates: Array<{ stage: WorkbenchStage; status: StageStatus; reason: string; updated_at: string }>
}
export type WorkbenchUiState = 'listening' | 'transcribing' | 'interpreting' | 'generating_2d' | 'generating_3d' | 'ready' | 'failed'
export type Proposal = {
  project: { id: string; name: string; product_type: string }
  brief: Record<string, unknown>
  audience?: ProposalAudience
  culture: ProposalCulture[]
  version: Pick<DesignVersion, 'id' | 'label' | 'changed_fields' | 'preserved_fields' | 'constraints' | 'artifacts'>
  disclaimer: string
}


export type AppView = 'projects' | 'workbench' | 'works' | 'assets' | 'reviews' | 'proposal'
export type StageStatus = 'active' | 'awaiting_confirmation' | 'blocked' | 'done'
export type ProjectState = {
  id: string; name: string; product_type: string; stage: WorkbenchStage; stage_status: StageStatus
  active_direction_id: string | null; owner: string; collaborators: string[]; target_user: string; use_scene: string
  brief_revision: number; candidate_version_id: string | null; created_at: string; updated_at: string
}
export type ProjectSummary = ProjectState & {
  latest_version_id: string | null; latest_version_label: string | null
  image_count: number; model_count: number; pending_count: number
}
export type ProjectCreate = { name: string; product_type?: string; owner?: string; collaborators?: string[]; target_user?: string; use_scene?: string }
export type DesignDirection = { id: string; name: string; concept: string; status: 'draft' | 'reviewing' | 'selected' | 'archived'; culture_ids: string[]; material_ids: string[]; created_at: string; updated_at: string }
export type DirectionCreate = { name: string; concept?: string; culture_ids?: string[]; material_ids?: string[] }
export type AssetStatus = 'draft' | 'reviewing' | 'selected' | 'published' | 'archived' | 'processing' | 'completed' | 'failed' | 'stale'
export type AssetRecord = {
  asset_id: string; asset_type: string; project_id: string; direction_id: string | null; version_id: string | null
  title: string; status: AssetStatus; source_asset_ids: string[]; source_turn_id: string | null; source_culture_ids: string[]
  tags: string[]; created_at: string; updated_at: string; owner: string; rights_note: string; url: string; media_type: string
  material_status: string | null; role: string | null
}
export type AssetPatch = Partial<Pick<AssetRecord, 'title' | 'status' | 'tags' | 'owner' | 'rights_note'>>
export type AssetFilters = { type?: string; status?: AssetStatus; direction_id?: string; tag?: string; query?: string }
export type AssetRelations = { asset: AssetRecord; version: DesignVersion | null; parent_version: DesignVersion | null; input_assets: AssetRecord[]; downstream_models: AssetRecord[] }
export type ReviewStatus = 'pending' | 'passed' | 'needs_changes' | 'alternative' | 'rejected'
export type ReviewCreate = { version_id: string; asset_id?: string | null; direction_id?: string | null; region?: string; comment: string }
export type ReviewRecord = { id: string; project_id: string; version_id: string; asset_id: string | null; direction_id: string | null; region: string; comment: string; status: ReviewStatus; created_at: string; updated_at: string }
export type StageGateAction = 'generate_image' | 'modify_image' | 'lock_candidate' | 'generate_rodin' | 'internal_review' | 'internal_proposal' | 'customer_proposal'
export type StageGateContext = { version_id?: string | null; confirmed?: boolean; input_mode?: 'image' | 'text'; changes?: Record<string, unknown>; preserve?: string[] }
export type StageGateResult = { stage: StageGateAction; allowed: boolean; missing: string[]; reason: string; action: string }
export type ProposalAudience = 'internal' | 'customer'
export type ProposalCulture = Omit<CulturalReference, 'note'> & { note?: string; original_kind?: CultureKind; warning?: string }
export type AssetManifest = {
  project_id: string; audience: ProposalAudience; candidate_version_id: string
  assets: Array<Pick<AssetRecord, 'asset_id' | 'asset_type' | 'project_id' | 'direction_id' | 'version_id' | 'title' | 'status' | 'source_asset_ids' | 'source_culture_ids' | 'url' | 'media_type' | 'material_status' | 'role'> & { version_label: string }>
  brief: BriefRevision; culture_sources: ProposalCulture[]
  version_history: Array<Omit<DesignVersion, 'artifacts' | 'source_turn_id' | 'change_source_turn_id' | 'direction_id'>>
}

export type AssetLibraryProps = {
  projectId: string; projectName: string; versions: DesignVersion[]; directions: DesignDirection[]
  culture: CulturalReference[]; jobs: GenerationJob[]; initialView?: 'works' | 'assets'
  onAssetsChanged?: () => void
}
