import { useEffect, useRef, useState } from 'react'
import { getAssetRelations, assetDownloadUrl } from '../lib/api'
import type { AssetRecord, AssetRelations, CulturalReference, GenerationJob } from '../types/workbench'
import { AssetRelationGraph } from './AssetRelationGraph'

export function AssetDetailDrawer({ projectId, asset, culture, jobs, onClose, onOpenAsset }: { projectId: string; asset: AssetRecord; culture: CulturalReference[]; jobs: GenerationJob[]; onClose: () => void; onOpenAsset: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [relations, setRelations] = useState<AssetRelations | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState<'preview' | 'design' | 'relations' | 'delivery'>('preview')
  useEffect(() => { const element = dialog.current; if (element?.showModal) element.showModal(); else element?.setAttribute('open', ''); return () => element?.close?.() }, [])
  useEffect(() => {
    let active = true
    setRelations(null); setError(''); setTab('preview')
    getAssetRelations(projectId, asset.asset_id).then(value => {
      if (active) {
        if (value.asset.project_id !== projectId) { setError('资产不属于当前项目'); return }
        setRelations({ ...value, input_assets: value.input_assets.filter(a => a.project_id === projectId), downstream_models: value.downstream_models.filter(a => a.project_id === projectId) })
      }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : '关系加载失败') })
    return () => { active = false }
  }, [projectId, asset.asset_id, retry])
  const linkedCulture = culture.filter(item => asset.source_culture_ids.includes(item.id))
  return <dialog ref={dialog} role="dialog" aria-modal="true" aria-label="资产详情" onCancel={onClose} style={{ position: 'fixed', margin: 0, left: 'auto', right: 0, top: 0, height: '100dvh', maxHeight: '100dvh', width: 'min(540px,100vw)', maxWidth: '100vw', padding: 24, overflowY: 'auto', zIndex: 100, border: '1px solid #ddd', boxShadow: '-8px 0 32px #0002' }}>
    <button autoFocus onClick={onClose}>关闭详情</button><h2>{asset.title}</h2>
    <div role="tablist" aria-label="资产详情标签" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {([['preview', '预览'], ['design', '设计说明'], ['relations', '来源关系'], ['delivery', '交付状态']] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{label}</button>)}
    </div>
    {tab === 'preview' && <section role="tabpanel" aria-label="预览"><p>类型：{asset.asset_type}</p>{asset.asset_type === 'image' && asset.url && <img src={assetDownloadUrl(asset.url)} alt={asset.title} style={{ width: '100%', maxHeight: 260, objectFit: 'contain' }} />}{asset.asset_type !== 'image' && asset.url && <a href={assetDownloadUrl(asset.url)}>打开资产文件</a>}</section>}
    {tab === 'design' && <section role="tabpanel" aria-label="设计说明"><p>所有者：{asset.owner || '未填写'}</p><p>权利说明：{asset.rights_note || '待确认'}</p><p>材质状态：{asset.material_status || '待确认'}</p><p>关联标签：{asset.tags.length ? asset.tags.join('、') : '暂无'}</p><p>文化依据：{linkedCulture.length ? linkedCulture.map(item => `${item.title}（${item.kind}${item.verified ? '，已核验' : '，待核验'}）`).join('；') : '暂无'}</p></section>}
    {tab === 'relations' && <section role="tabpanel" aria-label="来源关系">{error ? <div role="alert">关系加载失败：{error}<button onClick={() => setRetry(v => v + 1)}>重试关系</button></div> : relations ? <AssetRelationGraph relations={relations} culture={culture} jobs={jobs} onOpenAsset={onOpenAsset} /> : <p role="status">正在加载关系…</p>}</section>}
    {tab === 'delivery' && <section role="tabpanel" aria-label="交付状态"><p>当前状态：{asset.status}</p><p>交付角色：{asset.role || '未指定'}</p><p>媒体格式：{asset.media_type || '未知'}</p>{asset.url && <a href={assetDownloadUrl(asset.url)} download>下载此资产</a>}</section>}
  </dialog>
}
