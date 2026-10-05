// Days are stored as local 'YYYY-MM-DD' strings, so a meal logged at 11pm
// stays on the day you ate it regardless of UTC.

export function toKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key, n) {
  const date = fromKey(key)
  date.setDate(date.getDate() + n)
  return toKey(date)
}

export function daysBetween(a, b) {
  return Math.round((fromKey(b) - fromKey(a)) / 86400000)
}

export function formatDay(key, { long = false } = {}) {
  const today = toKey()
  if (key === today) return 'Today'
  if (key === addDays(today, -1)) return 'Yesterday'
  return fromKey(key).toLocaleDateString('en-US', {
    weekday: long ? 'long' : 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatShort(key) {
  return fromKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
