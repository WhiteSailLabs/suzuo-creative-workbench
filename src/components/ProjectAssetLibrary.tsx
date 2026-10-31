import { useEffect, useState } from 'react'
import type { ProjectSummary, Workspace } from '../types/workbench'
import { assetDownloadUrl, getWorkspace } from '../lib/api'
import { ModelViewer } from './ModelViewer'

export function ProjectAssetLibrary({ projects, onOpenProject }: { projects: ProjectSummary[]; onOpenProject: (id: string) => void }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { let active = true; setLoading(true); Promise.all(projects.map(project => getWorkspace(project.id))).then(items => { if (active) setWorkspaces(items) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [projects])
  return <main className="app-page"><section className="model-library" aria-labelledby="project-assets-heading"><header className="model-library-header"><div><span className="eyebrow">PROJECT ASSETS</span><h1 id="project-assets-heading">资产</h1><p>每个项目对应一个三维作品</p></div></header>{loading ? <p role="status">正在加载项目资产…</p> : <div className="project-asset-grid">{workspaces.map(workspace => { const project = workspace.project; const candidateVersionId = project.candidate_version_id ?? workspace.versions.find(version => version.status === 'selected')?.id; const model = workspace.assets?.find(asset => asset.asset_type === 'model_glb' && asset.version_id === candidateVersionId && asset.url && ['completed', 'selected', 'published'].includes(asset.status)); return <article className="project-asset-card panel-card" key={project.id} aria-label={project.name} onClick={() => onOpenProject(project.id)}><div className="project-asset-preview">{model ? <ModelViewer url={assetDownloadUrl(model.url)} /> : <div className="model-library-empty">暂无三维模型</div>}</div><h2>{project.name}</h2></article> })}</div>}</section></main>
}
