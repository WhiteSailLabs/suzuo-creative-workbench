import { Box, Check, Image, LoaderCircle, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { assetUrl } from '../lib/api'
import { formatDesignValue } from '../lib/formatDesignValue'
import { VersionTimeline } from './VersionTimeline'
import { VersionComparison } from './VersionComparison'
import { isRunning } from './TaskCenter'
import type { Artifact, AssetRecord, DesignDirection, CulturalReference, DesignVersion, GenerationJob } from '../types/workbench'

const ModelViewer = lazy(() => import('./ModelViewer').then((module) => ({ default: module.ModelViewer })))

type Props = { assets?: AssetRecord[]; direction?: DesignDirection; culture?: CulturalReference[]; proposals?: Record<string, unknown>[]; versions: DesignVersion[]; jobs: GenerationJob[]; selectedVersionId: string | null; candidateVersionId: string | null; onSelectVersion: (id: string) => void; onLockCandidate: (id: string) => void | Promise<void>; onGenerate3d?: (id: string) => void; onRetryJob?: (id: string) => void }
const changeLabels: Record<string, string> = { hollow_structure: '镂空结构', base: '底座', visual_weight: '视觉重量', function: '功能' }
const valueLabels: Record<string, string> = { simplified: '简化', stable: '更稳', lighter: '更轻', incense_holder: '香插' }
const preserveLabels: Record<string, string> = { leak_view: '保留漏景关系', modern_style: '保留现代风格' }
const consistencyLabels = { pending: '待一致性检查', passed: '一致性检查通过', failed: '一致性检查未通过', not_applicable: '不适用一致性检查' } as const
function artifactOf(version: DesignVersion | undefined, type: 'image' | 'model') {
  return version?.artifacts.find((item) => type === 'image' ? item.kind === 'image' : item.kind === 'model_glb' || item.kind === 'concept_model')
}
function artifactSource(artifact?: Artifact) {
  if (!artifact) return ''
  if (artifact.url?.startsWith('http://') || artifact.url?.startsWith('https://') || artifact.url?.startsWith('data:')) return artifact.url
  return assetUrl(artifact.id)
}

export function DesignCanvas({ assets = [], direction, culture = [], proposals = [], versions, jobs, selectedVersionId, candidateVersionId, onSelectVersion, onLockCandidate, onGenerate3d, onRetryJob }: Props) {
  const [tab, setTab] = useState<'image' | 'model' | 'compare' | 'relations'>('image')
  const selected = useMemo(() => versions.find((version) => version.id === selectedVersionId) ?? versions.at(-1), [versions, selectedVersionId])
  const recordedCultureIds = new Set(assets.filter(asset => asset.version_id === selected?.id && asset.direction_id === selected?.direction_id).flatMap(asset => asset.source_culture_ids ?? []))
  const sourceCulture = direction && direction.id === selected?.direction_id ? culture.filter(item => recordedCultureIds.has(item.id) && direction.culture_ids.includes(item.id)) : []
  const cultureLabels = { fact: '文化事实', translation: '设计转译', designer_judgment: '设计师判断', generated: 'AI 推断', to_verify: '待核验' }
  const imageArtifact = artifactOf(selected, 'image'); const modelArtifact = artifactOf(selected, 'model')
  const activeJob = jobs.find(isRunning)
  const rodinBusy = jobs.some(job => job.kind === 'rodin' && isRunning(job))
  const failedJobs = jobs.filter((job) => job.status === 'failed'); const hasStale = jobs.some((job) => job.status === 'stale')
  const selectedIsCandidate = Boolean(selected && selected.id === candidateVersionId)
  const lockAndContinue = async () => {
    if (!selected) return
    await onLockCandidate(selected.id)
    setTab('model')
  }
  return <section className="design-canvas-wrap">
    <div className="canvas-toolbar"><div><button className={tab === 'image' ? 'active' : ''} onClick={() => setTab('image')} aria-pressed={tab === 'image'} aria-label="二维概念"><Image size={15} />二维概念</button><button className={tab === 'model' ? 'active' : ''} onClick={() => setTab('model')} aria-pressed={tab === 'model'} aria-label="三维模型"><Box size={15} />三维模型</button><button aria-pressed={tab === 'compare'} onClick={() => setTab('compare')} aria-label="版本对比">对比</button><button aria-pressed={tab === 'relations'} onClick={() => setTab('relations')} aria-label="来源关系">关系</button></div><span>概念设计 · 非生产 CAD</span></div>
    <div className="artifact-canvas panel-card">
      {activeJob && <div className="generation-status" style={{ position: 'absolute', top: 12, left: 12, right: 12, fontSize: 12 }} role="status"><LoaderCircle className="spin" /><strong>{activeJob.kind === 'image' ? '正在生成二维概念' : '正在生成三维模型'}</strong><span>任务 {activeJob.id.slice(-6)} · 可继续整理设计理解</span></div>}
      {!selected && !activeJob && tab === 'image' && <div className="empty-canvas"><Sparkles size={24} /><h1>让第一句想法变成可讨论的形态</h1><p>在左侧对话中说“生成一版”</p><span>设计搭档会把当前 Brief 和文化转译一起带入二维生成。</span></div>}
      {selected && tab === 'image' && (imageArtifact ? <img className="concept-image" src={artifactSource(imageArtifact)} alt={`${selected.label} 二维概念图`} /> : <div className="empty-canvas"><Image /><p>这个版本还没有二维概念图</p><span>请在左侧对话中说明修改并说“生成一版”。</span></div>)}
      {tab === 'compare' && <VersionComparison key={versions.map(v => v.id).join(',')} versions={versions} />}
      {tab === 'relations' && <section role="region" aria-label="来源链"><h2>来源关系</h2>{selected ? <ol>{sourceCulture.length ? sourceCulture.map(item => <li key={item.id}>{cultureLabels[item.kind]}：{item.title}（{item.id}） → 当前版本</li>) : <li>未记录文化来源</li>}<li>Brief 第 {selected.brief_revision} 版</li><li>对话来源：{selected.source_turn_id ?? '未记录'}</li>{selected.parent_version_id && <li>父版本：{selected.parent_version_id}</li>}<li>当前版本：{selected.label}</li>{selected.artifacts.map(artifact => <li key={artifact.id}>{artifact.kind === 'image' ? '二维图' : '三维模型'}：{artifact.id}{artifact.reference_artifact_ids?.length ? ` ← ${artifact.reference_artifact_ids.join('、')}` : ''}</li>)}{jobs.filter(job => job.version_id === selected.id).map(job => <li key={job.id}>生成任务：{job.id} → {job.artifact_id ?? selected.label}</li>)}{proposals.filter(proposal => proposal.version_id === selected.id).map((proposal, index) => <li key={String(proposal.id ?? index)}>提案：{String(proposal.id ?? '未记录编号')}</li>)}</ol> : <p>生成版本后可追溯来源</p>}</section>}
      {tab === 'model' && !selected && <div className="empty-canvas"><p>需要先锁定二维候选</p><button onClick={() => setTab('image')}>返回二维</button></div>}
      {selected && tab === 'model' && (modelArtifact ? <><Suspense fallback={<div className="viewer-loading">正在启动三维查看器…</div>}><ModelViewer url={artifactSource(modelArtifact)} /></Suspense><div className="model-provenance"><strong>{modelArtifact.input_mode === 'image' ? '由二维图生成' : '文字降级生成'}</strong>{modelArtifact.input_mode === 'image' && <span>{modelArtifact.reference_artifact_ids?.length ?? 0} 张参考图</span>}<span>{consistencyLabels[modelArtifact.consistency_status ?? (modelArtifact.input_mode === 'image' ? 'pending' : 'not_applicable')]}</span></div><span className="model-disclaimer">{modelArtifact.disclaimer ?? '概念模型，不是生产 CAD'}</span></> : <div className="empty-canvas"><Box /><p>这个版本还没有三维模型</p>{!imageArtifact && <span>先生成或导入二维概念图</span>}{imageArtifact && !selectedIsCandidate && <span>先锁定这个二维版本为候选</span>}<button disabled={!imageArtifact || !selectedIsCandidate || rodinBusy} onClick={() => imageArtifact && selectedIsCandidate && !rodinBusy && onGenerate3d?.(selected.id)}>用候选版本生成 3D</button><button onClick={() => setTab('image')}>返回二维</button>{rodinBusy && <span>当前项目已有同类生成任务正在进行</span>}<span>概念模型，不是生产 CAD</span></div>)}
    </div>
    {(failedJobs.length > 0 || hasStale) && <div className="job-notices">{failedJobs.map((job) => <div className="job-failed" key={job.id}><TriangleAlert size={14} /><span>{job.message}</span><button disabled={jobs.some(other => other.kind === job.kind && isRunning(other))} title={jobs.some(other => other.kind === job.kind && isRunning(other)) ? '当前项目已有同类生成任务正在进行' : undefined} onClick={() => onRetryJob?.(job.id)}><RefreshCw size={12} />重试</button></div>)}{hasStale && <div className="job-stale">旧任务结果已保留，不会替换当前版本</div>}</div>}
    <div className="version-review"><VersionTimeline versions={versions} candidateId={candidateVersionId} selectedId={selected?.id} onSelect={onSelectVersion} />{selected && <><div className="version-diff">{Object.entries(selected.changed_fields).map(([key, value]) => <span key={key}><strong>{changeLabels[key] ?? key}</strong>{valueLabels[String(value)] ?? formatDesignValue(value)}</span>)}{selected.preserved_fields.map((item) => <span className="preserved" key={item}><Check size={11} />{preserveLabels[item] ?? `保留 ${item}`}</span>)}</div><button className="lock-candidate" disabled={selected.id === candidateVersionId} onClick={() => void lockAndContinue()}>{selected.id === candidateVersionId ? '已锁定候选' : '锁定为候选版本'}</button></>}
    </div>
  </section>
}
