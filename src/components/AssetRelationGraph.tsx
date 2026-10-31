import type { AssetRelations, CulturalReference, GenerationJob } from '../types/workbench'

export function AssetRelationGraph({ relations, culture, jobs, onOpenAsset }: { relations: AssetRelations; culture: CulturalReference[]; jobs: GenerationJob[]; onOpenAsset: (id: string) => void }) {
  const a = relations.asset
  const task = jobs.filter(j => j.artifact_id === a.asset_id || (!j.artifact_id && j.version_id === a.version_id))
  const statuses: Record<string, string> = { completed: '已完成', failed: '失败', processing: '处理中', submitted: '已提交', stale: '已过期' }
  return <section aria-label="资产关系图"><h3>来源与关系</h3><p>来源版本：{relations.version?.label ?? '未关联版本'}</p><p>父版本：{relations.parent_version?.label ?? '无'}</p><ul>
    {a.source_culture_ids.map(id => <li key={id}>文化来源 → {culture.find(c => c.id === id)?.title ?? id}</li>)}
    {relations.version && <li>Brief 修订 {relations.version.brief_revision} → {relations.version.label}</li>}
    {relations.input_assets.map(input => <li key={input.asset_id}><button onClick={() => onOpenAsset(input.asset_id)}>输入{input.asset_type === 'image' ? '二维' : '资产'} → {input.title}</button></li>)}
    <li>当前资产 → {a.title}</li>
    {relations.downstream_models.map(output => <li key={output.asset_id}><button onClick={() => onOpenAsset(output.asset_id)}>输出三维 → {output.title}</button></li>)}
    {task.map(j => <li key={j.id}>生成任务 → {j.id}（{statuses[j.status] ?? j.status}）</li>)}
    {!task.length && <li>生成任务：未关联</li>}
    <li>来源对话 → {a.source_turn_id ?? '未记录'}</li>
  </ul>{relations.version && <details><summary>版本变化与保留</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({ changes: relations.version.changed_fields, preserve: relations.version.preserved_fields, constraints: relations.version.constraints }, null, 2)}</pre></details>}</section>
}
