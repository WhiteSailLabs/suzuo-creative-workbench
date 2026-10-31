import type { AssetFilters, AssetManifest, AssetPatch, AssetRecord, AssetRelations, ConversationTurn, DesignDirection, DesignVersion, DirectionCreate, GenerationJob, ProjectCreate, ProjectSummary, Proposal, ProposalAudience, ReviewCreate, ReviewRecord, ReviewStatus, StageGateAction, StageGateContext, StageGateResult, Workspace } from '../types/workbench'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
// Used by App only to load the legacy project on first launch.
export const DEFAULT_PROJECT_ID = 'prj_suzhou_incense'

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : (detail as { reason?: string })?.reason ?? `请求失败（${status}）`)
    this.status = status
    this.detail = detail
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!response.ok) {
    let detail: unknown
    try { detail = (await response.json()).detail } catch { /* Non-JSON error response. */ }
    throw new ApiError(response.status, detail)
  }
  return response.json() as Promise<T>
}
const projectPath = (projectId: string) => `/api/workbench/projects/${encodeURIComponent(projectId)}`
const post = (payload?: unknown): RequestInit => ({ method: 'POST', ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) })
export function listProjects() { return request<ProjectSummary[]>('/api/workbench/projects') }
export function createProject(payload: ProjectCreate) { return request<Workspace>('/api/workbench/projects', post(payload)) }
export function getWorkspace(projectId: string) { return request<Workspace>(projectPath(projectId)) }
export function createDirection(projectId: string, payload: DirectionCreate) { return request<DesignDirection>(`${projectPath(projectId)}/directions`, post(payload)) }
export function activateDirection(projectId: string, directionId: string) { return request<Workspace>(`${projectPath(projectId)}/directions/${encodeURIComponent(directionId)}/activate`, { method: 'PATCH' }) }
export function createTurn(text: string, projectId: string, correctedTurnId?: string) { return request<ConversationTurn>(`${projectPath(projectId)}/turns`, post({ text, corrected_turn_id: correctedTurnId })) }
export function assetUrl(artifactId: string) { return `${API_BASE_URL}/api/workbench/assets/${encodeURIComponent(artifactId)}` }
export function createImageJob(sourceTurnId: string | undefined, baseVersionId: string | undefined, projectId: string, context?: Pick<StageGateContext, 'changes' | 'preserve'>) { return request<GenerationJob>(`${projectPath(projectId)}/image-jobs`, post({ source_turn_id: sourceTurnId, base_version_id: baseVersionId, ...context })) }
export function createRodinJob(versionId: string, projectId: string, inputMode: 'image' | 'text' = 'image') { return request<GenerationJob>(`${projectPath(projectId)}/rodin-jobs`, post({ version_id: versionId, input_mode: inputMode })) }
export function getJob(jobId: string, projectId: string) { return request<GenerationJob>(`${projectPath(projectId)}/jobs/${encodeURIComponent(jobId)}`) }
export function retryJob(jobId: string, projectId: string) { return request<GenerationJob>(`${projectPath(projectId)}/jobs/${encodeURIComponent(jobId)}/retry`, post()) }
export function selectCandidate(versionId: string, projectId: string) { return request<DesignVersion>(`${projectPath(projectId)}/versions/${encodeURIComponent(versionId)}/candidate`, post()) }
export function getProposal(projectId: string, audience?: ProposalAudience) { return request<Proposal>(`${projectPath(projectId)}/proposal${audience ? `?audience=${audience}` : ''}`) }
export function listAssets(projectId: string, filters: AssetFilters = {}) { return request<AssetRecord[]>(`${projectPath(projectId)}/assets?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined) as [string, string][])}`) }
export function patchAsset(projectId: string, assetId: string, patch: AssetPatch) { return request<AssetRecord>(`${projectPath(projectId)}/assets/${encodeURIComponent(assetId)}`, { method: 'PATCH', body: JSON.stringify(patch) }) }
export function getAssetRelations(projectId: string, assetId: string) { return request<AssetRelations>(`${projectPath(projectId)}/assets/${encodeURIComponent(assetId)}/relations`) }
export function addProposalAsset(projectId: string, assetId: string) { return request<{ proposal_asset_ids: string[] }>(`${projectPath(projectId)}/proposal-assets/${encodeURIComponent(assetId)}`, post()) }
export function removeProposalAsset(projectId: string, assetId: string) { return request<{ proposal_asset_ids: string[] }>(`${projectPath(projectId)}/proposal-assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' }) }
export function createReview(projectId: string, payload: ReviewCreate) { return request<ReviewRecord>(`${projectPath(projectId)}/reviews`, post(payload)) }
export function resolveReview(projectId: string, reviewId: string, status: Exclude<ReviewStatus, 'pending'>, comment?: string) { return request<ReviewRecord>(`${projectPath(projectId)}/reviews/${encodeURIComponent(reviewId)}`, { method: 'PATCH', body: JSON.stringify({ status, comment }) }) }
export function checkStageGate(projectId: string, action: StageGateAction, context: StageGateContext = {}) { return request<StageGateResult>(`${projectPath(projectId)}/stage-gates/${action}`, post(context)) }
export function getManifest(projectId: string, audience: ProposalAudience = 'internal') { return request<AssetManifest>(`${projectPath(projectId)}/manifest?audience=${audience}`) }
// Asset URLs can be provider URLs or API-relative paths; keep the recorded file URL.
export function assetDownloadUrl(url: string) {
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`
  return /^(https?:|data:|blob:)/i.test(url) ? url : ''
}
