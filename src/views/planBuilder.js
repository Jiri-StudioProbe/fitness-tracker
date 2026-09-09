import { validatePlan } from '../plan.js'

const DRAFT_KEY = 'planBuilderDraft'

// ── id / slug helpers ────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function slugify(str) {
  return (str || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function num(v) {
  if (v === '' || v === undefined || v === null) return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}

// ── empty / default builders ────────────────────────────────────────

function emptyExercise() {
  return { _id: uid(), name: '', repMode: 'range', repMin: '', repMax: '', target: '', defaultSets: '', track: ['weight', 'reps'] }
}

function emptySessionType() {
  return {
    _id: uid(),
    id: '', name: '', location: '',
    tags: { intensity: 'medium', modality: '', focus: '' },
    isLoadingSession: false,
    isRest: false,
    optional: false,
    log: { type: 'completion', track: [], hasExercises: false, exerciseLabel: '', order: 'sequential', exercises: [] },
  }
}

function emptyRecommendation() {
  return { _id: uid(), type: 'noConsecutiveByTag', tag: 'intensity', value: 'hard', session: '', count: 1, label: '', raw: '{\n  \n}' }
}

function emptyPhase() {
  return { _id: uid(), name: '', start: '', end: '' }
}

function emptySupplement() {
  return { _id: uid(), name: '', dose: '', schedule: 'daily', offsetMin: '' }
}

function defaultData() {
  return {
    plan: { title: '', id: '', startDate: '', endDate: '', weekStartsOn: 'monday', weeklyTargetSessions: 5, rowBackbonePerWeek: 1 },
    sessionTypes: [],
    recommendations: [],
    phases: [],
    supplements: [],
    fasting: { enabled: true, start: '19:00', end: '11:00' },
  }
}

// ── draft persistence ────────────────────────────────────────────────

function saveDraft(data) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)) } catch { /* ignore */ }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
}

// ── import: raw plan JSON -> builder data shape ────────────────────

function importExercise(e) {
  const out = emptyExercise()
  out.name = e.name || ''
  if (e.repRange) { out.repMode = 'range'; out.repMin = e.repRange[0]; out.repMax = e.repRange[1] }
  else if (e.target) { out.repMode = 'target'; out.target = e.target }
  out.defaultSets = e.defaultSets ?? ''
  out.track = Array.isArray(e.track) ? e.track.slice() : []
  return out
}

export function importPlanJson(raw) {
  const s = defaultData()
  if (raw.plan) {
    s.plan.title = raw.plan.title || ''
    s.plan.id = raw.plan.id || ''
    s.plan.startDate = raw.plan.startDate || ''
    s.plan.endDate = raw.plan.endDate || ''
    s.plan.weekStartsOn = raw.plan.weekStartsOn || 'monday'
    s.plan.weeklyTargetSessions = raw.plan.weeklyTargetSessions ?? 5
    s.plan.rowBackbonePerWeek = raw.plan.rowBackbonePerWeek ?? 1
  }
  ;(raw.sessionTypes || []).forEach(st => {
    const ns = emptySessionType()
    ns.id = st.id || ''
    ns.name = st.name || ''
    ns.location = st.location || ''
    ns.isRest = !!st.isRest
    ns.isLoadingSession = !!st.isLoadingSession
    ns.optional = !!st.optional
    if (st.tags) {
      ns.tags.intensity = st.tags.intensity || 'medium'
      ns.tags.modality = st.tags.modality || ''
      ns.tags.focus = st.tags.focus || ''
    }
    if (st.log) {
      ns.log.type = st.log.type || 'completion'
      ns.log.track = Array.isArray(st.log.track) ? st.log.track.slice() : []
      ns.log.exerciseLabel = st.log.exerciseLabel || ''
      ns.log.order = st.log.order || 'sequential'
      const exs = Array.isArray(st.log.exercises) ? st.log.exercises : []
      ns.log.exercises = exs.map(importExercise)
      ns.log.hasExercises = ns.log.type === 'single' && exs.length > 0
    }
    s.sessionTypes.push(ns)
  })
  ;(raw.recommendations || []).forEach(r => {
    const nr = emptyRecommendation()
    if (r.type === 'noConsecutiveByTag' || r.type === 'restAfterHard' || r.type === 'minPerWeek') {
      nr.type = r.type
      nr.tag = r.tag || 'intensity'
      nr.value = r.value || ''
      nr.session = r.session || ''
      nr.count = r.count ?? 1
      nr.label = r.label || ''
    } else {
      nr.type = 'custom'
      nr.raw = JSON.stringify(r, null, 2)
    }
    s.recommendations.push(nr)
  })
  ;(raw.phases || []).forEach(p => {
    const np = emptyPhase()
    np.name = p.name || ''
    if (Array.isArray(p.dateRange)) { np.start = p.dateRange[0] || ''; np.end = p.dateRange[1] || '' }
    s.phases.push(np)
  })
  ;(raw.supplements || []).forEach(sp => {
    const ns = emptySupplement()
    ns.name = sp.name || ''
    ns.dose = sp.dose || ''
    ns.schedule = sp.schedule || 'daily'
    ns.offsetMin = sp.offsetMin ?? ''
    s.supplements.push(ns)
  })
  if (raw.fasting) {
    s.fasting.enabled = raw.fasting.enabled !== false
    if (raw.fasting.window) {
      s.fasting.start = raw.fasting.window.start || ''
      s.fasting.end = raw.fasting.window.end || ''
    }
  }
  return s
}

