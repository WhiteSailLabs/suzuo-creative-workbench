import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { AppShell } from './components/AppShell'
import { ProjectDashboard } from './components/ProjectDashboard'
import { ConversationPanel } from './components/ConversationPanel'
import { DesignCanvas } from './components/DesignCanvas'
import { DesignTruthPanel } from './components/DesignTruthPanel'
import { ProposalView } from './components/ProposalView'
import { DirectionSwitcher } from './components/DirectionSwitcher'
import { TaskCenter, isRunning } from './components/TaskCenter'
import { StageRail } from './components/StageRail'
import { useSpeechInput } from './hooks/useSpeechInput'
import { DEFAULT_PROJECT_ID, activateDirection, createImageJob, createRodinJob, listProjects, createTurn, getJob, getProposal, getWorkspace, retryJob, selectCandidate } from './lib/api'
import type { AppView, ChangePatch, ProjectSummary, ConversationDisplayTurn, GenerationJob, Proposal, Workspace, WorkbenchUiState } from './types/workbench'

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
  const [directionId, setDirectionId] = useState<string | null>(null)
  const activeDirectionId = useRef<string | null>(null)
  const [activatingDirection, setActivatingDirection] = useState(false)
  const directionActivationPending = useRef(false)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [pendingGeneration, setPendingGeneration] = useState<{ sourceTurnId: string; baseVersionId?: string; patch: ChangePatch; text: string } | null>(null)
  const [draft, setDraft] = useState({ text: '', revision: 0 })
  const [generationNotice, setGenerationNotice] = useState('')
  const submittingJobs = useRef(new Set<GenerationJob['kind']>())
  const speech = useSpeechInput()

  const load = useCallback(async () => {
    setOffline(false)
    try {
      const loaded = await getWorkspace(projectId)
      if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return
      setWorkspace(loaded)
      setDirectionId(current => { const next = current && loaded.directions?.some(d => d.id === current) ? current : loaded.active_direction_id ?? loaded.project.active_direction_id ?? null; activeDirectionId.current = next; return next })
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
      setWorkspace(null); directionActivationPending.current = false; setActivatingDirection(false); activeDirectionId.current = null; setDirectionId(null); setSelectedVersionId(null); setLocalTurns([]); setProposal(null)
      setPendingGeneration(null); setGenerationNotice(''); setDraft({ text: '', revision: Date.now() }); submittingJobs.current.clear(); setStatus('ready'); setOffline(false); speech.reset(); setProjectId(id)
    }
    setView('workbench')
  }

  async function switchDirection(id: string) {
    if (directionActivationPending.current) return
    directionActivationPending.current = true
    setActivatingDirection(true)
    activeDirectionId.current = id
    setDirectionId(id); setSelectedVersionId(null)
    setPendingGeneration(null); setGenerationNotice('')
    try {
      const loaded = await activateDirection(projectId, id)
      if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return
      if (loaded.active_direction_id !== id || loaded.project.active_direction_id !== id) {
        throw new Error('服务器尚未确认当前方向，请重新切换')
      }
      setWorkspace(loaded)
      void refreshProjects()
    } catch (error) {
      if (activeProjectId.current === projectId && projectContext.current === contextVersion) {
        setGenerationNotice(error instanceof Error ? error.message : '切换方向失败，请重试')
      }
    } finally {
      if (activeProjectId.current === projectId && projectContext.current === contextVersion) {
        directionActivationPending.current = false
        setActivatingDirection(false)
      }
    }
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

  function canGenerate(kind: GenerationJob['kind']) {
    if (directionActivationPending.current) { setGenerationNotice('正在切换方向，请等待成功激活后再生成'); return false }
    if (submittingJobs.current.has(kind) || workspace?.jobs.some(job => job.kind === kind && isRunning(job))) {
      setGenerationNotice('当前项目已有同类生成任务正在进行'); return false
    }
    if (workspace?.directions?.length && (directionId !== workspace.active_direction_id || directionId !== workspace.project.active_direction_id)) {
      setGenerationNotice('请先成功激活当前方向后再生成'); return false
    }
    return true
  }

  async function runImageGeneration(sourceTurnId?: string, baseVersionId?: string, patch?: ChangePatch) {
    if (!canGenerate('image')) return
    submittingJobs.current.add('image')
    setStatus('generating_2d')
    try { await followJob(await createImageJob(sourceTurnId, baseVersionId, projectId, patch && (Object.keys(patch.changes).length || patch.preserve.length) ? { changes: patch.changes, preserve: patch.preserve } : undefined)) }
    catch (error) { if (activeProjectId.current === projectId && projectContext.current === contextVersion) { setStatus('failed'); setGenerationNotice(error instanceof Error ? error.message : '生成失败，请重试') } }
    finally { if (activeProjectId.current === projectId && projectContext.current === contextVersion) submittingJobs.current.delete('image') }
  }

  async function runRodinGeneration(versionId: string) {
    if (!canGenerate('rodin')) return
    submittingJobs.current.add('rodin')
    setStatus('generating_3d')
    try { await followJob(await createRodinJob(versionId, projectId)) }
    catch (error) { if (activeProjectId.current === projectId && projectContext.current === contextVersion) { setStatus('failed'); setGenerationNotice(error instanceof Error ? error.message : '生成失败，请重试') } }
    finally { if (activeProjectId.current === projectId && projectContext.current === contextVersion) submittingJobs.current.delete('rodin') }
  }

  const submitTurn = async (text: string) => {
    const submittedDirectionId = activeDirectionId.current
    const localUserId = `local_${Date.now()}`
    const baseVersionId = displayedVersionId ?? undefined
    setPendingGeneration(null); setGenerationNotice('')
    setLocalTurns((current) => [...current, { id: localUserId, role: 'user', text }])
    setStatus('interpreting')
    try {
      const interpreted = await createTurn(text, projectId)
      if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return
      setLocalTurns((current) => current.filter((turn) => turn.id !== localUserId))
      await load()
      if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return
      setStatus('ready'); speech.reset()
      if (interpreted.intent === 'GENERATE') {
        if (activeDirectionId.current !== submittedDirectionId) { setGenerationNotice('方向已切换，请在当前方向重新确认生成'); return }
        if (!canGenerate('image')) return
        const lastGeneration = workspace?.turns.findLastIndex(turn => turn.intent === 'GENERATE') ?? -1
        const previousPatch = workspace?.turns.findLast((turn, index) => turn.intent === 'MODIFY' && index > lastGeneration)?.change_patch
        const patch = interpreted.change_patch && (Object.keys(interpreted.change_patch.changes).length || interpreted.change_patch.preserve.length || interpreted.change_patch.constraints.length) ? interpreted.change_patch : previousPatch ?? { changes: {}, preserve: [], constraints: [] }
        if (/^(确认修改并生成新版|确认并生成|确认生成新版)[。！!\s]*$/.test(text.trim())) void runImageGeneration(interpreted.id, baseVersionId, patch)
        else setPendingGeneration({ sourceTurnId: interpreted.id, baseVersionId, patch, text })
      }
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
    const original = workspace?.jobs.find(job => job.id === jobId)
    if (!original || !canGenerate(original.kind)) return
    submittingJobs.current.add(original.kind)
    try {
      const job = await retryJob(jobId, projectId)
      if (activeProjectId.current !== projectId || projectContext.current !== contextVersion) return
      setStatus(job.kind === 'image' ? 'generating_2d' : 'generating_3d')
      await followJob(job)
    } catch (error) { if (activeProjectId.current === projectId && projectContext.current === contextVersion) { setStatus('failed'); setGenerationNotice(error instanceof Error ? error.message : '重试失败，请稍后再试') } }
    finally { if (activeProjectId.current === projectId && projectContext.current === contextVersion) submittingJobs.current.delete(original.kind) }
  }

  const visibleVersions = (workspace?.versions ?? []).filter(version => !workspace?.directions?.length || version.direction_id === directionId)
  const displayedVersionId = visibleVersions.some(v => v.id === selectedVersionId) ? selectedVersionId : visibleVersions.find(v => v.id === workspace?.project.candidate_version_id)?.id ?? visibleVersions.at(-1)?.id ?? null
  const latestBrief = workspace?.brief_revisions.at(-1)

  const navigate = (next: AppView) => {
    setView(next)
    if (next === 'projects') void refreshProjects()
    if (next === 'proposal' && workspace?.project.candidate_version_id) void showProposal()
  }
  const placeholderTitles: Partial<Record<AppView, string>> = { works: '作品', assets: '资产', reviews: '版本评审', proposal: '提案' }

  return <AppShell view={view} onNavigate={navigate} projects={projects} projectId={projectId} project={workspace?.project} onSelectProject={openProject} offline={offline}>
    {offline && <div className="offline-banner" role="alert"><div><strong>暂时无法连接本地服务</strong><span>检查 FastAPI 是否在 8000 端口运行。你仍可查看页面，连接恢复后继续。</span></div><button onClick={() => void load()}><RefreshCw size={15} />重新连接</button></div>}
    {view === 'projects' ? <>{projectsError && <div className="offline-banner" role="alert">项目列表加载失败<button onClick={() => void refreshProjects()}>重新加载项目</button></div>}<ProjectDashboard projects={projects} onOpenProject={openProject} /></> : view === 'workbench' && workspace ? <main className="workbench-layout" style={{ gridTemplateColumns: `${leftCollapsed ? '44px' : 'minmax(260px,340px)'} minmax(420px,1fr) ${rightCollapsed ? '44px' : 'minmax(250px,310px)'}` }}>
      <StageRail current={workspace?.project.stage ?? 'capturing'} />
      <div style={{ gridColumn: 1, gridRow: 2, minHeight: 0, display: 'flex', flexDirection: 'column' }}><button aria-expanded={!leftCollapsed} onClick={() => setLeftCollapsed(!leftCollapsed)}>{leftCollapsed ? '展开对话' : '收起对话'}</button><div hidden={leftCollapsed} style={{ minHeight: 0, flex: 1 }}><ConversationPanel turns={turns} speechSupported={speech.supported} speechState={speech.state} speechTranscript={speech.transcript} busy={status === 'interpreting'} onStartSpeech={speech.start} onStopSpeech={speech.stop} draft={draft} pendingGeneration={pendingGeneration?.patch} generationNotice={generationNotice} generationBlocked={activatingDirection ? '正在切换方向，请等待成功激活后再生成' : workspace.jobs.some(job => job.kind === 'image' && isRunning(job)) ? '当前项目已有同类生成任务正在进行' : workspace.directions?.length && (directionId !== workspace.active_direction_id || directionId !== workspace.project.active_direction_id) ? '请先成功激活当前方向后再生成' : undefined} onCancelGeneration={() => { if (pendingGeneration) setDraft({ text: pendingGeneration.text, revision: Date.now() }); setPendingGeneration(null) }} onConfirmGeneration={() => { if (!pendingGeneration || !canGenerate('image')) return; const pending = pendingGeneration; setPendingGeneration(null); void runImageGeneration(pending.sourceTurnId, pending.baseVersionId, pending.patch) }} onSubmit={submitTurn} /></div></div>
      <DesignCanvas assets={workspace.assets} direction={workspace.directions?.find(direction => direction.id === directionId)} culture={workspace.culture} proposals={workspace.proposals} versions={visibleVersions} jobs={workspace?.jobs ?? []} selectedVersionId={displayedVersionId} candidateVersionId={workspace?.project.candidate_version_id ?? null} onSelectVersion={setSelectedVersionId} onLockCandidate={lockCandidate} onGenerate3d={(id) => void runRodinGeneration(id)} onRetryJob={(id) => void retryGeneration(id)} />
      <aside style={{ gridColumn: 3, gridRow: 2, minHeight: 0, overflowY: 'auto' }}><button aria-expanded={!rightCollapsed} onClick={() => setRightCollapsed(!rightCollapsed)}>{rightCollapsed ? '展开设计状态' : '收起设计状态'}</button><TaskCenter jobs={workspace.jobs} onRetry={id => void retryGeneration(id)} /><div hidden={rightCollapsed}><DirectionSwitcher directions={workspace.directions ?? []} selectedId={directionId} busy={activatingDirection} onSelect={id => void switchDirection(id)} /><DesignTruthPanel brief={latestBrief} culture={workspace?.culture ?? []} /></div></aside>
    </main> : <main className="app-page"><section className="page-placeholder panel-card"><h1>{view === 'workbench' ? '工作台' : placeholderTitles[view]}</h1><p>{view === 'workbench' ? offline ? '当前项目暂时无法加载，请重新连接。' : '正在加载当前项目…' : '此页面将在后续步骤开放。可返回工作台继续设计。'}</p>{view !== 'workbench' && <button onClick={() => setView('workbench')}>返回工作台</button>}</section></main>}
    {proposal && <ProposalView proposal={proposal} onClose={() => setProposal(null)} />}
  </AppShell>
}
export default App
