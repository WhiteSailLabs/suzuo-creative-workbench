import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { AppShell } from './components/AppShell'
import { ProjectDashboard } from './components/ProjectDashboard'
import { ConversationPanel } from './components/ConversationPanel'
import { DesignCanvas } from './components/DesignCanvas'
import { DesignTruthPanel } from './components/DesignTruthPanel'
import { ProposalView } from './components/ProposalView'
import { StageRail } from './components/StageRail'
import { useSpeechInput } from './hooks/useSpeechInput'
import { DEFAULT_PROJECT_ID, createImageJob, createRodinJob, listProjects, createTurn, getJob, getProposal, getWorkspace, retryJob, selectCandidate } from './lib/api'
import type { AppView, ProjectSummary, ConversationDisplayTurn, GenerationJob, Proposal, Workspace, WorkbenchUiState } from './types/workbench'

const terminalStatuses = new Set(['completed', 'failed', 'stale'])
const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

function App() {
  const [view, setView] = useState<AppView>('projects')
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID)
  const activeProjectId = useRef(projectId)
  const projectContext = useRef(0)
  const contextVersion = projectContext.current
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectsError, setProjectsError] = useState(false)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [status, setStatus] = useState<WorkbenchUiState>('ready')
  const [offline, setOffline] = useState(false)
  const [localTurns, setLocalTurns] = useState<ConversationDisplayTurn[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const speech = useSpeechInput()

  const load = useCallback(async () => {
    setOffline(false)
    try {
      const loaded = await getWorkspace(projectId)
      if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return
      setWorkspace(loaded)
      setSelectedVersionId((current) => current && loaded.versions.some((version) => version.id === current) ? current : loaded.project.candidate_version_id ?? loaded.versions.at(-1)?.id ?? null)
      setStatus('ready')
    }
    catch { if (activeProjectId.current === projectId && projectContext.current === contextVersion) { setOffline(true); setStatus('failed') } }
  }, [projectId, contextVersion])
  useEffect(() => { void load() }, [load])

  const refreshProjects = useCallback(async () => {
    try { const cards = await listProjects(); setProjects(Array.isArray(cards) ? cards : []); setProjectsError(false) }
    catch { setProjectsError(true) }
  }, [])
  useEffect(() => { void refreshProjects() }, [refreshProjects])

  function openProject(id: string) {
    if (id !== projectId) {
      projectContext.current += 1
      activeProjectId.current = id
      setWorkspace(null); setSelectedVersionId(null); setLocalTurns([]); setProposal(null)
      setStatus('ready'); setOffline(false); speech.reset(); setProjectId(id)
    }
    setView('workbench')
  }

  const turns = useMemo<ConversationDisplayTurn[]>(() => {
    const storedTurns = workspace?.turns ?? []
    const lastGenerateIndex = storedTurns.findLastIndex((turn) => turn.intent === 'GENERATE')
    const pendingModification = storedTurns.findLast((turn, index) => turn.intent === 'MODIFY' && index > lastGenerateIndex)
    const stored = storedTurns.flatMap((turn) => [
      { id: `${turn.id}_user`, role: 'user' as const, text: turn.text },
      { id: `${turn.id}_assistant`, role: 'assistant' as const, text: turn.restatement, intent: turn.intent, changePatch: turn.change_patch, pendingConfirmation: turn.id === pendingModification?.id },
    ])
    return [...stored, ...localTurns]
  }, [workspace, localTurns])

  async function followJob(job: GenerationJob) {
    if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return job
    let current = job
    setWorkspace((value) => value ? { ...value, jobs: [...value.jobs.filter((item) => item.id !== job.id), job] } : value)
    while (!terminalStatuses.has(current.status)) {
      await wait(1200)
      if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return current
      current = await getJob(job.id, projectId)
      if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return current
      setWorkspace((value) => value ? { ...value, jobs: [...value.jobs.filter((item) => item.id !== current.id), current] } : value)
    }
    if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return current
    await load()
    void refreshProjects()
    if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return current
    if (current.status === 'completed' && current.kind === 'image' && current.version_id) {
      setSelectedVersionId(current.version_id)
    }
    if (current.status === 'failed') setStatus('failed')
    return current
  }

  async function runImageGeneration(sourceTurnId?: string, baseVersionId?: string) {
    setStatus('generating_2d')
    try { await followJob(await createImageJob(sourceTurnId, baseVersionId, projectId)) }
    catch { if (activeProjectId.current === projectId && projectContext.current === contextVersion) setStatus('failed') }
  }

  async function runRodinGeneration(versionId: string) {
    setStatus('generating_3d')
    try { await followJob(await createRodinJob(versionId, projectId)) }
    catch { if (activeProjectId.current === projectId && projectContext.current === contextVersion) setStatus('failed') }
  }

  const submitTurn = async (text: string) => {
    const localUserId = `local_${Date.now()}`
    const baseVersionId = selectedVersionId ?? workspace?.project.candidate_version_id ?? undefined
    setLocalTurns((current) => [...current, { id: localUserId, role: 'user', text }])
    setStatus('interpreting')
    try {
      const interpreted = await createTurn(text, projectId)
      if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return
      setLocalTurns((current) => current.filter((turn) => turn.id !== localUserId))
      await load()
      if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return
      setStatus('ready'); speech.reset()
      if (interpreted.intent === 'GENERATE') void runImageGeneration(interpreted.id, baseVersionId)
    } catch {
      if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return
      setStatus('failed')
      setLocalTurns((current) => [...current, { id: `${localUserId}_error`, role: 'assistant', text: '这次没有连接上本地服务。你的文字还在，可以重新发送。' }])
    }
  }

  const lockCandidate = async (versionId: string) => {
    try {
      await selectCandidate(versionId, projectId)
      if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return
      await load(); void refreshProjects()
    } catch { if (activeProjectId.current === projectId && projectContext.current === contextVersion) setStatus('failed') }
  }

  const showProposal = async () => {
    try { const loaded = await getProposal(projectId); if (activeProjectId.current === projectId && projectContext.current === contextVersion) setProposal(loaded) }
    catch { if (activeProjectId.current === projectId && projectContext.current === contextVersion) setStatus('failed') }
  }

  const retryGeneration = async (jobId: string) => {
    try {
      const job = await retryJob(jobId, projectId)
      if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return
      setStatus(job.kind === 'image' ? 'generating_2d' : 'generating_3d')
      await followJob(job)
    } catch { if (activeProjectId.current === projectId && projectContext.current === contextVersion) setStatus('failed') }
  }

  const latestBrief = workspace?.brief_revisions.at(-1)

  const navigate = (next: AppView) => {
    setView(next)
    if (next === 'projects') void refreshProjects()
    if (next === 'proposal' && workspace?.project.candidate_version_id) void showProposal()
  }
  const placeholderTitles: Partial<Record<AppView, string>> = { works: '作品', assets: '资产', reviews: '版本评审', proposal: '提案' }

  return <AppShell view={view} onNavigate={navigate} projects={projects} projectId={projectId} project={workspace?.project} onSelectProject={openProject} offline={offline}>
    {offline && <div className="offline-banner" role="alert"><div><strong>暂时无法连接本地服务</strong><span>检查 FastAPI 是否在 8000 端口运行。你仍可查看页面，连接恢复后继续。</span></div><button onClick={() => void load()}><RefreshCw size={15} />重新连接</button></div>}
    {view === 'projects' ? <>{projectsError && <div className="offline-banner" role="alert">项目列表加载失败<button onClick={() => void refreshProjects()}>重新加载项目</button></div>}<ProjectDashboard projects={projects} onOpenProject={openProject} /></> : view === 'workbench' && workspace ? <main className="workbench-layout">
      <StageRail current={workspace?.project.stage ?? 'capturing'} />
      <ConversationPanel turns={turns} speechSupported={speech.supported} speechState={speech.state} speechTranscript={speech.transcript} busy={status === 'interpreting'} onStartSpeech={speech.start} onStopSpeech={speech.stop} onSubmit={submitTurn} />
      <DesignCanvas versions={workspace?.versions ?? []} jobs={workspace?.jobs ?? []} selectedVersionId={selectedVersionId} candidateVersionId={workspace?.project.candidate_version_id ?? null} onSelectVersion={setSelectedVersionId} onLockCandidate={lockCandidate} onGenerate3d={(id) => void runRodinGeneration(id)} onRetryJob={(id) => void retryGeneration(id)} />
      <DesignTruthPanel brief={latestBrief} culture={workspace?.culture ?? []} />
    </main> : <main className="app-page"><section className="page-placeholder panel-card"><h1>{view === 'workbench' ? '工作台' : placeholderTitles[view]}</h1><p>{view === 'workbench' ? offline ? '当前项目暂时无法加载，请重新连接。' : '正在加载当前项目…' : '此页面将在后续步骤开放。可返回工作台继续设计。'}</p>{view !== 'workbench' && <button onClick={() => setView('workbench')}>返回工作台</button>}</section></main>}
    {proposal && <ProposalView proposal={proposal} onClose={() => setProposal(null)} />}
  </AppShell>
}
export default App
