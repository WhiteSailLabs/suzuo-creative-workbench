import { useState } from 'react'
import { assetUrl } from '../lib/api'
import { formatDesignValue } from '../lib/formatDesignValue'
import type { DesignVersion } from '../types/workbench'
export function VersionComparison({ versions }: { versions: DesignVersion[] }) {
  const [leftId, setLeft] = useState(versions.at(-2)?.id ?? '')
  const [rightId, setRight] = useState(versions.at(-1)?.id ?? '')
  if (versions.length < 2) return <p>当前方向至少需要两个版本才能对比</p>
  const left = versions.find(v => v.id === leftId) ?? versions.at(-2)!
  const right = versions.find(v => v.id === rightId && v.id !== left.id) ?? versions.find(v => v.id !== left.id)!
  return <section aria-label="版本对比结果" style={{ width: '100%', maxHeight: '100%', overflow: 'auto' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{([['左侧', left, setLeft], ['右侧', right, setRight]] as const).map(([side, version, select]) => { const image = version.artifacts.find(a => a.kind === 'image'); return <article key={side}><select aria-label={`对比${side}版本`} value={version.id} onChange={e => select(e.target.value)}>{versions.map(v => <option key={v.id} value={v.id} disabled={side === '右侧' && v.id === left.id}>{v.label}</option>)}</select>{image && <img style={{ width: '100%', maxHeight: 280, objectFit: 'contain' }} src={image.url || assetUrl(image.id)} alt={`${version.label} 对比图`} />}<h3>变化</h3><p>{formatDesignValue(version.changed_fields) || '无'}</p><h3>保留</h3><p>{version.preserved_fields.join('、') || '无'}</p><h3>约束</h3><p>{version.constraints.join('、') || '无'}</p></article> })}</div></section>
}
