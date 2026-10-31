import { Check, Circle, LoaderCircle } from 'lucide-react'
import type { WorkbenchStage } from '../types/workbench'
const stages: Array<{ id: WorkbenchStage; label: string; detail: string }> = [
  { id: 'capturing', label: '理解创意', detail: '对话与 Brief' }, { id: 'grounding', label: '文化转译', detail: '来源与设计语言' }, { id: 'concepting', label: '二维概念', detail: '方向与视觉验证' }, { id: 'prototyping', label: '三维生成', detail: '概念模型' }, { id: 'reviewing', label: '版本评审', detail: '修改与候选锁定' }, { id: 'presenting', label: '提案交付', detail: '客户安全内容' },
]
export function StageRail({ current }: { current: WorkbenchStage }) {
  const currentIndex = stages.findIndex((stage) => stage.id === current)
  return <nav className="stage-rail" aria-label="项目流程"><div className="rail-label">项目流程</div>{stages.map((stage, index) => {
    const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'upcoming'
    return <div className={`stage-item ${state}`} aria-current={state === 'active' ? 'step' : undefined} key={stage.id}><span className="stage-icon">{state === 'done' ? <Check size={14} /> : state === 'active' ? <LoaderCircle size={14} /> : <Circle size={12} />}</span><span><strong>{stage.label}</strong><small>{stage.detail}</small></span></div>
  })}</nav>
}