// ── export: builder data shape -> raw plan JSON ─────────────────────

function buildExercise(ex) {
  const out = { name: ex.name || '' }
  if (ex.repMode === 'range' && (ex.repMin !== '' || ex.repMax !== '')) {
    out.repRange = [num(ex.repMin) ?? 0, num(ex.repMax) ?? 0]
  } else if (ex.repMode === 'target' && ex.target) {
    out.target = ex.target
  }
  const ds = num(ex.defaultSets)
  if (ds !== undefined) out.defaultSets = ds
  out.track = ex.track && ex.track.length ? ex.track.slice() : ['done']
  return out
}

function buildLog(log, isRest) {
  if (isRest) return undefined
  const out = { type: log.type }
  if (log.type === 'completion') return out
  if (log.type === 'single') {
    out.track = log.track.slice()
    if (log.hasExercises && log.exercises.length) {
      if (log.exerciseLabel) out.exerciseLabel = log.exerciseLabel
      out.order = log.order
      out.exercises = log.exercises.map(buildExercise)
    }
    return out
  }
  if (log.type === 'sets') {
    out.exercises = log.exercises.map(buildExercise)
    if (log.exerciseLabel) out.exerciseLabel = log.exerciseLabel
    if (log.order && log.order !== 'sequential') out.order = log.order
    return out
  }
  return out
}

function buildSessionType(s) {
  const out = { id: s.id || slugify(s.name), name: s.name || '' }
  if (s.location) out.location = s.location
  if (s.isRest) { out.isRest = true; return out }
  const tags = {}
  if (s.tags.intensity) tags.intensity = s.tags.intensity
  if (s.tags.modality) tags.modality = s.tags.modality
  if (s.tags.focus) tags.focus = s.tags.focus
  out.tags = tags
  if (s.isLoadingSession) out.isLoadingSession = true
  if (s.optional) out.optional = true
  out.log = buildLog(s.log, false)
  return out
}

function buildRecommendation(r) {
  if (r.type === 'custom') {
    try { return JSON.parse(r.raw) } catch { return null }
  }
  if (r.type === 'noConsecutiveByTag') return { type: 'noConsecutiveByTag', tag: r.tag, value: r.value }
  if (r.type === 'restAfterHard') return { type: 'restAfterHard' }
  if (r.type === 'minPerWeek') {
    const out = { type: 'minPerWeek', session: r.session, count: num(r.count) ?? 1 }
    if (r.label) out.label = r.label
    return out
  }
  return null
}

export function buildExport(data) {
  const plan = {
    id: data.plan.id || slugify(data.plan.title),
    title: data.plan.title || '',
    startDate: data.plan.startDate || '',
    endDate: data.plan.endDate || '',
    weekStartsOn: data.plan.weekStartsOn || 'monday',
  }
  const weekly = num(data.plan.weeklyTargetSessions)
  if (weekly !== undefined) plan.weeklyTargetSessions = weekly
  const rowB = num(data.plan.rowBackbonePerWeek)
  if (rowB !== undefined) plan.rowBackbonePerWeek = rowB

  const sessionTypes = data.sessionTypes.map(buildSessionType)
  const recommendations = data.recommendations.map(buildRecommendation).filter(Boolean)
  const phases = data.phases.filter(p => p.name).map(p => ({ name: p.name, dateRange: [p.start || '', p.end || ''] }))
  const supplements = data.supplements.filter(s => s.name).map(s => {
    const out = { name: s.name }
    if (s.dose) out.dose = s.dose
    out.schedule = s.schedule
    const off = num(s.offsetMin)
    if (s.schedule === 'preLoadingSession' && off !== undefined) out.offsetMin = off
    return out
  })
  const fasting = { enabled: !!data.fasting.enabled, window: { start: data.fasting.start || '', end: data.fasting.end || '' } }

  return { plan, sessionTypes, recommendations, phases, supplements, fasting }
}

// ── generic small DOM helpers ────────────────────────────────────────

function el(tag, attrs, children) {
  const node = document.createElement(tag)
  if (attrs) for (const k in attrs) {
    if (k === 'class') node.className = attrs[k]
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), attrs[k])
    else if (k === 'html') node.innerHTML = attrs[k]
    else node.setAttribute(k, attrs[k])
  }
  ;(children || []).forEach(c => { if (c) node.appendChild(c) })
  return node
}

