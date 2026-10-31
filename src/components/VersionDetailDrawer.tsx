import { useEffect, useRef } from 'react'
import { formatDesignValue } from '../lib/formatDesignValue'
import type { DesignVersion, GenerationJob } from '../types/workbench'

export function VersionDetailDrawer({ version, parent, jobs, onClose }: { version: DesignVersion; parent: DesignVersion | null; jobs: GenerationJob[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const relatedJobs = jobs.filter(job => job.version_id === version.id || job.base_version_id === version.id)
  useEffect(() => {
    const element = dialog.current
    if (element?.showModal) element.showModal()
    else element?.setAttribute('open', '')
    return () => element?.close?.()
  }, [])
  return <dialog ref={dialog} role="dialog" aria-modal="true" aria-label={`版本详情-${version.label}`} onCancel={onClose} style={{ position: 'fixed', margin: 0, left: 'auto', right: 0, top: 0, height: '100dvh', maxHeight: '100dvh', width: 'min(520px,100vw)', maxWidth: '100vw', padding: 24, overflowY: 'auto', zIndex: 101, border: '1px solid #ddd', boxShadow: '-8px 0 32px #0002' }}>
    <button autoFocus onClick={onClose}>关闭版本详情</button>
    <h2>{version.label} · 版本详情</h2>
    <section aria-label="版本信息"><p>状态：{version.status}</p><p>父版本：{parent?.label ?? '无'}</p><p>Brief：第 {version.brief_revision} 版</p><p>来源对话：{version.source_turn_id ?? '未记录'}</p><p>修改来源对话：{version.change_source_turn_id ?? '未记录'}</p></section>
    <section aria-label="设计变化"><h3>设计变化</h3>{Object.keys(version.changed_fields).length ? <ul>{Object.entries(version.changed_fields).map(([key, value]) => <li key={key}><strong>{key}</strong>：{formatDesignValue(value)}</li>)}</ul> : <p>暂无变化记录</p>}<h3>保留内容</h3>{version.preserved_fields.length ? <ul>{version.preserved_fields.map(item => <li key={item}>{item}</li>)}</ul> : <p>暂无明确保留项</p>}<h3>约束</h3>{version.constraints.length ? <ul>{version.constraints.map(item => <li key={item}>{item}</li>)}</ul> : <p>暂无约束</p>}</section>
    <section aria-label="生成任务"><h3>生成任务与 Prompt</h3>{relatedJobs.length ? <ul>{relatedJobs.map(job => <li key={job.id}><strong>{job.kind === 'image' ? '二维' : '三维'} · {job.status}</strong><span> · {job.id}</span><p>{job.prompt || '未记录 Prompt'}</p></li>)}</ul> : <p>暂无关联生成任务</p>}</section>
    <section aria-label="产物"><h3>版本产物</h3>{version.artifacts.length ? <ul>{version.artifacts.map(artifact => <li key={artifact.id}>{artifact.kind} · {artifact.id}{artifact.input_mode ? ` · ${artifact.input_mode}` : ''}</li>)}</ul> : <p>暂无产物</p>}</section>
  </dialog>
}
