export function relativeDate(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

export function progressBar(done: number, total: number, width = 8): string {
  if (total === 0) return '─'.repeat(width)
  const filled = Math.round((done / total) * width)
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

export function truncate(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text
  if (maxWidth <= 1) return '…'
  return text.slice(0, maxWidth - 1) + '…'
}

export const STATUS_ICON: Record<string, string> = {
  pending: '○',
  'in-progress': '◉',
  review: '◈',
  done: '✓',
  error: '✗',
}

export const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'red',
  high: 'yellow',
  medium: 'white',
  low: 'gray',
}