function pbField(labelText, inputNode) {
  const wrap = el('div', { class: 'pb-field' })
  if (labelText) {
    const l = el('label', {})
    l.textContent = labelText
    wrap.appendChild(l)
  }
  wrap.appendChild(inputNode)
  return wrap
}

function pbRow(fields) {
  return el('div', { class: 'pb-row' }, fields)
}

function pbTextInput(value, placeholder, onChange) {
  const i = el('input', { type: 'text', class: 'pb-input', placeholder: placeholder || '' })
  i.value = value || ''
  i.addEventListener('input', () => onChange(i.value))
  return i
}

function pbNumberInput(value, onChange, min) {
  const i = el('input', { type: 'number', class: 'pb-input' })
  if (min !== undefined) i.min = min
  i.value = (value === undefined || value === null) ? '' : value
  i.addEventListener('input', () => onChange(i.value))
  return i
}

function pbDateInput(value, onChange) {
  const i = el('input', { type: 'date', class: 'pb-input' })
  i.value = value || ''
  i.addEventListener('input', () => onChange(i.value))
  return i
}

function pbTimeInput(value, onChange) {
  const i = el('input', { type: 'time', class: 'pb-input' })
  i.value = value || ''
  i.addEventListener('input', () => onChange(i.value))
  return i
}

function pbSelect(value, options, onChange) {
  const s = el('select', { class: 'pb-select' })
  options.forEach(([val, label]) => {
    const o = el('option', { value: val })
    o.textContent = label
    if (val === value) o.selected = true
    s.appendChild(o)
  })
  s.addEventListener('change', () => onChange(s.value))
  return s
}

function pbCheck(checked, label, onChange) {
  const wrap = el('label', { class: 'pb-check' })
  const c = el('input', { type: 'checkbox' })
  c.checked = !!checked
  c.addEventListener('change', () => onChange(c.checked))
  wrap.appendChild(c)
  wrap.appendChild(document.createTextNode(label))
  return wrap
}

function pbChips(list, presets, onChange) {
  const wrap = el('div', {})
  const chipRow = el('div', { class: 'pb-chips' })
  function renderChips() {
    chipRow.innerHTML = ''
    list.forEach((val, idx) => {
      const chip = el('div', { class: 'pb-chip' })
      const span = document.createElement('span')
      span.textContent = val
      chip.appendChild(span)
      chip.appendChild(el('button', { type: 'button', html: '×', onclick: () => { list.splice(idx, 1); onChange(); renderChips() } }))
      chipRow.appendChild(chip)
    })
  }
  renderChips()
  wrap.appendChild(chipRow)

  const addRow = el('div', { class: 'pb-chip-row' })
  ;(presets || []).forEach(p => {
    const b = el('button', { class: 'pb-chip-suggest', type: 'button', onclick: () => {
      if (!list.includes(p)) { list.push(p); onChange(); renderChips() }
    } })
    b.textContent = '+ ' + p
    addRow.appendChild(b)
  })
  wrap.appendChild(addRow)
  return wrap
}

function hint(text) {
  const p = el('p', { class: 'pb-hint' })
  p.textContent = text
  return p
}

// ── overlay: full-page stack, same pattern as the Day / Activity Log pages ──

function openOverlay(renderContent, onClose) {
  const overlay = document.createElement('div')
  overlay.className = 'sheet-overlay'
  const sheet = document.createElement('div')
  sheet.className = 'sheet'
  overlay.appendChild(sheet)
  document.body.appendChild(overlay)

  function rerender() { renderContent(sheet, rerender, close) }
  function close() { overlay.remove(); onClose?.() }

  rerender()
  return { close }
}

function overlayHeader(sheet, title, onBack) {
  const header = el('div', { class: 'sheet-header' })
  const row = el('div', { class: 'flex items-center justify-between' })
  const titleEl = el('span', { class: 'sheet-title' })
  titleEl.style.fontSize = '24px'
  titleEl.textContent = title
  row.appendChild(titleEl)
  row.appendChild(el('button', {
    class: 'btn-icon', onclick: onBack,
    html: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  }))
  header.appendChild(row)
  sheet.appendChild(header)
}

function overlayBody() {
  const body = el('div', { class: 'sheet-body plan-builder-content' })
  return body
}

// ── Session type editor (exercises live inline as expandable cards) ────

function renderExerciseList(container, exercises, save) {
  container.innerHTML = ''
  exercises.forEach((ex, idx) => {
    container.appendChild(renderExerciseCard(ex, () => { exercises.splice(idx, 1); save(); renderExerciseList(container, exercises, save) }, save))
  })
  container.appendChild(el('button', {
    class: 'pb-add-btn', type: 'button',
    onclick: () => { exercises.push(emptyExercise()); save(); renderExerciseList(container, exercises, save) },
  }, [document.createTextNode('+ Add exercise')]))
}

