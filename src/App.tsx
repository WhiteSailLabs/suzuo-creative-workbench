import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  ExternalLink,
  FileImage,
  FolderOpen,
  Globe2,
  ImagePlus,
  Layers3,
  LayoutPanelLeft,
  Maximize2,
  Mic,
  MoreHorizontal,
  MousePointer2,
  Move,
  Play,
  Plus,
  Search,
  Settings2,
  Sparkles,
  SquarePen,
  Undo2,
  UploadCloud,
  UserRound,
  Wand2,
  Workflow,
  X,
  ZoomIn,
  ZoomOut,
  Zap,
} from 'lucide-react'
import './App.css'

type Material = {
  id: string
  name: string
  subtitle: string
  source: string
  license: string
  image: string
  tone: string
  tags: string[]
}

type Reference = {
  id: string
  name: string
  source: string
  image: string
  usage: string
  status: 'selected' | 'suggested' | 'saved'
}

type WorkflowNode = {
  id: string
  eyebrow: string
  title: string
  detail: string
  state: 'done' | 'working' | 'ready' | 'queued' | 'idle' | 'failed'
  duration?: string
  icon: typeof Sparkles
}

type Activity = {
  id: number
  kind: 'voice' | 'agent' | 'asset' | 'system'
  title: string
  body: string
  time: string
  live?: boolean
}

type GenerationStep = {
  id: string
  label: string
  detail: string
  state: 'done' | 'working' | 'queued' | 'idle'
}

const materials: Material[] = [
  { id: 'fabric-081c', name: 'Cotton Weave 081C', subtitle: '棉质织纹 · 柔和中性', source: 'ambientCG / GitHub 索引', license: 'CC0 1.0', image: '/assets/fabric081c-preview.png', tone: '#bdc9c8', tags: ['cotton', 'woven', 'soft'] },
  { id: 'fabric-085', name: 'Fine Woven 085', subtitle: '细密织物 · 西装质感', source: 'ambientCG / GitHub 索引', license: 'CC0 1.0', image: '/assets/fabric085-preview.png', tone: '#ede0c8', tags: ['woven', 'matte', 'suiting'] },
  { id: 'fabric-082a', name: 'Textured Cloth 082A', subtitle: '轻纹理面料 · 透气感', source: 'ambientCG / GitHub 索引', license: 'CC0 1.0', image: '/assets/fabric082a-preview.png', tone: '#6e7a7d', tags: ['woven', 'texture', 'light'] },
  { id: 'fabric-083', name: 'Textured Cloth 083', subtitle: '哑光织物 · 低饱和', source: 'ambientCG / GitHub 索引', license: 'CC0 1.0', image: '/assets/fabric083-preview.png', tone: '#b5a995', tags: ['woven', 'texture', 'matte'] },
  { id: 'fabric-080', name: 'Fine Knit 080', subtitle: '细针织 · 柔软弹性', source: 'ambientCG / GitHub 索引', license: 'CC0 1.0', image: '/assets/fabric080-preview.png', tone: '#c8c2b7', tags: ['knit', 'soft', 'stretch'] },
]

const references: Reference[] = [
  { id: 'collar-01', name: '立领细节参考', source: '客户图库 · 已确认', image: '/assets/ref-collar.svg', usage: '领口形状', status: 'selected' },
  { id: 'silhouette-02', name: '宽松廓形', source: '客户图库 · 已保存', image: '/assets/ref-silhouette.svg', usage: '整体轮廓', status: 'saved' },
  { id: 'texture-web-03', name: '江南织纹灵感', source: '联网检索 · 待确认', image: '/assets/ref-texture.svg', usage: '纹理参考', status: 'suggested' },
]

const initialNodes: WorkflowNode[] = [
  { id: 'brief', eyebrow: '01 · UNDERSTAND', title: '需求理解', detail: '服装 Brief · 6 个约束', state: 'done', duration: '0.8s', icon: Sparkles },
  { id: 'material_resolve', eyebrow: '02 · RETRIEVE', title: '面料匹配', detail: 'CC0 面料库 · 选择理由', state: 'done', duration: '1.2s', icon: Layers3 },
  { id: 'reference_bind', eyebrow: '03 · BIND', title: '参考图绑定', detail: '领口 · 廓形 · 保留项', state: 'done', duration: '0.6s', icon: ImagePlus },
  { id: 'prompt_compose', eyebrow: '04 · COMPOSE', title: '提示词编排', detail: '正向 · 反向 · 保留约束', state: 'done', duration: '已组装', icon: Wand2 },
  { id: 'image_generate', eyebrow: '05 · GENERATE', title: '生成 V1', detail: 'Cotton Weave 081C · 1024×1280', state: 'done', duration: '已保存', icon: FileImage },
  { id: 'image_edit', eyebrow: '06 · EDIT', title: '定向修改 V2', detail: '领口收窄 · 其余保持', state: 'ready', icon: SquarePen },
  { id: 'quality_check', eyebrow: '07 · CHECK', title: '约束质量检查', detail: '颜色 · 版型 · 衣长 · 领口', state: 'queued', icon: Check },
  { id: 'artifact', eyebrow: '08 · DELIVER', title: '版本与交付', detail: '图像 · Brief · 来源', state: 'idle', icon: Download },
]

