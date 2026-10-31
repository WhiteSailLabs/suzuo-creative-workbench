import type { DesignDirection } from '../types/workbench'
export function DirectionSwitcher({ directions, selectedId, busy = false, onSelect }: { directions: DesignDirection[]; selectedId: string | null; busy?: boolean; onSelect: (id: string) => void }) {
  return <label className="direction-switcher">当前方向 <select aria-label="当前方向" disabled={busy} aria-busy={busy} value={selectedId ?? ''} onChange={event => onSelect(event.target.value)}>{!directions.length && <option value="">默认方向</option>}{directions.map(direction => <option key={direction.id} value={direction.id}>{direction.name}</option>)}</select></label>
}
