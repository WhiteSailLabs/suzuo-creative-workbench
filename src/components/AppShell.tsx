import { useEffect, useState, type ReactNode } from 'react'
import type { AppView, ProjectSummary, Workspace } from '../types/workbench'
import { ProductTour } from './ProductTour'

const navigation: Array<[AppView, string]> = [['projects', '项目'], ['workbench', '工作台'], ['works', '作品'], ['assets', '资产'], ['reviews', '版本评审'], ['proposal', '提案']]
export function AppShell({ view, onNavigate, projects, projectId, project, onSelectProject, offline, children }: {
  view: AppView; onNavigate: (view: AppView) => void; projects: ProjectSummary[]; projectId: string
  project?: Workspace['project']; onSelectProject: (id: string) => void; offline: boolean; children: ReactNode
}) {
  const options = projects.some(item => item.id === projectId) ? projects : project ? [project, ...projects] : projects
  const [tourOpen, setTourOpen] = useState(false)
  const [viewportTooSmall, setViewportTooSmall] = useState(false)

  useEffect(() => {
    if (view !== 'workbench') return
    let seen = false
    try { seen = window.sessionStorage.getItem('suzuo-product-tour-seen') === '1' } catch { /* storage can be unavailable in private contexts */ }
    if (!seen) setTourOpen(true)
  }, [view])

  useEffect(() => {
    const update = () => setViewportTooSmall(window.innerWidth < 1280 || window.innerHeight < 720)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const closeTour = (reason?: 'skip' | 'complete' | 'escape' | 'close') => {
    setTourOpen(false)
    if (reason === 'skip' || reason === 'complete') {
      try { window.sessionStorage.setItem('suzuo-product-tour-seen', '1') } catch { /* ignore storage errors */ }
    }
  }

  return <div className="workbench-shell">
    <style>{`
      .global-header{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:12px 24px;border-bottom:1px solid var(--line);background:var(--paper)}
      .global-header .brand{flex:none}.global-nav{display:flex;flex-wrap:wrap;gap:4px;flex:1}.global-nav button{padding:9px 11px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--ink)}
      .global-nav button[aria-current=page]{border-color:var(--pine);font-weight:700;background:#e8eee8}.global-nav button[aria-current=page]::after{content:' · 当前';font-size:10px}
      .global-header button:focus-visible,.global-header select:focus-visible,.project-dashboard button:focus-visible{outline:3px solid var(--cinnabar);outline-offset:3px}
      .project-context{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12px}.project-context label{display:flex;gap:6px;align-items:center}.project-context select{max-width:240px;padding:7px;background:#fffef9;color:var(--ink);border:1px solid var(--line);border-radius:7px}.project-context small{color:var(--muted)}
      .app-page{padding:28px;overflow:auto;min-height:0;flex:1}.project-dashboard{max-width:1280px;margin:auto}.project-dashboard h1{font-family:var(--serif);font-size:28px}.project-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:18px}.project-card{padding:24px;display:flex;flex-direction:column;gap:12px}.project-card h2{font-size:19px;margin:0}.project-card p{margin:0;color:var(--muted)}.project-card dl{display:grid;grid-template-columns:90px 1fr;gap:8px;margin:0;font-size:13px}.project-card dd{margin:0}.project-card dt{color:var(--muted)}.project-card time{font-size:12px;color:var(--muted)}.project-card button{margin-top:auto;padding:11px 16px;color:white;background:var(--pine);border-radius:8px}.empty-projects{padding:32px}.page-placeholder{max-width:720px;margin:auto;padding:32px}.page-placeholder button{padding:10px;color:white;background:var(--pine);border-radius:8px}
      .project-create{margin:24px 0;padding:20px;display:grid;grid-template-columns:minmax(220px,.8fr) minmax(360px,1.2fr);gap:22px;align-items:center}.project-create h2{margin:5px 0 7px;font-family:var(--serif);font-size:20px}.project-create p{margin:0;color:var(--muted);font-size:12px;line-height:1.65}.project-create-controls{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.project-create-controls label{grid-column:1/-1;color:var(--muted);font-size:11px}.project-create-controls textarea{min-width:0;min-height:72px;padding:10px 11px;resize:vertical;color:var(--ink);background:#fffef9;border:1px solid var(--line);border-radius:8px;line-height:1.5}.project-create-controls button{min-height:42px;padding:10px 16px;color:#fff;background:var(--cinnabar);border-radius:8px;white-space:nowrap}.project-create-controls button:disabled{opacity:.55;cursor:wait}.project-create-error,.project-create-notice{grid-column:1/-1;padding:8px 10px;border-radius:7px}.project-create-error{color:#8d493c;background:#f7e9e5}.project-create-notice{color:#2f684f;background:#e9f1ea}
      @media(max-width:720px){.global-header{padding:12px;gap:10px}.global-nav{order:3;flex-basis:100%}.global-nav button{font-size:12px;padding:8px}.project-context select{max-width:180px}.app-page{padding:16px}.project-create{grid-template-columns:1fr;gap:15px}.project-create-controls{grid-template-columns:1fr}.project-create-controls button{width:100%}}
    `}</style>
    <header className="global-header">
      <div className="brand"><span className="brand-seal">苏</span><strong>苏作创意台</strong></div>
      <nav className="global-nav" aria-label="全局导航">{navigation.map(([id, label]) => <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => onNavigate(id)}>{label}</button>)}</nav><button className="tour-trigger" type="button" onClick={() => setTourOpen(true)}>产品导览</button>
      <div className="project-context">
        <label>当前项目<select aria-label="当前项目" value={projectId} onChange={event => onSelectProject(event.target.value)}>{!options.some(item => item.id === projectId) && <option value={projectId}>正在读取项目</option>}{options.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <small className={`status-pill ${offline ? 'status-offline' : 'status-synced'}`} role="status">{offline ? '本地服务离线' : project ? '项目已同步' : '正在加载项目'}</small>
        {project && <small className="status-pill status-stage" role="status">{project.stage_status === 'awaiting_confirmation' ? '等待确认' : project.stage_status === 'blocked' ? '阶段阻塞' : project.stage_status === 'done' ? '阶段完成' : '进行中'}</small>}
      </div>
    </header>
    {view === 'workbench' && viewportTooSmall && <div className="viewport-notice" role="alert"><strong>建议扩大窗口</strong><span>当前窗口低于 1280 × 720 的完整工作台尺寸。</span></div>}
    <ProductTour open={tourOpen} onClose={closeTour} />
    {children}
  </div>
}
