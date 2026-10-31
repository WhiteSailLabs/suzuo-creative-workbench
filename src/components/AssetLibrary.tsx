import { useEffect, useRef, useState } from 'react'
import { addProposalAsset, assetDownloadUrl, getWorkspace, listAssets, patchAsset, patchCulturalReference } from '../lib/api'
import { AssetDetailDrawer } from './AssetDetailDrawer'
import type { AssetLibraryProps, AssetRecord, CulturalReference } from '../types/workbench'

export const assetTypeLabels: Record<string, string> = { image: '二维图', model_glb: '三维模型', material: '材质', culture: '文化资料', reference: '参考素材', structure: '结构', conversation: '对话', proposal: '提案' }
export const assetStatusLabels: Record<string, string> = { draft: '草稿', reviewing: '评审中', selected: '候选', published: '已发布', archived: '已归档', processing: '处理中', completed: '已完成', failed: '失败', stale: '已过期' }
export const cultureKindLabels: Record<string, string> = { fact: '文化事实', translation: '设计转译', designer_judgment: '设计师判断', generated: '生成内容', to_verify: '待核验' }

export function AssetLibrary({ projectId, projectName, versions, directions, culture, jobs, onAssetsChanged, initialView = 'works' }: AssetLibraryProps) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [operationError, setOperationError] = useState('')
  const [more, setMore] = useState<string | null>(null)
  const [archive, setArchive] = useState<AssetRecord | null>(null)
  const [proposalAssets, setProposalAssets] = useState<string[]>([])
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [view, setView] = useState(initialView)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [filters, setFilters] = useState({ type: '', status: '', direction: '', culture: '', material: '', query: '' })
  const [selected, setSelected] = useState<AssetRecord | null>(null)
  const [candidateAssetId, setCandidateAssetId] = useState<string | null>(null)
  const [cultureItems, setCultureItems] = useState<CulturalReference[]>(culture)
  const [cultureDrafts, setCultureDrafts] = useState<Record<string, CultureDraft>>({})
  const [cultureBusy, setCultureBusy] = useState<string | null>(null)
  const archiveDialog = useRef<HTMLDialogElement>(null)
  const archiveTrigger = useRef<HTMLButtonElement>(null)
  useEffect(() => { setView(initialView) }, [initialView])
  useEffect(() => {
    setCultureItems(culture)
    setCultureDrafts(Object.fromEntries(culture.map(reference => [reference.id, draftFromCulture(reference)])))
  }, [culture])
  useEffect(() => {
    let active = true
    setLoading(true); setAssets([]); setArchive(null); setMore(null); setProposalAssets([]); setCandidateAssetId(null); setNotice(''); setOperationError(''); setSelected(null); setError('')
    Promise.all([listAssets(projectId), getWorkspace(projectId)]).then(([items, workspace]) => { if (active) { if (!Array.isArray(items)) throw new Error('资产列表响应格式无效'); setAssets(items); setProposalAssets(Array.isArray(workspace?.proposal_asset_ids) ? workspace.proposal_asset_ids : []) } }).catch(e => { if (active) setError(e instanceof Error ? e.message : '资产加载失败') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, reload])
  useEffect(() => {
    const dialog = archiveDialog.current
    if (!archive) return
    if (dialog?.showModal) dialog.showModal()
    else dialog?.setAttribute('open', '')
    const focusTarget = dialog?.querySelector<HTMLButtonElement>('[data-autofocus]')
    focusTarget?.focus()
    return () => { if (dialog?.open) dialog.close?.() }
  }, [archive])
  async function changeStatus(a: AssetRecord, status: 'selected' | 'archived') {
    if (busy || a.project_id !== projectId || (status === 'selected' && !canSelectAsset(a, projectId))) return
    setBusy(true); setOperationError(''); setNotice('')
    try {
      const updated = await patchAsset(projectId, a.asset_id, { status })
      if (updated.project_id !== projectId || updated.status !== status) throw new Error('服务器未确认资产状态')
      if (status === 'selected') setCandidateAssetId(a.asset_id)
      const refreshed = status === 'selected' ? await listAssets(projectId) : null
      setAssets(items => Array.isArray(refreshed) ? refreshed : items.map(item => item.asset_id === updated.asset_id ? updated : item))
      setSelected(current => current?.asset_id === updated.asset_id ? updated : current)
      setArchive(null); setNotice(status === 'selected' ? '已设为候选' : '已归档，保留本地文件'); onAssetsChanged?.()
    } catch (e) { setOperationError(e instanceof Error ? e.message : '操作失败，请重试') }
    finally { setBusy(false) }
  }
  async function saveCulture(reference: CulturalReference) {
    const draft = cultureDrafts[reference.id] ?? draftFromCulture(reference)
    const complete = isCultureEvidenceComplete(draft)
    const verify = !reference.verified && complete
    if (cultureBusy || (verify && !complete)) return
    setCultureBusy(reference.id); setOperationError('')
    try {
      const updated = await patchCulturalReference(projectId, reference.id, {
        statement: draft.statement.trim(),
        source_title: draft.source_title.trim(),
        source_url: draft.source_url.trim(),
        note: composeCultureNote(draft.note, draft.verified_at),
        ...(verify ? { verified: true } : {}),
      })
      setCultureItems(items => items.map(item => item.id === updated.id ? updated : item))
      setCultureDrafts(items => ({ ...items, [updated.id]: draftFromCulture(updated) }))
      setNotice('文化资料已更新')
      onAssetsChanged?.()
    } catch (e) { setOperationError(e instanceof Error ? e.message : '文化资料更新失败，请重试') }
    finally { setCultureBusy(null) }
  }
  function updateCultureDraft(referenceId: string, patch: Partial<CultureDraft>) {
    setCultureDrafts(items => {
      const reference = cultureItems.find(item => item.id === referenceId)
      const base = items[referenceId] ?? (reference ? draftFromCulture(reference) : { statement: '', source_title: '', source_url: '', note: '', verified_at: '' })
      return { ...items, [referenceId]: { ...base, ...patch } }
    })
  }
  const local = assets.filter(a => a.project_id === projectId)
  const visible = local.filter(a => (!filters.type || a.asset_type === filters.type) && (!filters.status || a.status === filters.status) && (!filters.direction || a.direction_id === filters.direction) && (!filters.culture || a.source_culture_ids.includes(filters.culture)) && (!filters.material || a.material_status === filters.material || a.tags.includes(filters.material)) && (!filters.query.trim() || [a.title, ...a.tags, a.rights_note].join(' ').toLocaleLowerCase().includes(filters.query.trim().toLocaleLowerCase())))
  const groups = new Map<string, AssetRecord[]>()
  for (const a of visible) {
    const group = view === 'assets' ? assetTypeLabels[a.asset_type] ?? a.asset_type : `${projectName} / ${directions.find(d => d.id === a.direction_id)?.name ?? a.direction_id ?? '未分方向'} / ${versions.find(v => v.id === a.version_id)?.label ?? '未关联版本'}`
    groups.set(group, [...(groups.get(group) ?? []), a])
  }
  const select = (label: string, field: keyof typeof filters, values: string[], names: Record<string, string> = {}) => <label>{label}<select aria-label={label} value={filters[field]} onChange={e => setFilters(f => ({ ...f, [field]: e.target.value }))}><option value="">全部</option>{[...new Set(values)].map(v => <option key={v} value={v}>{names[v] ?? v}</option>)}</select></label>
  return <main className="app-page"><section className="panel-card" style={{ padding: 24 }}><h1>{view === 'works' ? '作品' : '资产'}</h1><p>当前项目：{projectName} · {local.length} 项资产</p><div role="group" aria-label="作品库视图"><button aria-pressed={view === 'works'} onClick={() => setView('works')}>方案视图</button><button aria-pressed={view === 'assets'} onClick={() => setView('assets')}>资产视图</button></div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '18px 0' }}>
      {select('类型', 'type', local.map(a => a.asset_type), assetTypeLabels)}{select('状态', 'status', local.map(a => a.status), assetStatusLabels)}{select('方向', 'direction', local.flatMap(a => a.direction_id ? [a.direction_id] : []), Object.fromEntries(directions.map(d => [d.id, d.name])))}{select('文化元素', 'culture', local.flatMap(a => a.source_culture_ids), Object.fromEntries(culture.map(c => [c.id, c.title])))}{select('材质', 'material', local.flatMap(a => [...(a.material_status ? [a.material_status] : []), ...a.tags]))}
      <label>搜索资产<input type="search" aria-label="搜索资产" placeholder="名称、标签、权利说明" value={filters.query} onChange={e => setFilters(f => ({ ...f, query: e.target.value }))} /></label>
    </div>
    {operationError && <p role="alert">{operationError}</p>}{notice && <p role="status">{notice}</p>}{proposalAssets.length > 0 && <p>提案选材：{proposalAssets.map(id => local.find(a => a.asset_id === id)?.title).filter(Boolean).join('、')}</p>}
    <section className="panel-card" aria-label="文化资料核验" style={{ margin: '18px 0', padding: 18 }}>
      <h2>文化资料核验</h2>
      <p>文化事实必须有来源和摘要后才能进入客户提案。</p>
      {!cultureItems.length ? <p>暂无文化资料</p> : <div style={{ display: 'grid', gap: 12 }}>{cultureItems.map(reference => {
        const draft = cultureDrafts[reference.id] ?? draftFromCulture(reference)
        const editable = reference.kind === 'fact' || reference.kind === 'to_verify'
        const complete = isCultureEvidenceComplete(draft)
        return <article key={reference.id} className="panel-card" style={{ padding: 14 }} aria-label={`文化资料-${reference.title}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}><strong>{reference.title}</strong><span><span>{cultureKindLabels[reference.kind] ?? reference.kind}</span> · <span>{reference.verified ? '已核验' : '待核验'}</span></span></div>
          {editable ? <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <label>来源标题<input aria-label={`来源标题-${reference.title}`} value={draft.source_title} onChange={event => updateCultureDraft(reference.id, { source_title: event.target.value })} /></label>
            <label>来源 URL 或文件标识<input aria-label={`来源 URL 或文件标识-${reference.title}`} value={draft.source_url} onChange={event => updateCultureDraft(reference.id, { source_url: event.target.value })} /></label>
            <label>摘要/说明<textarea aria-label={`摘要/说明-${reference.title}`} value={draft.statement} onChange={event => updateCultureDraft(reference.id, { statement: event.target.value })} /></label>
            <label>核验时间<input type="date" aria-label={`核验时间-${reference.title}`} value={draft.verified_at} onChange={event => updateCultureDraft(reference.id, { verified_at: event.target.value })} /></label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button disabled={cultureBusy === reference.id} onClick={() => void saveCulture(reference)}>保存资料</button>
              {!reference.verified && <button disabled={cultureBusy === reference.id || !complete} onClick={() => void saveCulture(reference)}>标记为已核验-{reference.title}</button>}
            </div>
            {!complete && <small>补齐来源标题、来源 URL/文件标识和摘要后才能核验。</small>}
          </div> : <p>{reference.statement || reference.note || '该资料为设计过程记录，不作为文化事实核验。'}</p>}
        </article>
      })}</div>}
    </section>
    {loading ? <p role="status">正在加载资产…</p> : error ? <div role="alert">资产加载失败：{error}<button onClick={() => setReload(v => v + 1)}>重试</button></div> : !visible.length ? <p>没有符合条件的资产</p> : [...groups].map(([name, items]) => <section key={name}><h2>{name}</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 16 }}>{items.map(a => {
      const version = versions.find(v => v.id === a.version_id)
       return <article className="panel-card" key={a.asset_id} aria-label={a.title} style={{ padding: 16 }}><button onClick={() => setSelected(a)} aria-label={`查看${a.title}`} style={{ display: 'block', width: '100%', textAlign: 'left' }}>{a.asset_type === 'image' && a.url && <img src={assetDownloadUrl(a.url)} alt={a.title} style={{ width: '100%', height: 160, objectFit: 'contain' }} />}<strong>{a.title}</strong></button><p>{assetTypeLabels[a.asset_type] ?? a.asset_type} · {version?.label ?? '未关联版本'}</p><p>父版本：{versions.find(v => v.id === version?.parent_version_id)?.label ?? '无'}</p><p>关联三维：{local.filter(m => m.asset_type === 'model_glb' && m.source_asset_ids.includes(a.asset_id)).length}</p><p>{assetStatusLabels[a.status]}</p><p>{a.source_culture_ids.map(id => { const reference = cultureItems.find(c => c.id === id); if (!reference) return null; const label = reference.kind_label ?? cultureKindLabels[reference.kind] ?? reference.kind; return <span key={id} style={{ marginRight: 8 }}><span>{reference.title}</span> · <span>{label}</span> · <span>{reference.verified ? '已核验' : '待核验'}</span></span> })}</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {canSelectAsset(a, projectId) && !(a.status === 'reviewing' && candidateAssetId === a.asset_id) && <button disabled={busy} onClick={() => void changeStatus(a, 'selected')}>设为候选</button>}
        {canAddProposal(a) && <button disabled={busy} onClick={() => { setBusy(true); setOperationError(''); void addProposalAsset(projectId, a.asset_id).then(result => { setProposalAssets(result.proposal_asset_ids); setNotice('已加入提案') }).catch(e => setOperationError(e instanceof Error ? e.message : '加入提案失败')).finally(() => setBusy(false)) }}>加入提案</button>}
        {assetDownloadUrl(a.url) ? <a href={assetDownloadUrl(a.url)} download>下载</a> : <span>暂无下载文件</span>}
        <button aria-expanded={more === a.asset_id} onClick={() => setMore(current => current === a.asset_id ? null : a.asset_id)}>更多</button>
        {more === a.asset_id && <div><button onClick={() => setSelected(a)}>查看来源</button><button ref={archiveTrigger} disabled={busy || a.status === 'archived'} onClick={() => { archiveTrigger.current = document.activeElement as HTMLButtonElement; setArchive(a) }}>归档</button></div>}
      </div></article>
    })}</div></section>)}
    {selected && <AssetDetailDrawer key={selected.asset_id} projectId={projectId} asset={selected} culture={culture} jobs={jobs} onClose={() => setSelected(null)} onOpenAsset={id => { const target = local.find(a => a.asset_id === id); if (target) setSelected(target) }} />}
    <dialog ref={archiveDialog} role="alertdialog" aria-modal="true" aria-label="确认归档" onCancel={event => { event.preventDefault(); setArchive(null); queueMicrotask(() => archiveTrigger.current?.focus()) }}><h2>确认归档</h2><p>归档“{archive?.title ?? ''}”？保留本地文件，归档后不能设为候选。</p><button data-autofocus disabled={busy} onClick={() => { setArchive(null); queueMicrotask(() => archiveTrigger.current?.focus()) }}>取消</button><button disabled={busy || !archive} onClick={() => archive && void changeStatus(archive, 'archived')}>确认归档</button></dialog>
  </section></main>
}

type CultureDraft = Pick<CulturalReference, 'statement' | 'source_title' | 'source_url' | 'note'> & { verified_at: string }

function draftFromCulture(reference: CulturalReference): CultureDraft {
  const match = reference.note.match(/(?:^|\n)核验时间：([^\n]+)/)
  return { statement: reference.statement, source_title: reference.source_title, source_url: reference.source_url, note: reference.note.replace(/(?:^|\n)核验时间：[^\n]+/, '').trim(), verified_at: match?.[1] ?? '' }
}

function composeCultureNote(note: string, verifiedAt: string) {
  return [note.trim(), verifiedAt ? `核验时间：${verifiedAt}` : ''].filter(Boolean).join('\n')
}

function isCultureEvidenceComplete(draft: CultureDraft) {
  return Boolean(draft.statement.trim() && draft.source_title.trim() && draft.source_url.trim())
}

function canSelectAsset(asset: AssetRecord, projectId: string) {
  return asset.project_id === projectId && ['reviewing', 'completed', 'selected', 'published'].includes(asset.status) && (asset.asset_type !== 'model_glb' || asset.material_status === 'pbr') && !!asset.version_id
}

function canAddProposal(asset: AssetRecord) {
  return !['archived', 'failed', 'stale', 'processing', 'draft'].includes(asset.status)
}
