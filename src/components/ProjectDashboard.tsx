import { useState, type FormEvent } from 'react'
import { createProject } from '../lib/api'
import type { ProjectCreate, ProjectSummary, WorkbenchStage, Workspace } from '../types/workbench'

const stageLabels: Record<WorkbenchStage, string> = { capturing: '设计理解', grounding: '文化依据', concepting: '二维概念', prototyping: '三维验证', reviewing: '版本评审', presenting: '提案交付', archived: '已归档' }

export function parseProjectIdea(idea: string): ProjectCreate {
  const name = idea.trim().replace(/[。！？!?]+$/, '')
  const productType = ([
    ['香插', /香插|香薰|香炉/],
    ['收纳盒', /收纳盒|收纳/],
    ['桌面灯', /桌面灯|台灯|灯具|灯/],
    ['文具', /文具|笔筒|书签/],
    ['摆件', /摆件|雕塑|装饰品/],
  ] as Array<[string, RegExp]>).find(([, pattern]) => pattern.test(name))?.[0] ?? '待定义'
  const targetUser = name.match(/(?:给|面向|适合|服务于)([^，。；;,、]{2,12}?)(?:使用|用户|的人|的)?(?:做|制作|设计|开发|$)/)?.[1]?.replace(/的$/, '')
    ?? (name.match(/年轻(?:人|用户)/)?.[0] ?? '')
  const useScene = name.match(/(?:放在|用于|适合|摆在)([^，。；;,、]{2,12}?)(?:上|里|中|使用|场景|$)/)?.[1]
    ?? (name.match(/(书桌|桌面|办公桌|客厅|卧室|玄关|茶席|居家)/)?.[1] ?? '')
  return { name: name || '未命名文创项目', product_type: productType, ...(targetUser ? { target_user: targetUser } : {}), ...(useScene ? { use_scene: useScene } : {}) }
}

type ProjectDashboardProps = { projects: ProjectSummary[]; onOpenProject: (id: string) => void; onProjectCreated?: (id: string) => void }

export function ProjectDashboard({ projects, onOpenProject, onProjectCreated }: ProjectDashboardProps) {
  const [idea, setIdea] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedIdea = idea.trim()
    if (!trimmedIdea) { setError('先说说你想做什么，再创建项目。'); setNotice(''); return }
    setCreating(true); setError(''); setNotice('')
    try {
      const workspace = await createProject(parseProjectIdea(trimmedIdea))
      const projectId = (workspace as Workspace)?.project?.id
      if (!projectId) throw new Error('项目创建成功，但没有拿到项目编号')
      setNotice('项目已创建，正在打开工作台…')
      setIdea('')
      onProjectCreated?.(projectId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '项目创建失败，请稍后重试')
    } finally { setCreating(false) }
  }

  return <main className="app-page"><section className="project-dashboard" aria-labelledby="projects-heading">
    <h1 id="projects-heading">我的项目</h1>
    <p>从文化线索出发，继续你的设计。</p>
    <form className="project-create panel-card" onSubmit={handleCreate} aria-label="一句话创建项目">
      <div><span className="eyebrow">从一句话开始</span><h2>创建一个新的文创项目</h2><p>不用填长表单，先说清楚你想做什么，后续在工作台里继续补充。</p></div>
      <div className="project-create-controls"><label htmlFor="project-idea">一句话创建项目</label><textarea id="project-idea" rows={2} value={idea} onChange={event => { setIdea(event.target.value); if (error) setError(''); if (notice) setNotice('') }} placeholder="例如：做一个年轻人使用的苏州园林香插" disabled={creating} /><button type="submit" disabled={creating}>{creating ? '正在创建…' : '创建项目'}</button></div>
      {error && <p className="project-create-error" role="alert">{error}</p>}{notice && <p className="project-create-notice" role="status">{notice}</p>}
    </form>
    {projects.length ? <><p>待处理：{projects.reduce((count, project) => count + project.pending_count, 0)} 项</p><div className="project-grid">{projects.map(project => <article className="project-card panel-card" key={project.id} aria-label={project.name}>
      <span className="eyebrow">文创项目</span><h2>{project.name}</h2><p>{project.product_type || '产品类型待定义'}</p>
      <dl><dt>当前阶段</dt><dd>{stageLabels[project.stage]}</dd><dt>最新版本</dt><dd>{project.latest_version_label ?? '尚无版本'}</dd></dl>
      <p>二维 {project.image_count} · 三维 {project.model_count}</p><p>待处理 {project.pending_count}</p>
      <time dateTime={project.updated_at}>最近修改：{project.updated_at ? new Date(project.updated_at).toLocaleString('zh-CN') : '暂无记录'}</time>
      <button aria-label={`${project.latest_version_id ? '进入工作台' : '开始设计'}：${project.name}`} onClick={() => onOpenProject(project.id)}>{project.latest_version_id ? '进入工作台' : '开始设计'}</button>
    </article>)}</div></> : <div className="empty-projects panel-card"><h2>还没有项目</h2><p>项目准备好后会显示在这里；可从顶部工作台继续当前项目。</p></div>}
  </section></main>
}
