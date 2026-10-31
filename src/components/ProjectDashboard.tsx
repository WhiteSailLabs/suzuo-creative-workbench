import type { ProjectSummary, WorkbenchStage } from '../types/workbench'
const stageLabels: Record<WorkbenchStage, string> = { capturing: '设计理解', grounding: '文化依据', concepting: '二维概念', prototyping: '三维验证', reviewing: '版本评审', presenting: '提案交付', archived: '已归档' }
export function ProjectDashboard({ projects, onOpenProject }: { projects: ProjectSummary[]; onOpenProject: (id: string) => void }) {
  return <main className="app-page"><section className="project-dashboard" aria-labelledby="projects-heading">
    <h1 id="projects-heading">我的项目</h1>
    <p>从文化线索出发，继续你的设计。</p>
    {projects.length ? <><p>待处理：{projects.reduce((count, project) => count + project.pending_count, 0)} 项</p><div className="project-grid">{projects.map(project => <article className="project-card panel-card" key={project.id} aria-label={project.name}>
      <span className="eyebrow">文创项目</span><h2>{project.name}</h2><p>{project.product_type || '产品类型待定义'}</p>
      <dl><dt>当前阶段</dt><dd>{stageLabels[project.stage]}</dd><dt>最新版本</dt><dd>{project.latest_version_label ?? '尚无版本'}</dd></dl>
      <p>二维 {project.image_count} · 三维 {project.model_count}</p><p>待处理 {project.pending_count}</p>
      <time dateTime={project.updated_at}>最近修改：{project.updated_at ? new Date(project.updated_at).toLocaleString('zh-CN') : '暂无记录'}</time>
      <button aria-label={`${project.latest_version_id ? '进入工作台' : '开始设计'}：${project.name}`} onClick={() => onOpenProject(project.id)}>{project.latest_version_id ? '进入工作台' : '开始设计'}</button>
    </article>)}</div></> : <div className="empty-projects panel-card"><h2>还没有项目</h2><p>项目准备好后会显示在这里；可从顶部工作台继续当前项目。</p></div>}
  </section></main>
}
