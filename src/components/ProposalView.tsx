import { AlertTriangle, Printer, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError, getManifest, getProposal } from '../lib/api'
import type { AssetManifest, Proposal, ProposalAudience } from '../types/workbench'
import { DownloadPanel } from './DownloadPanel'

type GateError = { missing: string[]; reason: string; action: string }

export function ProposalView({ projectId, proposal, onClose, onGoToCulture }: { projectId: string; proposal: Proposal; onClose: () => void; onGoToCulture?: () => void }) {
  const [current, setCurrent] = useState(proposal)
  const [audience, setAudience] = useState<ProposalAudience>(proposal.audience ?? 'internal')
  const [manifest, setManifest] = useState<AssetManifest | null>(null)
  const [gateError, setGateError] = useState<GateError | null>(null)
  const [loadingAudience, setLoadingAudience] = useState(false)

  useEffect(() => { setCurrent(proposal); setAudience(proposal.audience ?? 'internal') }, [proposal])
  useEffect(() => { let active = true; void getManifest(projectId, audience).then(value => active && setManifest(value)).catch(() => active && setManifest(null)); return () => { active = false } }, [audience, projectId])

  async function switchAudience(next: ProposalAudience) {
    if (next === audience || loadingAudience) return
    setLoadingAudience(true); setGateError(null)
    try { const nextProposal = await getProposal(projectId, next); setCurrent(nextProposal); setAudience(next); setManifest(null) }
    catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        const detail = typeof reason.detail === 'object' && reason.detail ? reason.detail as Partial<GateError> : {}
        setGateError({ missing: Array.isArray(detail.missing) ? detail.missing : [], reason: detail.reason ?? reason.message, action: detail.action ?? '补齐阶段条件后重试' })
      } else setGateError({ missing: [], reason: reason instanceof Error ? reason.message : '提案加载失败', action: '请稍后重试' })
    } finally { setLoadingAudience(false) }
  }

  return <div className="proposal-backdrop"><article className="proposal-sheet"><header><div><span>SUZHOU CULTURAL CREATIVE CONCEPT</span><h1>{current.project.name}</h1><p>{current.project.product_type} · {current.version.label}</p></div><div className="proposal-actions"><div role="group" aria-label="提案受众"><button aria-pressed={audience === 'internal'} onClick={() => void switchAudience('internal')}>内部提案</button><button aria-pressed={audience === 'customer'} onClick={() => void switchAudience('customer')}>客户提案</button></div><button onClick={() => window.print()}><Printer size={15} />打印 / 导出 PDF</button><button aria-label="关闭提案" onClick={onClose}><X size={18} /></button></div></header>
    {gateError && <div role="alert" style={{ border: '1px solid var(--cinnabar)', padding: 14, margin: '18px 0' }}><strong><AlertTriangle size={16} />客户提案暂时阻塞</strong><p>{gateError.reason}</p>{gateError.missing.length > 0 && <ul>{gateError.missing.map(item => <li key={item}>{item}</li>)}</ul>}<p>{gateError.action}</p>{onGoToCulture && <button onClick={onGoToCulture}>去核验文化资料</button>}</div>}
    {audience === 'internal' && current.culture.some(item => item.warning || item.kind === 'to_verify' || item.original_kind === 'fact') && <p role="status" style={{ border: '1px solid #b7791f', padding: 10 }}>内部提案含待核验内容，仅供内部评审，不可作为确定文化事实。待核验，不可作为确定文化事实</p>}
    <section><h2>设计主张</h2><p>以苏州园林的空间关系转译产品形态，让开口、层次、光影与烟气共同构成体验。</p></section><section><h2>确认的设计要求</h2><div className="proposal-grid">{Object.entries(current.brief).map(([key, value]) => <div key={key}><span>{key}</span><strong>{String(value)}</strong></div>)}</div></section><section><h2>文化依据与设计转译</h2>{current.culture.map(item => <div className="proposal-culture" key={item.id}><strong>{item.title}</strong><p>{item.statement}</p><small>{item.warning ?? (item.source_title ? `来源：${item.source_title}` : `类型：${item.kind}`)}</small></div>)}</section><section><h2>版本说明</h2><p>本轮变化：{JSON.stringify(current.version.changed_fields)}；保留：{current.version.preserved_fields.join('、') || '—'}</p></section><DownloadPanel projectId={projectId} audience={audience} manifest={manifest} /><footer>{current.disclaimer}</footer></article></div>
}
