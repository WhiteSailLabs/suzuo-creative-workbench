import { useEffect, useRef, useState } from 'react'
import { getAssetRelations, assetDownloadUrl } from '../lib/api'
import type { AssetRecord, AssetRelations, CulturalReference, GenerationJob } from '../types/workbench'
import { AssetRelationGraph } from './AssetRelationGraph'

export function AssetDetailDrawer({ projectId, asset, culture, jobs, onClose, onOpenAsset }: { projectId: string; asset: AssetRecord; culture: CulturalReference[]; jobs: GenerationJob[]; onClose: () => void; onOpenAsset: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [relations, setRelations] = useState<AssetRelations | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => { const element = dialog.current; if (element?.showModal) element.showModal(); else element?.setAttribute('open', ''); return () => element?.close?.() }, [])
  useEffect(() => {
    let active = true
    setRelations(null); setError('')
    getAssetRelations(projectId, asset.asset_id).then(value => {
      if (active) {
        if (value.asset.project_id !== projectId) { setError('资产不属于当前项目'); return }
        setRelations({ ...value, input_assets: value.input_assets.filter(a => a.project_id === projectId), downstream_models: value.downstream_models.filter(a => a.project_id === projectId) })
      }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : '关系加载失败') })
    return () => { active = false }
  }, [projectId, asset.asset_id, retry])
  return <dialog ref={dialog} role="dialog" aria-modal="true" aria-label="资产详情" onCancel={onClose} style={{ position: 'fixed', margin: 0, left: 'auto', right: 0, top: 0, height: '100dvh', maxHeight: '100dvh', width: 'min(540px,100vw)', maxWidth: '100vw', padding: 24, overflowY: 'auto', zIndex: 100, border: '1px solid #ddd', boxShadow: '-8px 0 32px #0002' }}><button autoFocus onClick={onClose}>关闭详情</button><h2>{asset.title}</h2>
    {asset.asset_type === 'image' && asset.url && <img src={assetDownloadUrl(asset.url)} alt={asset.title} style={{ width: '100%', maxHeight: 260, objectFit: 'contain' }} />}
    <p>所有者：{asset.owner || '未填写'}</p><p>权利说明：{asset.rights_note || '待确认'}</p><p>材质状态：{asset.material_status || '待确认'}</p><p>资产状态：{asset.status}</p>
    {error ? <div role="alert">关系加载失败：{error}<button onClick={() => setRetry(v => v + 1)}>重试关系</button></div> : relations ? <AssetRelationGraph relations={relations} culture={culture} jobs={jobs} onOpenAsset={onOpenAsset} /> : <p role="status">正在加载关系…</p>}
  </dialog>
}
