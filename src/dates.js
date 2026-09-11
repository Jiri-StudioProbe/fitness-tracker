export function toISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

function ordinal(n) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

// e.g. "Monday 7th September" — used for the Day sheet's header.
export function formatDayHeader(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
  const month = d.toLocaleDateString('en-GB', { month: 'long' })
  return `${weekday} ${ordinal(d.getDate())} ${month}`
}

export function shortDayName(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' })
}
