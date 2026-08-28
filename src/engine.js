// Pure recommendation engine: (plan, dayRecords) -> per-session flags for a given date

export const FLAG = {
  OK: 'ok',
  CONSECUTIVE_HARD: 'two-hard-in-a-row',
  CONSECUTIVE_RUN: 'two-runs-in-a-row',
  REST_SUGGESTED: 'rest-suggested-after-hard',
}

function getRecord(dayRecords, date) {
  return dayRecords[date] ?? null
}

function sessionForRecord(plan, record) {
  if (!record) return null
  if (record.activityType === 'rest') return plan.sessionTypes.find(s => s.isRest) ?? null
  if (record.activityType === 'custom') return null
  return plan.sessionTypes.find(s => s.id === record.activityId) ?? null
}

export function recommendDay(plan, dayRecords, targetDate) {
  const dates = Object.keys(dayRecords).sort()
  const before = dates.filter(d => d < targetDate)
  const prevDate = before[before.length - 1] ?? null
  const prevRecord = prevDate ? getRecord(dayRecords, prevDate) : null
  const prevSession = sessionForRecord(plan, prevRecord)

  const results = []

  for (const session of plan.sessionTypes) {
    const flags = []

    if (prevSession && !prevSession.isRest) {
      const prevHard = prevSession.tags?.intensity === 'hard'
      const thisHard = session.tags?.intensity === 'hard'
      const prevRun = prevSession.tags?.modality === 'run'
      const thisRun = session.tags?.modality === 'run'

      if (prevHard && thisHard) flags.push(FLAG.CONSECUTIVE_HARD)
      if (prevRun && thisRun) flags.push(FLAG.CONSECUTIVE_RUN)
    }

    results.push({
      session,
      flags,
      recommended: flags.length === 0
    })
  }

  return results
}

export function weekBanners(plan, dayRecords, weekDates) {
  const banners = []

  // Row backbone check
  const rowRule = plan.recommendations?.find(r => r.type === 'minPerWeek' && r.session === 'row')
  if (rowRule) {
    const hasRow = weekDates.some(d => dayRecords[d]?.activityId === 'row')
    if (!hasRow) banners.push({ type: 'missing-row', label: 'No row this week yet' })
  }

  // Consecutive hard check across week
  let prevHard = false
  for (const date of weekDates) {
    const rec = dayRecords[date]
    if (!rec) { prevHard = false; continue }
    const session = sessionForRecord(plan, rec)
    const isHard = session?.tags?.intensity === 'hard'
    if (isHard && prevHard) {
      banners.push({ type: 'consecutive-hard', label: 'Two hard sessions back to back' })
      break
    }
    prevHard = isHard
  }

  return banners
}

export function weekStats(plan, dayRecords, weekDates) {
  const assigned = weekDates.filter(d => dayRecords[d]?.activityId || dayRecords[d]?.activityType).length
  const completed = weekDates.filter(d => dayRecords[d]?.completed).length
  const target = plan.weeklyTargetSessions ?? 5
  const hasRow = weekDates.some(d => dayRecords[d]?.activityId === 'row')
  return { assigned, completed, target, hasRow }
}
