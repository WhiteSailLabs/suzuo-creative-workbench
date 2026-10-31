import type { DesignDirection } from '../types/workbench'
export function DirectionSwitcher({ directions, selectedId, onSelect }: { directions: DesignDirection[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return <label className="direction-switcher">当前方向 <select aria-label="当前方向" value={selectedId ?? ''} onChange={event => onSelect(event.target.value)}>{!directions.length && <option value="">默认方向</option>}{directions.map(direction => <option key={direction.id} value={direction.id}>{direction.name}</option>)}</select></label>
}