const initialActivities: Activity[] = [
  { id: 1, kind: 'voice', title: '客户', body: '米白色、宽松的新中式通勤外套，简约些。', time: '刚刚' },
  { id: 2, kind: 'agent', title: '正在提取需求', body: '颜色、版型、风格和使用场景已记录。', time: '刚刚', live: true },
  { id: 3, kind: 'asset', title: '素材已绑定', body: 'Cotton Weave 081C → fabric_reference', time: '刚刚' },
]

const initialGenerationSteps: GenerationStep[] = [
  { id: 'input', label: '输入锁定', detail: '修改 06', state: 'done' },
  { id: 'material', label: '面料匹配', detail: 'CC0 选择', state: 'done' },
  { id: 'reference', label: '参考绑定', detail: '2 个输入', state: 'done' },
  { id: 'prompt', label: '提示词编排', detail: '保留约束', state: 'done' },
  { id: 'source', label: '版本分支', detail: 'V1 → V2', state: 'done' },
  { id: 'provider', label: '调用 Image 2', detail: '等待执行', state: 'queued' },
  { id: 'quality', label: '质量检查', detail: '约束对照', state: 'idle' },
  { id: 'artifact', label: '保存版本', detail: 'artifact', state: 'idle' },
]

const graphPositions: Record<string, { left: string; top: string }> = {
  brief: { left: '6%', top: '14%' },
  material_resolve: { left: '27%', top: '8%' },
  reference_bind: { left: '27%', top: '52%' },
  prompt_compose: { left: '49%', top: '30%' },
  image_generate: { left: '72%', top: '8%' },
  image_edit: { left: '72%', top: '39%' },
  quality_check: { left: '72%', top: '59%' },
  artifact: { left: '72%', top: '78%' },
}

const clients = [
  { id: 'shui-moon', name: '水木设计事务所', short: '水木', color: '#b9d6cf' },
  { id: 'yue-studio', name: '越界生活方式', short: '越界', color: '#d9c3b5' },
  { id: 'he-shi', name: '和时品牌工作室', short: '和时', color: '#c8cde0' },
]

const formatTime = () => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date())
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

