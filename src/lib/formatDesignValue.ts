export function formatDesignValue(value: unknown): string {
  if (value === null || value === undefined) return '待确认'
  if (Array.isArray(value)) return value.map(formatDesignValue).join('、')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => `${key.replaceAll('_', ' ')}：${formatDesignValue(nested)}`)
      .join('；')
  }
  return String(value)
}
