const VALID_INTENSITIES = ['hard', 'medium', 'easy']
const VALID_MODALITIES = ['push', 'row', 'run', 'swim']
const VALID_LOG_TYPES = ['sets', 'single', 'completion']
const VALID_SCHEDULES = ['daily', 'preLoadingSession', 'postLoadingSession']

export function validatePlan(raw) {
  const errors = []

  if (!raw || typeof raw !== 'object') return { valid: false, errors: ['Not a valid JSON object'] }

  const p = raw.plan
  if (!p) errors.push({ path: 'plan', msg: 'Missing top-level "plan" object' })
  else {
    if (!p.id) errors.push({ path: 'plan.id', msg: 'Missing plan id', repair: 'text' })
    if (!p.startDate) errors.push({ path: 'plan.startDate', msg: 'Missing startDate', repair: 'text' })
    if (!p.endDate) errors.push({ path: 'plan.endDate', msg: 'Missing endDate', repair: 'text' })
  }

  const sessions = raw.sessionTypes
  if (!Array.isArray(sessions) || sessions.length === 0) {
    errors.push({ path: 'sessionTypes', msg: 'Missing or empty sessionTypes array' })
  } else {
    sessions.forEach((s, i) => {
      if (!s.id) errors.push({ path: `sessionTypes[${i}].id`, msg: 'Missing id', repair: 'text' })
      if (!s.name) errors.push({ path: `sessionTypes[${i}].name`, msg: 'Missing name', repair: 'text' })
      if (s.tags?.intensity && !VALID_INTENSITIES.includes(s.tags.intensity)) {
        errors.push({
          path: `sessionTypes[${i}].tags.intensity`,
          msg: `Invalid intensity "${s.tags.intensity}"`,
          repair: 'choice',
          options: VALID_INTENSITIES
        })
      }
      if (s.tags?.modality && !VALID_MODALITIES.includes(s.tags.modality)) {
        errors.push({
          path: `sessionTypes[${i}].tags.modality`,
          msg: `Invalid modality "${s.tags.modality}"`,
          repair: 'choice',
          options: VALID_MODALITIES
        })
      }
      if (s.log?.type && !VALID_LOG_TYPES.includes(s.log.type)) {
        errors.push({
          path: `sessionTypes[${i}].log.type`,
          msg: `Invalid log type "${s.log.type}"`,
          repair: 'choice',
          options: VALID_LOG_TYPES
        })
      }
    })
  }

  const supplements = raw.supplements
  if (Array.isArray(supplements)) {
    supplements.forEach((s, i) => {
      if (!s.name) errors.push({ path: `supplements[${i}].name`, msg: 'Missing name', repair: 'text' })
      if (s.schedule && !VALID_SCHEDULES.includes(s.schedule)) {
        errors.push({
          path: `supplements[${i}].schedule`,
          msg: `Invalid schedule "${s.schedule}"`,
          repair: 'choice',
          options: VALID_SCHEDULES
        })
      }
    })
  }

  return { valid: errors.length === 0, errors }
}

export function applyRepair(raw, path, value) {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  let obj = raw
  for (let i = 0; i < keys.length - 1; i++) {
    obj = obj[keys[i]]
  }
  obj[keys[keys.length - 1]] = value
  return raw
}

export function getSessionById(plan, id) {
  return plan.sessionTypes.find(s => s.id === id) ?? null
}

export function getPhaseForDate(plan, dateStr) {
  if (!plan.phases) return null
  return plan.phases.find(ph => dateStr >= ph.dateRange[0] && dateStr <= ph.dateRange[1]) ?? null
}

export function getSupplementsForDay(plan, sessionId) {
  if (!plan.supplements) return []
  const session = sessionId ? getSessionById(plan, sessionId) : null
  const isLoading = session?.isLoadingSession ?? false

  return plan.supplements.filter(s => {
    if (s.schedule === 'daily') return true
    if (s.schedule === 'preLoadingSession' || s.schedule === 'postLoadingSession') return isLoading
    return false
  }).map(s => ({
    ...s,
    timing: s.schedule === 'preLoadingSession'
      ? `${Math.abs(s.offsetMin ?? 0)} min before`
      : s.schedule === 'postLoadingSession'
      ? 'After session'
      : 'Daily'
  }))
}
