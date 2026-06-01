export function toISO(date) {
  return date.toISOString().slice(0, 10)
}

export function today() {
  return toISO(new Date())
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day // back to Monday
  d.setDate(d.getDate() + diff)
  return toISO(d)
}

export function weekDates(mondayStr) {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i))
}

export function prevWeek(mondayStr) {
  return addDays(mondayStr, -7)
}

export function nextWeek(mondayStr) {
  return addDays(mondayStr, 7)
}

export function formatDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
}

export function formatMonth(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function formatWeekRange(mondayStr) {
  const sunday = addDays(mondayStr, 6)
  const from = new Date(mondayStr + 'T00:00:00')
  const to = new Date(sunday + 'T00:00:00')
  const fromStr = from.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const toStr = to.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${fromStr} – ${toStr}`
}

export function dayName(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long' })
}

export function shortDayName(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' })
}
