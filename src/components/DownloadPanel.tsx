import { Download, FileText } from 'lucide-react'
import { assetDownloadUrl, manifestUrl } from '../lib/api'
import type { AssetManifest, ProposalAudience } from '../types/workbench'

export function DownloadPanel({ projectId, audience, manifest }: { projectId: string; audience: ProposalAudience; manifest: AssetManifest | null }) {
  const manifestHref = manifestUrl(projectId, audience)
  const entries = manifest?.assets ?? []
  return <section aria-labelledby="download-heading" style={{ marginTop: 28 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><h2 id="download-heading">资产下载清单</h2><a href={manifestHref} download={`asset-manifest-${audience}.json`}><Download size={15} />下载 manifest</a></div><p>逐项下载本地文件；提案不伪造不存在的压缩包。</p>{!manifest ? <p role="status">正在加载下载清单…</p> : <div style={{ display: 'grid', gap: 8 }}>
    {entries.map(asset => { const href = assetDownloadUrl(asset.url); const label = asset.asset_type === 'image' ? 'PNG' : asset.asset_type === 'model_glb' ? 'GLB' : asset.asset_type; return <div key={asset.asset_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--line)', padding: '10px 0' }}><span><strong>{label}</strong> · {asset.title}<small style={{ display: 'block', color: 'var(--muted)' }}>{asset.version_label} · {asset.status}</small></span>{href ? <a href={href} download>下载 {asset.title}</a> : <span>暂无本地文件</span>}</div> })}
    <div><FileText size={15} />Brief、文化、版本历史：随 manifest 提供</div><a href={manifestHref} download>下载 Brief / 文化 / 版本 manifest</a>
  </div>}
  </section>
}
