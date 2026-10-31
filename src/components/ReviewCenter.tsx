import { Check, CircleAlert, MessageSquare, RotateCcw, Send, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createReview, getWorkspace, resolveReview } from '../lib/api'
import type { AssetRecord, DesignVersion, ReviewRecord, ReviewStatus, Workspace } from '../types/workbench'

const statusLabels: Record<ReviewStatus, string> = {
  pending: '待处理', passed: '通过', needs_changes: '需要修改', alternative: '保留备选', rejected: '淘汰',
}

type ReviewCenterProps = {
  projectId: string
  versions?: DesignVersion[]
  assets?: AssetRecord[]
  reviews?: ReviewRecord[]
  workspace?: Workspace
  onBackToWorkbench?: () => void
  onChanged?: () => void | Promise<void>
}

export function ReviewCenter({ projectId, versions: initialVersions = [], assets: initialAssets = [], reviews: initialReviews = [], workspace, onBackToWorkbench, onChanged }: ReviewCenterProps) {
  const [versions, setVersions] = useState(initialVersions)
  const [assets, setAssets] = useState(initialAssets)
  const [reviews, setReviews] = useState(initialReviews)
  const [loading, setLoading] = useState(!workspace && !initialVersions.length && !initialAssets.length && !initialReviews.length)
  const [error, setError] = useState('')
  const [versionId, setVersionId] = useState(initialVersions[0]?.id ?? '')
  const [assetId, setAssetId] = useState(initialAssets[0]?.asset_id ?? '')
  const [region, setRegion] = useState('整体')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (workspace) {
      setVersions(workspace.versions); setAssets(workspace.assets ?? []); setReviews(workspace.reviews ?? []); setLoading(false); return
    }
    if (initialVersions.length || initialAssets.length || initialReviews.length) return
    let active = true
    setLoading(true)
    void getWorkspace(projectId).then((loaded) => {
      if (!active) return
      setVersions(loaded.versions); setAssets(loaded.assets ?? []); setReviews(loaded.reviews ?? []); setVersionId(loaded.versions[0]?.id ?? ''); setAssetId(loaded.assets?.[0]?.asset_id ?? '')
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : '评审数据加载失败')).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [initialAssets, initialReviews, initialVersions, projectId, workspace])

  useEffect(() => {
    if (!versionId && versions[0]) setVersionId(versions[0].id)
    const selectedVersionAssets = assets.filter(asset => asset.version_id === versionId)
    if (!selectedVersionAssets.some(asset => asset.asset_id === assetId)) setAssetId(selectedVersionAssets[0]?.asset_id ?? '')
  }, [assetId, assets, versionId, versions])

  const pending = useMemo(() => reviews.filter(review => review.status === 'pending'), [reviews])
  const selectedVersion = versions.find(version => version.id === versionId)
  const candidateAssets = assets.filter(asset => asset.version_id === versionId)

  async function submitReview() {
    if (busy || !versionId || !comment.trim()) return
    setBusy(true); setError('')
    try {
      const saved = await createReview(projectId, { version_id: versionId, asset_id: assetId || null, direction_id: selectedVersion?.direction_id ?? null, region: region.trim() || '整体', comment: comment.trim() })
      setReviews(current => [...current, saved]); setComment(''); await onChanged?.()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '提交评审失败') }
    finally { setBusy(false) }
  }

  async function updateReview(review: ReviewRecord, status: Exclude<ReviewStatus, 'pending'>) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const saved = await resolveReview(projectId, review.id, status)
      setReviews(current => current.map(item => item.id === saved.id ? saved : item)); await onChanged?.()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '更新评审失败') }
    finally { setBusy(false) }
  }

  return <main className="app-page"><section className="panel-card" style={{ maxWidth: 1180, margin: '0 auto', padding: 24 }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}><div><p style={{ margin: 0, color: 'var(--muted)' }}>内部单人评审</p><h1 style={{ margin: '4px 0' }}>版本评审</h1><p style={{ margin: 0 }}>意见绑定到具体版本、资产和区域，处理后保留可追溯记录。</p></div><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><strong aria-label={`待处理 ${pending.length}`}>待处理 {pending.length}</strong>{onBackToWorkbench && <button onClick={onBackToWorkbench}><RotateCcw size={15} />返回工作台</button>}</div></header>
    {error && <p role="alert"><CircleAlert size={16} />{error}</p>}
    {loading ? <p role="status">正在加载评审…</p> : <>
      <section aria-labelledby="new-review-heading" style={{ marginTop: 24 }}><h2 id="new-review-heading">提交新评审意见</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <label>评审版本<select aria-label="评审版本" value={versionId} onChange={event => setVersionId(event.target.value)}><option value="">选择版本</option>{versions.map(version => <option key={version.id} value={version.id}>{version.label}</option>)}</select></label>
        <label>评审资产<select aria-label="评审资产" value={assetId} onChange={event => setAssetId(event.target.value)}><option value="">整体版本</option>{candidateAssets.map(asset => <option key={asset.asset_id} value={asset.asset_id}>{asset.title}</option>)}</select></label>
        <label>评审区域<input aria-label="评审区域" value={region} onChange={event => setRegion(event.target.value)} /></label>
      </div><label style={{ display: 'block', marginTop: 12 }}>评审意见<textarea aria-label="评审意见" value={comment} onChange={event => setComment(event.target.value)} placeholder="记录变化、保留项或需要补充的地方" rows={3} /></label><button disabled={busy || !versionId || !comment.trim()} onClick={() => void submitReview()}><Send size={15} />提交评审</button></section>
      <section aria-labelledby="review-list-heading" style={{ marginTop: 28 }}><h2 id="review-list-heading">意见记录</h2>{!reviews.length ? <p>还没有评审意见。</p> : <div style={{ display: 'grid', gap: 12 }}>{reviews.map(review => { const version = versions.find(item => item.id === review.version_id); const asset = assets.find(item => item.asset_id === review.asset_id); return <article className="panel-card" aria-label={review.comment} key={review.id} style={{ padding: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><strong>{review.comment}</strong><span>{statusLabels[review.status]}</span></div><p style={{ margin: '8px 0' }}>版本：{version?.label ?? review.version_id} · 资产：{asset?.title ?? review.asset_id ?? '整体'} · 区域：{review.region || '整体'}</p>{review.status === 'pending' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button disabled={busy} onClick={() => void updateReview(review, 'passed')}><Check size={15} />通过</button><button disabled={busy} onClick={() => void updateReview(review, 'needs_changes')}><MessageSquare size={15} />需要修改</button><button disabled={busy} onClick={() => void updateReview(review, 'alternative')}>保留备选</button><button disabled={busy} onClick={() => void updateReview(review, 'rejected')}><X size={15} />淘汰</button></div>}</article> })}</div>}</section>
    </>}
  </section></main>
}