function App() {
  const [activeClientId, setActiveClientId] = useState(clients[0].id)
  const [clientMenuOpen, setClientMenuOpen] = useState(false)
  const [activeVersion, setActiveVersion] = useState<'V1' | 'V2'>('V2')
  const [nodes, setNodes] = useState(initialNodes)
  const [activities, setActivities] = useState(initialActivities)
  const [selectedNode, setSelectedNode] = useState('prompt_compose')
  const [selectedMaterialId, setSelectedMaterialId] = useState('fabric-081c')
  const [selectedReferenceId, setSelectedReferenceId] = useState('collar-01')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationSteps, setGenerationSteps] = useState(initialGenerationSteps)
  const [apiStatus, setApiStatus] = useState<'checking' | 'ready' | 'offline'>('checking')
  const [storageMode, setStorageMode] = useState<'memory' | 'postgres'>('memory')
  const [workflowOpen, setWorkflowOpen] = useState(false)
  const [canGenerate, setCanGenerate] = useState(true)
  const [prompt, setPrompt] = useState('米白色、宽松的新中式通勤外套。保持轻盈、克制的廓形，领口参考客户上传图片；使用柔和棉质织纹。')
  const [liveText, setLiveText] = useState('')
  const [toast, setToast] = useState('')
  const [showAllMaterials, setShowAllMaterials] = useState(false)
  const [showAllReferences, setShowAllReferences] = useState(false)
  const speechTimer = useRef<number | undefined>(undefined)
  const toastTimer = useRef<number | undefined>(undefined)
  const runEventSource = useRef<EventSource | undefined>(undefined)
  const runFallbackTimer = useRef<number | undefined>(undefined)

  const activeClient = clients.find((client) => client.id === activeClientId) ?? clients[0]
  const selectedMaterial = materials.find((material) => material.id === selectedMaterialId) ?? materials[0]
  const selectedReference = references.find((reference) => reference.id === selectedReferenceId) ?? references[0]
  const visibleMaterials = showAllMaterials ? materials : materials.slice(0, 3)
  const visibleReferences = showAllReferences ? references : references.slice(0, 2)
  const selectedNodeData = nodes.find((node) => node.id === selectedNode) ?? nodes[3]
  const stats = useMemo(() => [{ value: '06', label: '约束已锁定' }, { value: '02', label: '参考已绑定' }, { value: '02', label: '版本可回退' }], [])

  useEffect(() => () => {
    if (speechTimer.current) window.clearInterval(speechTimer.current)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    if (runFallbackTimer.current) window.clearTimeout(runFallbackTimer.current)
    runEventSource.current?.close()
  }, [])

  useEffect(() => {
    let active = true
    fetch(API_BASE_URL + '/api/health')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('health check failed')))
      .then((payload) => { if (active) { setApiStatus('ready'); setStorageMode(payload.database === 'postgres' ? 'postgres' : 'memory') } })
      .catch(() => { if (active) setApiStatus('offline') })
    return () => { active = false }
  }, [])

  const flash = (message: string) => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2600)
  }

  const addActivity = (activity: Omit<Activity, 'id' | 'time'>) => {
    setActivities((current) => [...current, { ...activity, id: Date.now() + Math.random(), time: formatTime() }])
  }

  const updateNode = (id: string, patch: Partial<WorkflowNode>) => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, ...patch } : node))
  }

  const updateGenerationStep = (id: string, patch: Partial<GenerationStep>) => {
    setGenerationSteps((current) => current.map((step) => step.id === id ? { ...step, ...patch } : step))
  }

  const finishGeneration = (message = 'V2 已生成并保存为新版本') => {
    if (runFallbackTimer.current) window.clearTimeout(runFallbackTimer.current)
    runEventSource.current?.close()
    runEventSource.current = undefined
    updateGenerationStep('artifact', { state: 'done', detail: 'V2 已保存' })
    setIsGenerating(false)
    setCanGenerate(true)
    updateNode('image_edit', { state: 'done', detail: 'V2 · 领口收窄' })
    updateNode('quality_check', { state: 'done', detail: '4 项约束通过' })
    updateNode('artifact', { state: 'done', detail: 'PNG · Brief · 来源清单' })
    addActivity({ kind: 'system', title: 'V2 已完成', body: '新版本已保存，可继续修改或导出。' })
    flash(message)
  }

  const applyRunPhase = (phase: string, message?: string) => {
    if (phase === 'input_locked') updateGenerationStep('input', { state: 'done', detail: '输入已锁定' })
    if (phase === 'material_resolved') updateGenerationStep('material', { state: 'done', detail: 'CC0 选择已锁定' })
    if (phase === 'references_bound') updateGenerationStep('reference', { state: 'done', detail: '参考图已绑定' })
    if (phase === 'prompt_composed') updateGenerationStep('prompt', { state: 'done', detail: '提示词已编排' })
    if (phase === 'provider.requested') {
      updateGenerationStep('provider', { state: 'working', detail: '请求中…' })
      updateNode('image_edit', { state: 'working', detail: '调用图片 Provider' })
    }
    if (phase === 'provider.received') {
      updateGenerationStep('provider', { state: 'done', detail: '响应已返回' })
      updateGenerationStep('quality', { state: 'working', detail: '检查中…' })
      updateNode('quality_check', { state: 'working', detail: '逐项检查约束' })
      addActivity({ kind: 'system', title: '图片生成中', body: message ?? '图像已返回，正在逐项检查约束。', live: true })
    }
    if (phase === 'quality.started') {
      updateGenerationStep('quality', { state: 'working', detail: '检查中…' })
      updateNode('quality_check', { state: 'working', detail: '逐项检查约束' })
    }
    if (phase === 'quality.passed') {
      updateGenerationStep('quality', { state: 'done', detail: '4 项约束通过' })
      updateGenerationStep('artifact', { state: 'working', detail: '写入项目档案…' })
      updateNode('quality_check', { state: 'done', detail: '4 项约束通过' })
      updateNode('artifact', { state: 'working', detail: '写入项目档案…' })
      addActivity({ kind: 'system', title: '质量检查通过', body: message ?? '颜色、版型、衣长和领口修改均符合本次要求。', live: true })
    }
    if (phase === 'artifact.created') finishGeneration()
  }

  const openWorkflowCanvas = (nodeId = 'image_edit') => {
    setSelectedNode(nodeId)
    setWorkflowOpen(true)
  }

  const startRealtimeBrief = () => {
    if (isSpeaking) {
      if (speechTimer.current) window.clearInterval(speechTimer.current)
      setIsSpeaking(false)
      setLiveText('')
      return
    }
    const sample = '领口再小一点，其他不要改。整体保持米白色和宽松版型。'
    let index = 0
    setIsSpeaking(true)
    setCanGenerate(false)
    setLiveText('')
    addActivity({ kind: 'voice', title: '客户 · 实时转写', body: '正在接收新的修改意见…', live: true })
    updateNode('brief', { state: 'working' })
    updateNode('material_resolve', { state: 'working' })
    updateNode('reference_bind', { state: 'working' })
    updateNode('prompt_compose', { state: 'working' })
    speechTimer.current = window.setInterval(() => {
      index += 2
      setLiveText(sample.slice(0, index))
      if (index >= sample.length) {
        if (speechTimer.current) window.clearInterval(speechTimer.current)
        window.setTimeout(() => {
          setIsSpeaking(false)
          setLiveText('')
          setCanGenerate(true)
          updateNode('brief', { state: 'done', detail: '已更新 · 6 个约束' })
          updateNode('material_resolve', { state: 'done', detail: '面料匹配保持绑定' })
          updateNode('reference_bind', { state: 'done', detail: '领口参考保持绑定' })
          updateNode('prompt_compose', { state: 'ready', detail: 'V2 修改已准备' })
          updateNode('image_edit', { state: 'ready' })
          setPrompt('保持米白色、宽松版型和衣长不变；领口收窄，其他元素不修改。')
          addActivity({ kind: 'agent', title: '修改已准备', body: '颜色、版型、衣长和面料约束将被保留。', live: true })
          flash('修改已准备，V2 可以生成')
        }, 700)
      }
    }, 80)
  }

  const generateVersion = () => {
    if (isGenerating) return
    setIsGenerating(true)
    setCanGenerate(false)
    setActiveVersion('V2')
    setGenerationSteps(initialGenerationSteps.map((step) => ({ ...step, state: ['input', 'material', 'reference', 'prompt', 'source'].includes(step.id) ? 'done' : step.id === 'provider' ? 'working' : 'idle' })))
    updateNode('prompt_compose', { state: 'done', detail: '修改已提交 · 4 个字段保留' })
    updateNode('image_edit', { state: 'working', detail: '执行图片编辑' })
    updateNode('quality_check', { state: 'queued', detail: '等待图片返回' })
    updateNode('artifact', { state: 'queued' })
    addActivity({ kind: 'agent', title: '生成流程已启动', body: '参考图 + V1 编辑，正在生成新版本。', live: true })
    runEventSource.current?.close()
    if (runFallbackTimer.current) window.clearTimeout(runFallbackTimer.current)
    fetch(API_BASE_URL + '/api/projects/prj_suzhou_ss26/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ node_id: 'image_edit', mode: 'edit', prompt, material_ids: [selectedMaterial.id], references: [selectedReference.id], source_artifact_id: 'art_suzhou_v1', edit_artifact_id: 'art_suzhou_v1', parameters: { model: 'gpt-image-2', size: '1024x1280', quality: 'high' } }),
    }).then((response) => response.ok ? response.json() : Promise.reject(new Error('生成请求失败'))).then((run: { id: string }) => {
      const source = new EventSource(API_BASE_URL + '/api/projects/prj_suzhou_ss26/events')
      runEventSource.current = source
      const handleEvent = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as { run_id?: string; phase?: string; message?: string }
          if (payload.run_id && payload.run_id !== run.id) return
          if (event.type === 'run.failed') {
            if (runFallbackTimer.current) window.clearTimeout(runFallbackTimer.current)
            source.close()
            runEventSource.current = undefined
            setIsGenerating(false)
            setCanGenerate(true)
            updateNode('image_edit', { state: 'failed', detail: payload.message ?? '生成失败' })
            addActivity({ kind: 'system', title: '生成失败', body: payload.message ?? '图片 Provider 未返回有效结果。' })
            flash(payload.message ?? '生成失败')
            return
          }
          applyRunPhase(payload.phase ?? (event.type === 'artifact.created' ? 'artifact.created' : ''), payload.message)
        } catch {
          flash('收到无法解析的流程事件')
        }
      }
      source.addEventListener('run.phase', handleEvent)
      source.addEventListener('artifact.created', handleEvent)
      source.addEventListener('run.failed', handleEvent)
    }).catch((error: Error) => {
      if (runFallbackTimer.current) window.clearTimeout(runFallbackTimer.current)
      setIsGenerating(false)
      setCanGenerate(true)
      updateNode('image_edit', { state: 'failed', detail: error.message })
      addActivity({ kind: 'system', title: '生成请求失败', body: error.message })
      flash(error.message)
    })
    runFallbackTimer.current = window.setTimeout(() => {
      setIsGenerating(false)
      setCanGenerate(true)
      updateNode('image_edit', { state: 'failed', detail: '等待流程事件超时' })
      flash('图片生成流等待超时，请检查后端服务')
    }, 15000)
  }

  const searchWeb = () => {
    if (!query.trim()) {
      flash('输入一个面料、色彩或风格关键词')
      return
    }
    setSearching(true)
    addActivity({ kind: 'agent', title: '联网检索', body: '正在搜索“' + query.trim() + '”的参考图与面料信息…', live: true })
    updateNode('material_resolve', { state: 'working', detail: '联网搜索 · ' + query.trim() })
    window.setTimeout(() => {
      setSearching(false)
      updateNode('material_resolve', { state: 'done', detail: '面料库 + 联网参考' })
      addActivity({ kind: 'asset', title: '搜索结果已就绪', body: '找到 6 个参考结果，等待你确认后入库。' })
      flash('找到 6 个参考结果，未确认前不会写入客户档案')
    }, 1100)
  }

  const selectMaterial = (material: Material) => {
    setSelectedMaterialId(material.id)
    setPrompt((value) => value.replace(/使用[^。]+。?$/, '') + '使用' + material.subtitle + '。')
    updateNode('material_resolve', { state: 'done', detail: material.name + ' 已绑定' })
    addActivity({ kind: 'asset', title: '面料已绑定', body: material.name + ' → fabric_reference' })
    flash(material.name + ' 已绑定到当前项目')
  }

  const selectReference = (reference: Reference) => {
    setSelectedReferenceId(reference.id)
    addActivity({ kind: 'asset', title: '参考图已绑定', body: reference.name + ' → ' + reference.usage })
    flash(reference.name + ' 已绑定为' + reference.usage)
  }

  const exportProject = () => {
    const payload = {
      client: activeClient.name,
      project: '苏式通勤外套 · 03',
      activeVersion,
      prompt,
      material: selectedMaterial,
      reference: selectedReference,
      workflow: nodes.map(({ id, title, state, detail }) => ({ id, title, state, detail })),
      exportedAt: formatTime(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'huichuang-project-brief.json'
    anchor.click()
    URL.revokeObjectURL(url)
    flash('项目 Brief 与工作流记录已导出')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark"><Sparkles size={18} strokeWidth={2.2} /></div>
          <div><div className="brand-name">会创 AI</div><div className="brand-subtitle">STUDIO</div></div>
        </div>
        <div className="topbar-center">
          <button className="client-switcher" onClick={() => setClientMenuOpen((open) => !open)}>
            <span className="avatar" style={{ background: activeClient.color }}>{activeClient.short.slice(0, 1)}</span>
            <span className="client-switcher-copy"><strong>{activeClient.name}</strong><small>客户档案 · 3 个项目</small></span><ChevronDown size={15} />
          </button>
          <AnimatePresence>
            {clientMenuOpen && <motion.div className="client-menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
              <div className="menu-label">切换客户档案</div>
              {clients.map((client) => <button key={client.id} className={'client-option ' + (client.id === activeClientId ? 'active' : '')} onClick={() => { setActiveClientId(client.id); setClientMenuOpen(false); flash('已切换到 ' + client.name) }}>
                <span className="avatar small" style={{ background: client.color }}>{client.short.slice(0, 1)}</span><span><strong>{client.name}</strong><small>品牌档案 · 私有项目</small></span>{client.id === activeClientId && <Check size={15} />}
              </button>)}
              <button className="add-client" onClick={() => flash('客户档案创建入口已预留')}><Plus size={15} /> 新建客户档案</button>
            </motion.div>}
          </AnimatePresence>
        </div>
        <div className="topbar-actions"><span className="provider-pill"><span className={'status-dot ' + (apiStatus === 'offline' ? 'offline' : '')} /> {apiStatus === 'ready' ? storageMode === 'postgres' ? '已保存到数据库' : '本地草稿' : apiStatus === 'offline' ? '离线草稿' : '保存中…'}</span><button className="icon-button" aria-label="帮助"><CircleHelp size={18} /></button><button className="avatar user-avatar" aria-label="用户"><UserRound size={16} /></button></div>
      </header>

      <div className="workspace">
        <aside className="left-rail">
          <div className="rail-heading"><div><span className="eyebrow">PROJECT SPACE</span><h2>创作空间</h2></div><button className="icon-button soft" onClick={() => flash('新建项目入口已预留')}><Plus size={17} /></button></div>
          <div className="project-card active"><div className="project-thumb"><img src="/assets/coat-v2.svg" alt="当前项目预览" /></div><div className="project-copy"><strong>苏式通勤外套 · 03</strong><span>正在创作 · V2</span></div><MoreHorizontal size={17} className="muted-icon" /></div>
          <div className="project-card compact"><div className="project-thumb mini"><img src="/assets/ref-silhouette.svg" alt="项目预览" /></div><div className="project-copy"><strong>真丝围巾系列</strong><span>已交付 · 12 个版本</span></div></div>
          <button className="ghost-row" onClick={() => flash('更多项目即将加载')}><FolderOpen size={16} /> 查看全部项目 <span>3</span></button>
          <div className="rail-section materials-section">
            <div className="section-heading"><span><Layers3 size={16} /> 面料库</span><button onClick={() => setShowAllMaterials((show) => !show)}>{showAllMaterials ? '收起' : '查看全部'}</button></div>
            <div className="material-stack">{visibleMaterials.map((material) => <button key={material.id} className={'material-row ' + (selectedMaterialId === material.id ? 'selected' : '')} onClick={() => selectMaterial(material)}><span className="material-swatch" style={{ backgroundImage: 'url(' + material.image + ')' }} /><span className="material-row-copy"><strong>{material.name}</strong><small>{material.subtitle}</small></span>{selectedMaterialId === material.id && <Check size={14} />}</button>)}</div>
            <button className="subtle-link" onClick={() => flash('面料库导入入口已预留')}><UploadCloud size={15} /> 导入 CC0 面料包</button>
          </div>
          <div className="rail-section refs-section">
            <div className="section-heading"><span><ImagePlus size={16} /> 参考图库</span><button onClick={() => setShowAllReferences((show) => !show)}>{showAllReferences ? '收起' : '查看全部'}</button></div>
            <div className="reference-grid">{visibleReferences.map((reference) => <button key={reference.id} className={'reference-tile ' + (selectedReferenceId === reference.id ? 'selected' : '')} onClick={() => selectReference(reference)}><img src={reference.image} alt={reference.name} /><span className="reference-badge">{reference.status === 'suggested' ? '待确认' : reference.usage}</span></button>)}<button className="reference-tile add-tile" onClick={() => flash('上传参考图入口已预留')}><Plus size={20} /><span>上传</span></button></div>
          </div>
          <div className="rail-footer"><button className="ghost-row"><Settings2 size={16} /> 工作台设置</button><button className="ghost-row"><LayoutPanelLeft size={16} /> 客户档案字段</button></div>
        </aside>

        <main className="main-canvas">
          <div className="canvas-header"><div><span className="eyebrow">{activeClient.name} / PROJECT 03</span><h1>苏式通勤外套</h1><p>一套设计，从草稿到交付。</p></div><div className="canvas-header-actions"><button className="outline-button"><Undo2 size={15} /> 回退</button><button className="primary-button" onClick={exportProject}><Download size={15} /> 导出提案</button></div></div>
          <div className="canvas-grid">
            <section className="hero-card">
              <div className="hero-card-top"><div className="live-label"><span className="live-orb" /> CURRENT DRAFT</div><div className="version-tabs"><button className={activeVersion === 'V1' ? 'active' : ''} onClick={() => setActiveVersion('V1')}>V1</button><button className={activeVersion === 'V2' ? 'active' : ''} onClick={() => setActiveVersion('V2')}>V2</button></div></div>
              <div className="hero-image-wrap"><AnimatePresence mode="wait"><motion.img key={activeVersion} className="hero-image" src={activeVersion === 'V1' ? '/assets/coat-v1.svg' : '/assets/coat-v2.svg'} alt={activeVersion + ' 设计效果图'} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.45 }} /></AnimatePresence><div className="hero-image-glow" />{isGenerating && <motion.div className="generation-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="generation-spinner"><Sparkles size={20} /></div><strong>正在执行细节修改</strong><span>{generationSteps.find((step) => step.state === 'working')?.label ?? '准备输入'} · 旧版本不会被覆盖</span></motion.div>}</div>
              <div className="generation-trace" aria-label="图片生成流程"><div className="generation-trace-head"><span><Workflow size={13} /> 图片生成流</span><small>{isGenerating ? '实时执行中' : '最近一次运行'}</small></div><div className="generation-step-list">{generationSteps.map((step, index) => <div key={step.id} className={'generation-step state-' + step.state}><span className="generation-step-index">{step.state === 'done' ? <Check size={11} /> : step.state === 'working' ? <span className="node-spinner" /> : index + 1}</span><span className="generation-step-copy"><strong>{step.label}</strong><small>{step.detail}</small></span>{index < generationSteps.length - 1 && <span className="generation-step-line" />}</div>)}</div></div>
              <div className="hero-card-bottom"><div><strong>{activeVersion} · {activeVersion === 'V1' ? '初始概念方向' : '领口细节收窄'}</strong><span>来源：需求事件 #evt-103 · {selectedMaterial.name}</span></div><div className="hero-card-actions"><button className="enter-canvas-button" onClick={() => openWorkflowCanvas('image_edit')}><Maximize2 size={14} /> 进入生成画布</button><button className="circle-action" onClick={() => flash('已复制当前版本链接')}><ExternalLink size={16} /></button></div></div>
            </section>
            <section className="stats-card"><div className="section-heading"><span><Zap size={16} /> 项目摘要</span><span className="tiny-status">SAVED</span></div><div className="stats-grid">{stats.map((stat) => <div key={stat.label} className="stat-item"><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div><div className="client-note"><div className="note-icon"><UserRound size={15} /></div><div><strong>{activeClient.name}</strong><span>偏好：克制、低饱和、轻盈材质</span></div></div></section>
            <section className="activity-card"><div className="section-heading"><span><Sparkles size={16} /> 活动记录</span><span className="agent-live"><i /> 实时</span></div><div className="activity-list">{activities.slice(-5).map((activity) => <motion.div layout key={activity.id} className={'activity-item ' + (activity.live ? 'live' : '')}><div className={'activity-icon ' + activity.kind}>{activity.kind === 'voice' ? <Mic size={14} /> : activity.kind === 'asset' ? <Layers3 size={14} /> : activity.kind === 'agent' ? <Sparkles size={14} /> : <Check size={14} />}</div><div className="activity-copy"><strong>{activity.title}</strong><span>{activity.body}</span></div><time>{activity.time}</time></motion.div>)}</div></section>
          </div>
          <section className="conversation-card"><div className="conversation-top"><div><span className="eyebrow">REVISION INPUT</span><h3>修改这套设计</h3></div><div className={'mic-state ' + (isSpeaking ? 'on' : '')}><span /> {isSpeaking ? '正在聆听' : '等你输入'}</div></div><div className="transcript-box">{isSpeaking ? <span className="live-transcript">{liveText}<i className="cursor" /></span> : <span>“领口再小一点，其他不要改。”</span>}<button className="inline-mic" onClick={startRealtimeBrief} aria-label="开始模拟语音输入"><Mic size={18} /></button></div><div className="conversation-actions"><button className={'talk-button ' + (isSpeaking ? 'recording' : '')} onClick={startRealtimeBrief}><span className="talk-button-icon">{isSpeaking ? <X size={17} /> : <Mic size={17} />}</span>{isSpeaking ? '结束模拟输入' : '模拟一段实时对话'}</button><button className="text-command" onClick={() => { setPrompt('领口收窄，其他不要改。保持米白色、宽松版型和棉质织纹。'); setCanGenerate(true); flash('已写入一条新的修改指令') }}><SquarePen size={15} /> 直接输入修改</button></div></section>
          <section className="brief-summary-card"><div className="brief-summary-top"><div><span className="eyebrow">DESIGN BRIEF · REVISION 06</span><h3>当前设计 Brief</h3></div><button className="outline-button small" onClick={() => flash('Brief 修订记录已打开')}>查看修订</button></div><div className="brief-summary-grid"><div className="brief-summary-group"><span className="brief-label"><span className="label-dot locked" /> 已确认硬约束</span><div className="chip-list"><span className="brief-chip locked">米白色</span><span className="brief-chip locked">宽松版型</span><span className="brief-chip locked">衣长不变</span><span className="brief-chip locked">其他不要改</span></div></div><div className="brief-summary-group"><span className="brief-label"><span className="label-dot soft" /> 待确认偏好</span><div className="chip-list"><span className="brief-chip soft">简约</span><span className="brief-chip soft">新中式</span><span className="brief-chip soft">通勤场景</span></div></div><div className="brief-summary-group"><span className="brief-label"><span className="label-dot bind" /> 引用绑定</span><div className="binding-list"><span><span className="binding-swatch" style={{ backgroundImage: 'url(' + selectedMaterial.image + ')' }} />{selectedMaterial.name}<small>面料引用</small></span><span><span className="binding-swatch" style={{ backgroundImage: 'url(' + selectedReference.image + ')' }} />{selectedReference.name}<small>{selectedReference.usage}</small></span></div></div></div><div className="brief-summary-foot"><span><Sparkles size={14} /> 本次修改已整理为 1 个版本变更</span><span className="brief-foot-status"><span className="status-dot" /> 可生成 V2</span></div></section>
        </main>

        <aside className="right-inspector">
          <div className="inspector-heading"><div><span className="eyebrow">IMAGE FLOW</span><h2>生成流程</h2></div><div className="inspector-heading-actions"><button className="outline-button small" onClick={() => openWorkflowCanvas()}><Maximize2 size={13} /> 打开画布</button><button className="icon-button soft" onClick={() => flash('流程版本已锁定，可从节点菜单编辑')}><MoreHorizontal size={18} /></button></div></div>
          <div className="workflow-meta"><span><Workflow size={14} /> 苏式通勤外套 · v0.4</span><button onClick={() => flash('工作流已保存为新版本')}>保存版本</button></div>
          <div className="workflow-list">{nodes.map((node, index) => { const Icon = node.icon; return <button key={node.id} className={'workflow-node ' + (selectedNode === node.id ? 'selected ' : '') + 'state-' + node.state} onClick={() => setSelectedNode(node.id)}><div className="node-index">{node.state === 'done' ? <Check size={13} /> : node.state === 'failed' ? '!' : index + 1}</div><div className="node-icon"><Icon size={15} /></div><div className="node-copy"><span>{node.eyebrow}</span><strong>{node.title}</strong><small>{node.detail}</small></div><div className="node-status">{node.state === 'working' ? <span className="node-spinner" /> : node.state === 'done' ? node.duration : node.state === 'failed' ? '失败' : node.state === 'ready' ? <span className="ready-dot" /> : ''}</div></button> })}</div>
          <div className="inspector-panel"><div className="panel-title"><span><SquarePen size={15} /> {selectedNodeData.title}</span><span className="panel-editable">可编辑</span></div><label>Prompt / 当前节点输入</label><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /><div className="field-row"><div><label>引用面料</label><button className="select-field" onClick={() => selectMaterial(selectedMaterial)}><span className="field-swatch" style={{ backgroundImage: 'url(' + selectedMaterial.image + ')' }} />{selectedMaterial.name}<ChevronDown size={14} /></button></div><div><label>参考图</label><button className="select-field" onClick={() => selectReference(selectedReference)}><span className="field-swatch reference" style={{ backgroundImage: 'url(' + selectedReference.image + ')' }} />{selectedReference.usage}<ChevronDown size={14} /></button></div></div><button className="run-node-button" disabled={!canGenerate || isGenerating} onClick={generateVersion}>{isGenerating ? <><span className="node-spinner" /> 生成中…</> : <><Play size={15} /> {canGenerate ? '运行此节点' : '等待输入'}</>}</button><div className="node-footnote"><span><Check size={13} /> 下游节点会自动标记过期</span><span><Zap size={13} /> 预计 18–32 秒</span></div></div>
          <div className="search-panel"><div className="panel-title"><span><Globe2 size={15} /> 搜索参考素材</span><span className="search-safe">待确认入库</span></div><div className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && searchWeb()} placeholder="搜索面料、轮廓或灵感" /><button onClick={searchWeb} disabled={searching}>{searching ? <span className="node-spinner" /> : <ArrowUp size={15} />}</button></div><div className="search-hint">搜索结果只作为参考缩略图，确认后才会写入客户档案。</div></div>
        </aside>
      </div>
      <AnimatePresence>
        {workflowOpen && <motion.section className="workflow-canvas-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <header className="workflow-canvas-topbar">
            <button className="canvas-back-button" onClick={() => setWorkflowOpen(false)}><ArrowLeft size={16} /> 返回工作台</button>
            <div className="workflow-canvas-title"><span className="eyebrow">IMAGE FLOW / V0.4</span><strong>苏式通勤外套 · 生成画布</strong><span>可编辑节点 · {activeVersion}</span></div>
            <div className="workflow-canvas-actions"><span className="canvas-save-state"><span className="status-dot" /> {storageMode === 'postgres' ? '已保存到数据库' : '本地草稿'}</span><button className="canvas-icon-button" aria-label="缩小"><ZoomOut size={16} /></button><button className="canvas-icon-button" aria-label="放大"><ZoomIn size={16} /></button><button className="canvas-icon-button" aria-label="适应画布"><Maximize2 size={16} /></button><button className="run-workflow-button" disabled={!canGenerate || isGenerating} onClick={generateVersion}>{isGenerating ? <><span className="node-spinner" /> 生成中…</> : <><Play size={15} /> 运行工作流</>}</button></div>
          </header>
          <div className="workflow-canvas-main">
            <aside className="canvas-tool-rail"><button className="canvas-tool active" aria-label="选择"><MousePointer2 size={16} /></button><button className="canvas-tool" aria-label="移动"><Move size={16} /></button><span className="canvas-tool-divider" /><button className="canvas-tool" aria-label="放大"><ZoomIn size={16} /></button><button className="canvas-tool" aria-label="缩小"><ZoomOut size={16} /></button><button className="canvas-tool" aria-label="适应"><Maximize2 size={16} /></button><div className="canvas-tool-spacer" /><button className="canvas-tool" onClick={() => flash('节点快捷菜单已预留')} aria-label="更多"><MoreHorizontal size={16} /></button></aside>
            <section className="workflow-graph-panel">
              <div className="graph-panel-head"><div><strong>节点画布</strong><span>拖动节点调整顺序，点击节点编辑输入</span></div><div className="graph-zoom-label">100%</div></div>
              <div className="graph-surface">
                <div className="graph-surface-grid" />
                <div className="graph-caption"><span><span className="graph-live-dot" /> 工作流草稿</span><span>{nodes.length} 节点 · 2 个素材输入</span></div>
                <svg className="graph-connections" viewBox="0 0 1000 760" preserveAspectRatio="none" aria-hidden="true"><path d="M255 165 C300 165 300 150 365 150" /><path d="M255 165 C300 165 300 430 365 430" /><path d="M475 150 C520 150 520 285 585 285" /><path d="M475 430 C520 430 520 315 585 315" /><path d="M695 285 C720 285 720 145 720 145" /><path d="M820 199 C820 235 820 260 820 296" /><path d="M820 434 C820 440 820 444 820 448" /><path d="M820 586 C820 589 820 591 820 593" /></svg>
                {nodes.map((node, index) => { const Icon = node.icon; const position = graphPositions[node.id] ?? { left: '6%', top: `${14 + index * 12}%` }; return <motion.button layout key={node.id} className={'graph-node state-' + node.state + (selectedNode === node.id ? ' selected' : '')} style={{ left: position.left, top: position.top }} onClick={() => setSelectedNode(node.id)}><div className="graph-node-head"><span className="graph-node-index">{node.state === 'done' ? <Check size={12} /> : String(index + 1).padStart(2, '0')}</span><span className="graph-node-type">{node.eyebrow.split(' · ')[1]}</span><span className="graph-node-menu"><MoreHorizontal size={14} /></span></div><div className="graph-node-title"><span className="graph-node-icon"><Icon size={15} /></span><strong>{node.title}</strong></div><p>{node.detail}</p><div className="graph-node-footer"><span className={'graph-status-dot ' + node.state} />{node.state === 'done' ? '已完成' : node.state === 'working' ? '执行中' : node.state === 'failed' ? '失败' : node.state === 'ready' ? '待运行' : '等待上游'}</div></motion.button> })}
              </div>
              <div className="graph-surface-footer"><span>空格 + 拖动移动画布</span><span>点击节点查看参数</span></div>
            </section>
            <aside className="workflow-canvas-inspector">
              <div className="canvas-inspector-head"><div><span className="eyebrow">NODE INSPECTOR</span><h3>{selectedNodeData.title}</h3></div><button className="canvas-icon-button" onClick={() => setWorkflowOpen(false)} aria-label="关闭画布"><ArrowLeft size={16} /></button></div>
              <div className="canvas-node-status"><span className={'graph-status-dot ' + selectedNodeData.state} /> {selectedNodeData.state === 'done' ? '已完成' : selectedNodeData.state === 'working' ? '执行中' : selectedNodeData.state === 'failed' ? '失败' : selectedNodeData.state === 'ready' ? '待运行' : '等待上游'}<span>{selectedNodeData.duration ?? '—'}</span></div>
              <label>Prompt / 当前节点输入</label><textarea className="canvas-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              <div className="canvas-input-card"><span className="canvas-input-label">面料引用</span><div><span className="canvas-input-swatch" style={{ backgroundImage: 'url(' + selectedMaterial.image + ')' }} /><strong>{selectedMaterial.name}</strong></div></div>
              <div className="canvas-input-card"><span className="canvas-input-label">参考图</span><div><span className="canvas-input-swatch" style={{ backgroundImage: 'url(' + selectedReference.image + ')' }} /><strong>{selectedReference.name}</strong></div></div>
              <button className="canvas-run-node" disabled={!canGenerate || isGenerating} onClick={generateVersion}>{isGenerating ? <><span className="node-spinner" /> 节点运行中…</> : <><Play size={15} /> 运行当前节点</>}</button>
              <div className="canvas-inspector-note"><Check size={14} /> 下游节点会随修改自动标记过期</div>
            </aside>
          </div>
          <footer className="workflow-canvas-footer"><div><span className="eyebrow">RUN TRACE</span><strong>{isGenerating ? '工作流执行中' : '最近一次运行'}</strong></div><div className="canvas-footer-steps">{generationSteps.map((step) => <span key={step.id} className={'canvas-footer-step state-' + step.state}><i />{step.label}</span>)}</div><button className="canvas-footer-close" onClick={() => setWorkflowOpen(false)}>完成</button></footer>
        </motion.section>}
      </AnimatePresence>
      <AnimatePresence>{toast && <motion.div className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}><Check size={15} /> {toast}</motion.div>}</AnimatePresence>
    </div>
  )
}

export default App
