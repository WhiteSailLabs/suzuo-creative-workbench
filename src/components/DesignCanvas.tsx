import { Box, Image, LoaderCircle, Sparkles } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { assetUrl } from '../lib/api'
import { isRunning } from './TaskCenter'
import type { Artifact, AssetRecord, DesignDirection, CulturalReference, DesignVersion, GenerationJob } from '../types/workbench'

const ModelViewer = lazy(() => import('./ModelViewer').then((module) => ({ default: module.ModelViewer })))

type Props = { assets?: AssetRecord[]; direction?: DesignDirection; culture?: CulturalReference[]; proposals?: Record<string, unknown>[]; versions: DesignVersion[]; jobs: GenerationJob[]; selectedVersionId: string | null; candidateVersionId: string | null; onSelectVersion: (id: string) => void; onLockCandidate: (id: string) => void | Promise<void>; onGenerate3d?: (id: string) => void; onRetryJob?: (id: string) => void }

function artifactOf(version: DesignVersion | undefined, type: 'image' | 'model') {
  return version?.artifacts.find((item) => type === 'image' ? item.kind === 'image' : item.kind === 'model_glb' || item.kind === 'concept_model')
}
function artifactSource(artifact?: Artifact) {
  if (!artifact) return ''
  if (artifact.url?.startsWith('http://') || artifact.url?.startsWith('https://') || artifact.url?.startsWith('data:')) return artifact.url
  return assetUrl(artifact.id)
}

export function DesignCanvas({ versions, jobs, selectedVersionId, candidateVersionId, onGenerate3d }: Props) {
  const [tab, setTab] = useState<'image' | 'model'>('image')
  const selected = useMemo(() => versions.find((version) => version.id === selectedVersionId) ?? versions.at(-1), [versions, selectedVersionId])
  const imageArtifact = artifactOf(selected, 'image'); const modelArtifact = artifactOf(selected, 'model')
  const activeJob = jobs.find(isRunning)
  const rodinBusy = jobs.some(job => job.kind === 'rodin' && isRunning(job))
  const selectedIsCandidate = Boolean(selected && selected.id === candidateVersionId)
  return <section className="design-canvas-wrap">
    <div className="canvas-toolbar"><div><button className={tab === 'image' ? 'active' : ''} onClick={() => setTab('image')} aria-pressed={tab === 'image'} aria-label="二维概念"><Image size={15} />二维概念</button><button className={tab === 'model' ? 'active' : ''} onClick={() => setTab('model')} aria-pressed={tab === 'model'} aria-label="三维模型"><Box size={15} />三维模型</button></div><span>概念设计 · 非生产 CAD</span></div>
    <div className="artifact-canvas panel-card">
      {activeJob && <div className="generation-status" style={{ position: 'absolute', top: 12, left: 12, right: 12, fontSize: 12 }} role="status"><LoaderCircle className="spin" /><strong>{activeJob.kind === 'image' ? '正在生成二维概念' : '正在生成三维模型'}</strong><span>任务 {activeJob.id.slice(-6)} · 可继续整理设计理解</span></div>}
      {!selected && !activeJob && tab === 'image' && <div className="empty-canvas"><Sparkles size={24} /><h1>让第一句想法变成可讨论的形态</h1><p>在左侧描述想法，AI 会自动寻找参考</p><span>调整右侧参考后，点击“生成二维”。</span></div>}
      {selected && tab === 'image' && (imageArtifact ? <img className="concept-image" src={artifactSource(imageArtifact)} alt={`${selected.label} 二维概念图`} /> : <div className="empty-canvas"><Image /><p>这个版本还没有二维概念图</p><span>请在左侧对话中说明修改并说“生成一版”。</span></div>)}
      {tab === 'model' && !selected && <div className="empty-canvas"><p>需要先锁定二维候选</p><button onClick={() => setTab('image')}>返回二维</button></div>}
      {selected && tab === 'model' && (modelArtifact ? <><Suspense fallback={<div className="viewer-loading">正在启动三维查看器…</div>}><ModelViewer url={artifactSource(modelArtifact)} referenceImageUrl={imageArtifact ? artifactSource(imageArtifact) : undefined} /></Suspense><div className="model-provenance"><strong>{modelArtifact.input_mode === 'image' ? '由二维图生成' : '文字降级生成'}</strong>{modelArtifact.input_mode === 'image' && <span>{modelArtifact.reference_artifact_ids?.length ?? 0} 张参考图</span>}<span>基于二维 {selected.label}</span></div><span className="model-disclaimer">{modelArtifact.disclaimer ?? '概念模型，不是生产 CAD'}</span></> : <div className="empty-canvas"><Box /><p>这个版本还没有三维模型</p>{!imageArtifact && <span>先生成或导入二维概念图</span>}{imageArtifact && !selectedIsCandidate && <span>先锁定这个二维版本为候选</span>}<button disabled={!imageArtifact || !selectedIsCandidate || rodinBusy} onClick={() => imageArtifact && selectedIsCandidate && !rodinBusy && onGenerate3d?.(selected.id)}>用候选版本生成 3D</button><button onClick={() => setTab('image')}>返回二维</button>{rodinBusy && <span>当前项目已有同类生成任务正在进行</span>}<span>概念模型，不是生产 CAD</span></div>)}
    </div>
  </section>
}