function renderExerciseCard(ex, onRemove, save) {
  const box = el('div', { class: 'pb-exercise' })

  const top = pbRow([
    pbField('Exercise name', pbTextInput(ex.name, 'e.g. DB lateral raise', v => { ex.name = v; save() })),
  ])
  const setsField = pbField('Sets', pbNumberInput(ex.defaultSets, v => { ex.defaultSets = v; save() }, 0))
  setsField.style.maxWidth = '90px'
  top.appendChild(setsField)
  box.appendChild(top)

  const modeRow = el('div', { class: 'pb-toggle-row' })
  const rangeBtn = el('button', { type: 'button', class: ex.repMode === 'range' ? 'active' : '', onclick: () => { ex.repMode = 'range'; save(); refreshRep() } })
  rangeBtn.textContent = 'Rep range'
  const targetBtn = el('button', { type: 'button', class: ex.repMode === 'target' ? 'active' : '', onclick: () => { ex.repMode = 'target'; save(); refreshRep() } })
  targetBtn.textContent = 'Target text'
  modeRow.appendChild(rangeBtn)
  modeRow.appendChild(targetBtn)
  box.appendChild(modeRow)

  const repArea = el('div', {})
  box.appendChild(repArea)

  function renderRepArea() {
    repArea.innerHTML = ''
    if (ex.repMode === 'range') {
      repArea.appendChild(pbRow([
        pbField('Min reps', pbNumberInput(ex.repMin, v => { ex.repMin = v; save() }, 0)),
        pbField('Max reps', pbNumberInput(ex.repMax, v => { ex.repMax = v; save() }, 0)),
      ]))
    } else {
      repArea.appendChild(pbField('Target', pbTextInput(ex.target, 'e.g. 40–60s or 10 / side', v => { ex.target = v; save() })))
    }
  }
  function refreshRep() {
    renderRepArea()
    modeRow.children[0].className = ex.repMode === 'range' ? 'active' : ''
    modeRow.children[1].className = ex.repMode === 'target' ? 'active' : ''
  }
  renderRepArea()

  box.appendChild(pbField('Tracked fields', pbChips(ex.track, ['weight', 'reps', 'done'], save)))

  const rmBtn = el('button', { class: 'pb-entry-remove', type: 'button', onclick: onRemove })
  rmBtn.textContent = 'Remove exercise'
  box.appendChild(rmBtn)

  return box
}

function renderSessionEditor(sheet, rerender, close, s, save) {
  overlayHeader(sheet, s.name || 'New session', close)
  const titleEl = sheet.querySelector('.sheet-title')
  const body = overlayBody()
  sheet.appendChild(body)

  body.appendChild(pbRow([
    pbField('Name', pbTextInput(s.name, 'e.g. Push session', v => { s.name = v; save(); titleEl.textContent = v || 'New session' })),
    pbField('ID (slug)', pbTextInput(s.id, 'e.g. push', v => { s.id = v; save() })),
  ]))
  const suggestBtn = el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { s.id = slugify(s.name); save(); rerender() } })
  suggestBtn.textContent = 'Set ID from name'
  suggestBtn.style.marginBottom = '14px'
  body.appendChild(suggestBtn)

  body.appendChild(pbField('Location (optional)', pbTextInput(s.location, 'e.g. Gym, Home, Outdoor', v => { s.location = v; save() })))

  body.appendChild(pbCheck(s.isRest, 'This is a rest entry (no tags or logging)', v => { s.isRest = v; save(); rerender() }))

  if (!s.isRest) {
    body.appendChild(pbRow([
      pbField('Intensity', pbSelect(s.tags.intensity, [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], v => { s.tags.intensity = v; save() })),
      pbField('Modality', pbTextInput(s.tags.modality, 'push / row / run / swim…', v => { s.tags.modality = v; save() })),
      pbField('Focus (optional)', pbTextInput(s.tags.focus, 'upper / whole / legs…', v => { s.tags.focus = v; save() })),
    ]))

    body.appendChild(pbRow([
      el('div', { class: 'pb-field' }, [pbCheck(s.isLoadingSession, 'Loading session', v => { s.isLoadingSession = v; save() })]),
      el('div', { class: 'pb-field' }, [pbCheck(s.optional, 'Optional session', v => { s.optional = v; save() })]),
    ]))

    body.appendChild(pbField('How is this logged?', pbSelect(s.log.type, [
      ['completion', 'Completion only'],
      ['single', 'Single value (e.g. distance, lengths)'],
      ['sets', 'Sets & exercises'],
    ], v => { s.log.type = v; save(); rerender() })))

    const logArea = el('div', {})
    body.appendChild(logArea)
    renderLogArea(logArea, s, save, rerender)
  }
}

