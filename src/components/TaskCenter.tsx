import { useState } from 'react'
import type { GenerationJob } from '../types/workbench'
const labels = { submitted: '排队中', processing: '处理中', failed: '失败', completed: '已完成', stale: '旧版本结果' }
export const isRunning = (job: GenerationJob) => job.status === 'submitted' || job.status === 'processing'
export function TaskCenter({ jobs, onRetry }: { jobs: GenerationJob[]; onRetry: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  return <div className="task-center"><button aria-expanded={open} onClick={() => setOpen(!open)}>任务中心 · {jobs.filter(isRunning).length} 项进行中</button>{open && <section className="panel-card" role="region" aria-label="生成任务"><button onClick={() => setOpen(false)}>关闭任务中心</button><p>关闭面板后任务继续运行</p>{!jobs.length && <p>暂无生成任务</p>}{jobs.map(job => { const blocked = jobs.some(other => other.kind === job.kind && isRunning(other)); return <article key={job.id}><strong>{job.kind === 'image' ? '二维生成' : 'Rodin 三维'} · <span>{labels[job.status]}</span></strong><p>{job.message}</p>{job.status === 'failed' && <><button disabled={blocked} onClick={() => onRetry(job.id)}>重试</button>{blocked && <p>当前项目已有同类生成任务正在进行</p>}</>}</article> })}</section>}</div>
}
