import { useEffect, useRef, useState } from 'react'
import type { DesignResource } from '../lib/api'
import { searchResources } from '../lib/api'

type Props = { projectId: string; query: string; selected: DesignResource[]; onSelect: (resources: DesignResource[]) => void; onBusy: (busy: boolean) => void }
export function ResourcePanel({ projectId, query, selected, onSelect, onBusy }: Props) {
  const [text, setText] = useState(query)
  const [results, setResults] = useState<DesignResource[]>([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const requestId = useRef(0)
  const search = async (value: string) => {
    const id = ++requestId.current
    setBusy(true); onBusy(true); setNotice('')
    try {
      const result = await searchResources(projectId, value)
      if (id !== requestId.current) return
      if (!Array.isArray(result.resources)) throw new Error('无效的资源响应')
      setResults(result.resources); setNotice(result.warning || (!result.resources.length ? '没有找到资源，换个关键词试试；也可以不引用资源生成。' : ''))
      // Search is automatic; choosing a reference remains the only human step.
    } catch { if (id === requestId.current) setNotice('资源搜索失败，请重试。') }
    finally { if (id === requestId.current) { setBusy(false); onBusy(false) } }
  }
  useEffect(() => { setText(query); void search(query); return () => { requestId.current++; onBusy(false) } }, [projectId, query]) // request identity prevents old project/search results from leaking
  const toggle = (resource: DesignResource) => onSelect(selected.some(r => r.id === resource.id) ? selected.filter(r => r.id !== resource.id) : [...selected, resource].slice(0, 6))
  return <section className="resource-panel panel-card"><header><span className="eyebrow">SUZHOU MATERIAL ENGINE</span><h2>AI 素材引擎</h2><p>本地苏州素材库已就绪，输入想法后会自动调整推荐。</p></header>
    <form onSubmit={e => { e.preventDefault(); if (text.trim()) void search(text.trim()) }} className="resource-search"><input aria-label="搜索设计资源" placeholder="文化、造型、材质参考…" value={text} onChange={e => setText(e.target.value)} /><button disabled={busy || !text.trim()}>搜索</button></form>
    {selected.length > 0 && <div className="selected-resources"><strong>本轮参考 · {selected.length}</strong>{selected.map(r => <button key={r.id} onClick={() => toggle(r)} title="点击移除">{r.title} ×</button>)}</div>}
    {busy && <p role="status">正在寻找设计资源…</p>}{notice && <p role="status" className="resource-notice">{notice}</p>}
    <div className="resource-grid">{results.map(r => <article key={r.id} className="resource-item">{r.image_url ? <img src={r.image_url} alt={r.title} loading="lazy" /> : <div className="resource-text-preview">{r.title}<small>{r.description}</small></div>}<strong>{r.title}</strong><small>{r.agent_reason || r.description}</small><small className="resource-meta">{r.source}{r.license ? ` · ${r.license}` : ''}</small>{r.source_url && <a className="resource-source" href={r.source_url} target="_blank" rel="noreferrer">查看原始来源 ↗</a>}<button aria-pressed={selected.some(item => item.id === r.id)} onClick={() => toggle(r)}>{selected.some(item => item.id === r.id) ? '已选择' : '选择素材'}</button></article>)}</div>
  </section>
}