function renderLogArea(container, s, save, rerenderEditor) {
  container.innerHTML = ''
  const log = s.log

  if (log.type === 'completion') return

  if (log.type === 'single') {
    container.appendChild(pbField('Value(s) recorded', pbChips(log.track, ['distance', 'lengths', 'duration'], save)))
    container.appendChild(pbCheck(log.hasExercises, 'Also include a set/exercise breakdown (e.g. a finisher circuit)', v => { log.hasExercises = v; save(); renderLogArea(container, s, save, rerenderEditor) }))
    if (log.hasExercises) {
      container.appendChild(pbRow([
        pbField('Breakdown label', pbTextInput(log.exerciseLabel, 'e.g. Arm finisher — superset × 2', v => { log.exerciseLabel = v; save() })),
        pbField('Order', pbSelect(log.order, [['sequential', 'Sequential'], ['circuit', 'Circuit']], v => { log.order = v; save() })),
      ]))
      const exWrap = el('div', {})
      container.appendChild(exWrap)
      renderExerciseList(exWrap, log.exercises, save)
    }
    return
  }

  if (log.type === 'sets') {
    const exWrap = el('div', {})
    container.appendChild(exWrap)
    renderExerciseList(exWrap, log.exercises, save)

    container.appendChild(pbField('Breakdown label (optional)', pbTextInput(log.exerciseLabel, '', v => { log.exerciseLabel = v; save() })))
    container.appendChild(pbField('Order', pbSelect(log.order, [['sequential', 'Sequential'], ['circuit', 'Circuit']], v => { log.order = v; save() })))
  }
}

function sessionEntryTitle(s) {
  if (s.name) return s.name
  return null
}

function openSessionTypesOverlay(data, save, onClose) {
  let view = { mode: 'list', index: -1 }

  openOverlay((sheet, rerender, close) => {
    sheet.innerHTML = ''

    if (view.mode === 'editor') {
      const s = data.sessionTypes[view.index]
      renderSessionEditor(sheet, rerender, () => { view = { mode: 'list', index: -1 }; rerender() }, s, save)
      return
    }

    overlayHeader(sheet, 'Session types', close)
    const body = overlayBody()
    sheet.appendChild(body)
    body.appendChild(hint("Each activity the plan can assign to a day — its intensity, whether it's structured, and what gets logged."))

    const list = el('div', {})
    body.appendChild(list)
    data.sessionTypes.forEach((s, idx) => {
      const entry = el('div', { class: 'pb-entry' })
      const head = el('div', { class: 'pb-entry-head', onclick: () => { view = { mode: 'editor', index: idx }; rerender() } })
      const title = sessionEntryTitle(s)
      head.appendChild(el('span', { class: 'pb-entry-title' + (title ? '' : ' empty'), html: title ? escapeHtml(title) : 'Untitled session' }))
      if (s.isRest) head.appendChild(el('span', { class: 'pb-entry-badge', html: 'rest' }))
      else if (s.tags.intensity) head.appendChild(el('span', { class: 'pb-entry-badge', html: escapeHtml(s.tags.intensity) }))
      const rm = el('button', { class: 'pb-entry-remove', type: 'button', onclick: e => { e.stopPropagation(); data.sessionTypes.splice(idx, 1); save(); rerender() } })
      rm.textContent = 'Remove'
      head.appendChild(rm)
      entry.appendChild(head)
      list.appendChild(entry)
    })

    body.appendChild(el('button', {
      class: 'pb-add-btn', type: 'button',
      onclick: () => { data.sessionTypes.push(emptySessionType()); save(); view = { mode: 'editor', index: data.sessionTypes.length - 1 }; rerender() },
    }, [document.createTextNode('+ Add session type')]))
  }, onClose)
}

// ── Recommendations ──────────────────────────────────────────────────

function recLabel(r) {
  if (r.type === 'noConsecutiveByTag') return 'No consecutive ' + (r.tag || 'tag') + ' = ' + (r.value || '…')
  if (r.type === 'restAfterHard') return 'Rest recommended after hard session'
  if (r.type === 'minPerWeek') return r.label || ('Min ' + (r.count || '') + '× ' + (r.session || 'session') + '/week')
  return 'Custom rule'
}

