import type { DesignVersion } from '../types/workbench'
export function VersionTimeline({ versions, candidateId, selectedId, onSelect }: { versions: DesignVersion[]; candidateId: string | null; selectedId?: string; onSelect?: (id: string) => void }) {
  return <div className="version-list" aria-label="当前方向版本">{versions.length === 0 ? <p>生成后版本会保存在这里。</p> : versions.map(version => <button aria-pressed={version.id === selectedId} className={version.id === selectedId ? 'active' : ''} key={version.id} onClick={() => onSelect?.(version.id)}>{version.label}{version.id === candidateId && <small>候选</small>}</button>)}</div>
}