function openRecommendationsOverlay(data, save, onClose) {
  openOverlay((sheet, rerender, close) => {
    sheet.innerHTML = ''
    overlayHeader(sheet, 'Recommendations', close)
    const body = overlayBody()
    sheet.appendChild(body)
    body.appendChild(hint('Advisory rules the app uses to grey out (never block) options in the picker.'))

    data.recommendations.forEach((r, idx) => {
      const entry = el('div', { class: 'pb-entry' })
      const head = el('div', { class: 'pb-entry-head' })
      head.appendChild(el('span', { class: 'pb-entry-title', html: escapeHtml(recLabel(r)) }))
      const rm = el('button', { class: 'pb-entry-remove', type: 'button', onclick: () => { data.recommendations.splice(idx, 1); save(); rerender() } })
      rm.textContent = 'Remove'
      head.appendChild(rm)
      entry.appendChild(head)

      const bodyEntry = el('div', { class: 'pb-entry-body' })
      entry.appendChild(bodyEntry)

      bodyEntry.appendChild(pbField('Rule type', pbSelect(r.type, [
        ['noConsecutiveByTag', 'No two consecutive days share a tag'],
        ['restAfterHard', 'Rest recommended after a hard session'],
        ['minPerWeek', 'Minimum occurrences per week'],
        ['custom', 'Custom (raw JSON)'],
      ], v => { r.type = v; save(); rerender() })))

      if (r.type === 'noConsecutiveByTag') {
        bodyEntry.appendChild(pbRow([
          pbField('Tag', pbSelect(r.tag, [['intensity', 'Intensity'], ['modality', 'Modality'], ['focus', 'Focus']], v => { r.tag = v; save(); rerender() })),
          pbField('Value', pbTextInput(r.value, 'e.g. hard', v => { r.value = v; save() })),
        ]))
      } else if (r.type === 'minPerWeek') {
        bodyEntry.appendChild(pbRow([
          pbField('Session ID', pbTextInput(r.session, 'e.g. row', v => { r.session = v; save() })),
          pbField('Count', pbNumberInput(r.count, v => { r.count = v; save() }, 0)),
        ]))
        bodyEntry.appendChild(pbField('Label', pbTextInput(r.label, 'e.g. Row backbone', v => { r.label = v; save() })))
      } else if (r.type === 'custom') {
        const ta = el('textarea', { class: 'pb-textarea', rows: 4 })
        ta.value = r.raw || '{\n  \n}'
        const err = el('div', { class: 'error-text' })
        ta.addEventListener('input', () => {
          r.raw = ta.value
          save()
          try { JSON.parse(ta.value); err.textContent = '' } catch (e2) { err.textContent = 'Not valid JSON yet.' }
        })
        bodyEntry.appendChild(pbField('Raw rule object', ta))
        bodyEntry.appendChild(err)
      }

      body.appendChild(entry)
    })

    body.appendChild(el('button', {
      class: 'pb-add-btn', type: 'button',
      onclick: () => { data.recommendations.push(emptyRecommendation()); save(); rerender() },
    }, [document.createTextNode('+ Add recommendation')]))
  }, onClose)
}

// ── Phases ───────────────────────────────────────────────────────────

function openPhasesOverlay(data, save, onClose) {
  openOverlay((sheet, rerender, close) => {
    sheet.innerHTML = ''
    overlayHeader(sheet, 'Phases', close)
    const body = overlayBody()
    sheet.appendChild(body)
    body.appendChild(hint('Named date ranges shown as a pill in the app.'))

    data.phases.forEach((p, idx) => {
      const entry = el('div', { class: 'pb-entry' })
      const head = el('div', { class: 'pb-entry-head' })
      head.appendChild(el('span', { class: 'pb-entry-title' + (p.name ? '' : ' empty'), html: p.name ? escapeHtml(p.name) : 'Untitled phase' }))
      const rm = el('button', { class: 'pb-entry-remove', type: 'button', onclick: () => { data.phases.splice(idx, 1); save(); rerender() } })
      rm.textContent = 'Remove'
      head.appendChild(rm)
      entry.appendChild(head)

      const bodyEntry = el('div', { class: 'pb-entry-body' })
      bodyEntry.appendChild(pbField('Name', pbTextInput(p.name, 'e.g. Build', v => { p.name = v; save(); head.querySelector('.pb-entry-title').textContent = v || 'Untitled phase' })))
      bodyEntry.appendChild(pbRow([
        pbField('Start date', pbDateInput(p.start, v => { p.start = v; save() })),
        pbField('End date', pbDateInput(p.end, v => { p.end = v; save() })),
      ]))
      entry.appendChild(bodyEntry)
      body.appendChild(entry)
    })

    body.appendChild(el('button', {
      class: 'pb-add-btn', type: 'button',
      onclick: () => { data.phases.push(emptyPhase()); save(); rerender() },
    }, [document.createTextNode('+ Add phase')]))
  }, onClose)
}

// ── Supplements ──────────────────────────────────────────────────────

function openSupplementsOverlay(data, save, onClose) {
  openOverlay((sheet, rerender, close) => {
    sheet.innerHTML = ''
    overlayHeader(sheet, 'Supplements', close)
    const body = overlayBody()
    sheet.appendChild(body)
    body.appendChild(hint('Daily and session-conditional checklist items.'))

    data.supplements.forEach((sp, idx) => {
      const entry = el('div', { class: 'pb-entry' })
      const head = el('div', { class: 'pb-entry-head' })
      head.appendChild(el('span', { class: 'pb-entry-title' + (sp.name ? '' : ' empty'), html: sp.name ? escapeHtml(sp.name) : 'Untitled supplement' }))
      const rm = el('button', { class: 'pb-entry-remove', type: 'button', onclick: () => { data.supplements.splice(idx, 1); save(); rerender() } })
      rm.textContent = 'Remove'
      head.appendChild(rm)
      entry.appendChild(head)

      const bodyEntry = el('div', { class: 'pb-entry-body' })
      bodyEntry.appendChild(pbRow([
        pbField('Name', pbTextInput(sp.name, 'e.g. Creatine', v => { sp.name = v; save(); head.querySelector('.pb-entry-title').textContent = v || 'Untitled supplement' })),
        pbField('Dose', pbTextInput(sp.dose, 'e.g. 5g', v => { sp.dose = v; save() })),
      ]))
      bodyEntry.appendChild(pbField('Schedule', pbSelect(sp.schedule, [
        ['daily', 'Daily'],
        ['preLoadingSession', 'Before a loading session'],
        ['postLoadingSession', 'After a loading session'],
      ], v => { sp.schedule = v; save(); rerender() })))
      if (sp.schedule === 'preLoadingSession') {
        bodyEntry.appendChild(pbField('Offset (minutes, negative = before)', pbNumberInput(sp.offsetMin, v => { sp.offsetMin = v; save() })))
      }
      entry.appendChild(bodyEntry)
      body.appendChild(entry)
    })

    body.appendChild(el('button', {
      class: 'pb-add-btn', type: 'button',
      onclick: () => { data.supplements.push(emptySupplement()); save(); rerender() },
    }, [document.createTextNode('+ Add supplement')]))
  }, onClose)
}

// ── Fasting ──────────────────────────────────────────────────────────

function openFastingOverlay(data, save, onClose) {
  openOverlay((sheet, rerender, close) => {
    sheet.innerHTML = ''
    overlayHeader(sheet, 'Fasting', close)
    const body = overlayBody()
    sheet.appendChild(body)
    body.appendChild(hint('The daily fasting window marker.'))

    body.appendChild(pbCheck(data.fasting.enabled, 'Enable fasting tracking', v => { data.fasting.enabled = v; save() }))
    body.appendChild(pbRow([
      pbField('Window start', pbTimeInput(data.fasting.start, v => { data.fasting.start = v; save() })),
      pbField('Window end', pbTimeInput(data.fasting.end, v => { data.fasting.end = v; save() })),
    ]))
  }, onClose)
}

// ── Plan details ─────────────────────────────────────────────────────

function openPlanDetailsOverlay(data, save, onClose) {
  openOverlay((sheet, rerender, close) => {
    sheet.innerHTML = ''
    overlayHeader(sheet, 'Plan details', close)
    const body = overlayBody()
    sheet.appendChild(body)
    body.appendChild(hint("The plan's identity and week shape."))

    body.appendChild(pbRow([
      pbField('Title', pbTextInput(data.plan.title, 'Training Plan — name (vN)', v => { data.plan.title = v; save() })),
      pbField('Plan ID', pbTextInput(data.plan.id, 'short-slug-id', v => { data.plan.id = v; save() })),
    ]))
    body.appendChild(pbRow([
      pbField('Start date', pbDateInput(data.plan.startDate, v => { data.plan.startDate = v; save() })),
      pbField('End date', pbDateInput(data.plan.endDate, v => { data.plan.endDate = v; save() })),
    ]))
    body.appendChild(pbField('Week starts on', pbSelect(data.plan.weekStartsOn, [['monday', 'Monday'], ['sunday', 'Sunday']], v => { data.plan.weekStartsOn = v; save() })))
    body.appendChild(pbRow([
      pbField('Weekly target sessions', pbNumberInput(data.plan.weeklyTargetSessions, v => { data.plan.weeklyTargetSessions = v; save() }, 0)),
      pbField('Row backbone per week', pbNumberInput(data.plan.rowBackbonePerWeek, v => { data.plan.rowBackbonePerWeek = v; save() }, 0)),
    ]))
  }, onClose)
}

// ── Preview & export ─────────────────────────────────────────────────

function openPreviewOverlay(data) {
  openOverlay((sheet, rerender, close) => {
    sheet.innerHTML = ''
    overlayHeader(sheet, 'Preview & export', close)
    const body = overlayBody()
    sheet.appendChild(body)
    body.appendChild(hint('Regenerates from the current form state.'))

    const exported = buildExport(data)
    const { valid, errors } = validatePlan(exported)
    const validation = el('div', { class: 'pb-validation ' + (valid ? 'ok' : 'bad') })
    validation.textContent = valid
      ? '✓ Valid plan — the tracker will accept this as-is.'
      : `${errors.length} issue${errors.length > 1 ? 's' : ''}: ` + errors.map(e => e.msg).join('; ')
    body.appendChild(validation)

    const filenameField = pbField('Filename', pbTextInput((exported.plan.id || 'plan') + '.json', '', () => {}))
    const filenameInput = filenameField.querySelector('input')
    body.appendChild(filenameField)

    const actions = el('div', { class: 'pb-entry-actions', style: 'margin-bottom:14px' })
    const copyBtn = el('button', { class: 'btn btn-ghost btn-full', type: 'button' })
    copyBtn.textContent = 'Copy JSON'
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(JSON.stringify(exported, null, 2))
      copyBtn.textContent = 'Copied ✓'
      setTimeout(() => { copyBtn.textContent = 'Copy JSON' }, 1500)
    })
    const downloadBtn = el('button', { class: 'btn btn-primary btn-full', type: 'button' })
    downloadBtn.textContent = 'Download JSON'
    downloadBtn.addEventListener('click', () => {
      const text = JSON.stringify(exported, null, 2)
      const blob = new Blob([text], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filenameInput.value.trim() || 'plan.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
    actions.appendChild(copyBtn)
    actions.appendChild(downloadBtn)
    body.appendChild(actions)

    const pre = el('pre', { class: 'pb-preview' })
    pre.textContent = JSON.stringify(exported, null, 2)
    body.appendChild(pre)
  })
}

// ── root view (the 'Plan' tab's base content) ───────────────────────

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderPlanBuilderView({ activePlan }) {
  const root = document.createElement('div')
  root.className = 'screen'

  let data = loadDraft()

  function save() { saveDraft(data) }

  function render() {
    root.innerHTML = ''
    if (!data) {
      renderEntry()
    } else {
      renderHome()
    }
  }

  function renderEntry() {
    root.innerHTML = `
      <div class="topbar"><span class="topbar-title">Plan builder</span></div>
      <div class="content plan-builder-content">
        <div class="card" style="display:flex;flex-direction:column;gap:10px">
          <div class="section-label">Start</div>
          ${activePlan ? `<button class="btn btn-primary btn-full" id="pb-edit-active">Edit current plan</button>` : ''}
          <label class="btn btn-ghost btn-full" style="cursor:pointer">
            Import a JSON file…
            <input type="file" id="pb-import-file" accept="application/json" style="display:none" />
          </label>
          <button class="btn btn-ghost btn-full" id="pb-new">Start a blank plan</button>
        </div>
      </div>
    `
    root.querySelector('#pb-edit-active')?.addEventListener('click', () => {
      data = importPlanJson(activePlan)
      save()
      render()
    })
    root.querySelector('#pb-new').addEventListener('click', () => {
      data = defaultData()
      save()
      render()
    })
    root.querySelector('#pb-import-file').addEventListener('change', async e => {
      const file = e.target.files[0]
      if (!file) return
      try {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = ev => resolve(ev.target.result)
          reader.onerror = () => reject(reader.error)
          reader.readAsText(file)
        })
        data = importPlanJson(JSON.parse(text))
        save()
        render()
      } catch (err) {
        alert('Could not read that file as JSON: ' + err.message)
      }
      e.target.value = ''
    })
  }

  function sectionLink(name, count, onClick) {
    const link = el('div', { class: 'pb-section-link', onclick: onClick })
    const main = el('div', { class: 'pb-section-link-main' })
    main.appendChild(el('span', { class: 'pb-section-link-name', html: escapeHtml(name) }))
    if (count !== undefined) main.appendChild(el('span', { class: 'pb-section-link-count', html: escapeHtml(count) }))
    link.appendChild(main)
    link.appendChild(el('span', { class: 'pb-section-link-arrow', html: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l5 4-5 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' }))
    return link
  }

  function renderHome() {
    root.innerHTML = `
      <div class="topbar"><span class="topbar-title">Plan builder</span></div>
      <div class="content plan-builder-content" id="pb-home-content"></div>
    `
    const content = root.querySelector('#pb-home-content')

    const card = el('div', { class: 'card', style: 'display:flex;flex-direction:column;gap:8px' })
    card.appendChild(sectionLink('Plan details', data.plan.title || 'Untitled', () => openPlanDetailsOverlay(data, save, render)))
    card.appendChild(sectionLink('Session types', String(data.sessionTypes.length), () => openSessionTypesOverlay(data, save, render)))
    card.appendChild(sectionLink('Recommendations', String(data.recommendations.length), () => openRecommendationsOverlay(data, save, render)))
    card.appendChild(sectionLink('Phases', String(data.phases.length), () => openPhasesOverlay(data, save, render)))
    card.appendChild(sectionLink('Supplements', String(data.supplements.length), () => openSupplementsOverlay(data, save, render)))
    card.appendChild(sectionLink('Fasting', data.fasting.enabled ? 'On' : 'Off', () => openFastingOverlay(data, save, render)))
    content.appendChild(card)

    const exportBtn = el('button', { class: 'btn btn-primary btn-full', type: 'button', style: 'margin-top:16px' })
    exportBtn.textContent = 'Preview & export'
    exportBtn.addEventListener('click', () => openPreviewOverlay(data))
    content.appendChild(exportBtn)

    const resetBtn = el('button', { class: 'btn btn-ghost btn-full', type: 'button', style: 'margin-top:8px' })
    resetBtn.textContent = 'Start over'
    resetBtn.addEventListener('click', () => {
      if (!confirm('Discard this draft and start over?')) return
      data = null
      clearDraft()
      render()
    })
    content.appendChild(resetBtn)
  }

  render()
  return root
}
