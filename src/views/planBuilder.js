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

// `id` is the exercise's stable identity for cloud history/charts — set
// once from the name the first time it's non-empty (see the exercise-name
// input below), then left untouched by later renames. `_id` is unrelated:
// a builder-only React-key-style value for this editing session.
function emptyExercise() {
  return { _id: uid(), id: '', name: '', repMode: 'range', repMin: '', repMax: '', target: '', defaultSets: '', track: ['weight', 'reps'] }
}

// A session's exercise log is an ordered list of blocks. Each is either:
//   { kind: 'sequential', exercise }              — one exercise, all its
//                                                     sets back-to-back
//   { kind: 'circuit', rounds, exercises, label? } — several exercises,
//                                                     one set of each per
//                                                     round
// Blocks can be freely mixed and reordered — e.g. row's own distance
// metric (kept separate, see log.track below) followed by a sequential
// exercise, followed by a circuit.

function emptySequentialBlock() {
  return { _id: uid(), kind: 'sequential', exercise: emptyExercise() }
}

function emptyCircuitBlock() {
  return { _id: uid(), kind: 'circuit', rounds: 2, label: '', exercises: [emptyExercise()] }
}

function emptySessionType() {
  return {
    _id: uid(),
    id: '', name: '',
    tags: { intensity: 'medium', modality: '', focus: '' },
    isLoadingSession: false,
    isRest: false,
    optional: false,
    log: { type: 'completion', track: [], hasExercises: false, blocks: [] },
  }
}

function emptyRecommendation() {
  return { _id: uid(), type: 'noConsecutiveByTag', tag: 'intensity', value: 'hard', session: '', count: 1, label: '', raw: '{\n  \n}' }
}

function emptySupplement() {
  return { _id: uid(), name: '', dose: '', schedule: 'daily', offsetMin: '' }
}

function defaultData() {
  return {
    // weekStartsOn is fixed to Monday throughout the app (dates.js doesn't
    // support any other start), so it's not exposed as a choice here.
    plan: { title: '', id: '', startDate: '', endDate: '', weeklyTargetSessions: 5 },
    sessionTypes: [],
    recommendations: [],
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
  // Backfill an id for exercises authored before ids existed; once a plan
  // carries a real id, that's the one that sticks (see buildExercise).
  out.id = e.id || slugify(e.name || '')
  if (e.repRange) { out.repMode = 'range'; out.repMin = e.repRange[0]; out.repMax = e.repRange[1] }
  else if (e.target) { out.repMode = 'target'; out.target = e.target }
  out.defaultSets = e.defaultSets ?? ''
  out.track = Array.isArray(e.track) ? e.track.slice() : []
  return out
}

function importBlock(b) {
  if (b.kind === 'circuit') {
    return {
      _id: uid(), kind: 'circuit',
      rounds: b.rounds ?? 1,
      label: b.label || '',
      exercises: (Array.isArray(b.exercises) ? b.exercises : []).map(importExercise),
    }
  }
  return { _id: uid(), kind: 'sequential', exercise: importExercise(b.exercise || {}) }
}

// Reads the current 'blocks' shape, or falls back to the older flat
// 'exercises' + 'order' shape from plans authored before blocks existed.
function importBlocksFromLog(log) {
  if (Array.isArray(log.blocks)) return log.blocks.map(importBlock)
  const exercises = Array.isArray(log.exercises) ? log.exercises : []
  if (exercises.length === 0) return []
  if (log.order === 'circuit') {
    return [{
      _id: uid(), kind: 'circuit',
      rounds: Math.max(1, ...exercises.map(e => e.defaultSets ?? 1)),
      label: log.exerciseLabel || '',
      exercises: exercises.map(importExercise),
    }]
  }
  return exercises.map(e => ({ _id: uid(), kind: 'sequential', exercise: importExercise(e) }))
}

export function importPlanJson(raw) {
  const s = defaultData()
  if (raw.plan) {
    s.plan.title = raw.plan.title || ''
    s.plan.id = raw.plan.id || ''
    s.plan.startDate = raw.plan.startDate || ''
    s.plan.endDate = raw.plan.endDate || ''
    s.plan.weeklyTargetSessions = raw.plan.weeklyTargetSessions ?? 5
  }
  ;(raw.sessionTypes || []).forEach(st => {
    const ns = emptySessionType()
    ns.id = st.id || ''
    ns.name = st.name || ''
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
      ns.log.blocks = importBlocksFromLog(st.log)
      ns.log.hasExercises = ns.log.type === 'single' && ns.log.blocks.length > 0
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
  const out = { id: ex.id || slugify(ex.name || ''), name: ex.name || '' }
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

function buildBlock(block) {
  if (block.kind === 'circuit') {
    const out = { kind: 'circuit', rounds: num(block.rounds) ?? 1, exercises: block.exercises.map(buildExercise) }
    if (block.label) out.label = block.label
    return out
  }
  return { kind: 'sequential', exercise: buildExercise(block.exercise) }
}

function buildLog(log, isRest) {
  if (isRest) return undefined
  const out = { type: log.type }
  if (log.type === 'completion') return out
  if (log.type === 'single') {
    out.track = log.track.slice()
    if (log.hasExercises && log.blocks.length) {
      out.blocks = log.blocks.map(buildBlock)
    }
    return out
  }
  if (log.type === 'sets') {
    out.blocks = log.blocks.map(buildBlock)
    return out
  }
  return out
}

function buildSessionType(s) {
  const out = { id: s.id || slugify(s.name), name: s.name || '' }
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
    // Always Monday — see the note on defaultData().
    weekStartsOn: 'monday',
  }
  const weekly = num(data.plan.weeklyTargetSessions)
  if (weekly !== undefined) plan.weeklyTargetSessions = weekly

  const sessionTypes = data.sessionTypes.map(buildSessionType)
  const recommendations = data.recommendations.map(buildRecommendation).filter(Boolean)
  const supplements = data.supplements.filter(s => s.name).map(s => {
    const out = { name: s.name }
    if (s.dose) out.dose = s.dose
    out.schedule = s.schedule
    const off = num(s.offsetMin)
    if (s.schedule === 'preLoadingSession' && off !== undefined) out.offsetMin = off
    return out
  })
  const fasting = { enabled: !!data.fasting.enabled, window: { start: data.fasting.start || '', end: data.fasting.end || '' } }

  return { plan, sessionTypes, recommendations, supplements, fasting }
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
  const i = el('input', { type: 'date', class: 'pb-input pb-date-input' })
  i.value = value || ''
  i.addEventListener('input', () => onChange(i.value))
  return i
}

function pbTimeInput(value, onChange) {
  const i = el('input', { type: 'time', class: 'pb-input pb-date-input' })
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

// window.confirm()/alert() are silently no-ops in an iOS home-screen PWA
// (display: standalone in the manifest) — WebKit never shows the native
// dialog there, so confirm() just returns false immediately. These are
// in-app replacements that actually work when installed.
function dialogOverlay(messageText, buttons) {
  const overlay = el('div', { class: 'pb-confirm-overlay' })
  const box = el('div', { class: 'pb-confirm-box' })
  const msg = el('p', { class: 'pb-confirm-message' })
  msg.textContent = messageText
  box.appendChild(msg)
  const actions = el('div', { class: 'pb-confirm-actions' })
  buttons.forEach(({ label, primary, onClick }) => {
    const btn = el('button', { class: 'btn ' + (primary ? 'btn-primary' : 'btn-ghost'), type: 'button' })
    btn.textContent = label
    btn.addEventListener('click', () => { overlay.remove(); onClick?.() })
    actions.appendChild(btn)
  })
  box.appendChild(actions)
  overlay.appendChild(box)
  document.body.appendChild(overlay)
}

function showConfirm(messageText, confirmLabel, onConfirm) {
  dialogOverlay(messageText, [
    { label: 'Cancel' },
    { label: confirmLabel, primary: true, onClick: onConfirm },
  ])
}

function showNotice(messageText) {
  dialogOverlay(messageText, [{ label: 'OK', primary: true }])
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

// Renders one exercise's fields (name, rep mode, tracked fields). Used
// both for a sequential block's single exercise and for each exercise
// nested inside a circuit block.
//   opts.hideSets         — circuit members don't have their own set
//                            count; the block's `rounds` governs it
//   opts.hideRemoveButton — sequential blocks remove via the block's
//                            own header button instead (one exercise,
//                            same thing as removing the block)
//   opts.exerciseIndex,
//   opts.onMoveUp/onMoveDown — circuit members can be reordered within
//                            the circuit; pass these (omit at either end
//                            of the list) to show ↑/↓ controls
function renderExerciseCard(ex, onRemove, save, opts = {}) {
  const box = el('div', { class: 'pb-exercise' })

  if (opts.onMoveUp || opts.onMoveDown) {
    const moveRow = el('div', { class: 'pb-exercise-move-row' })
    moveRow.appendChild(el('span', { class: 'pb-block-num', html: `Exercise ${opts.exerciseIndex + 1}` }))
    moveRow.appendChild(el('div', { style: 'flex:1' }))
    if (opts.onMoveUp) {
      const up = el('button', { class: 'pb-block-move', type: 'button', title: 'Move up', onclick: opts.onMoveUp })
      up.innerHTML = '↑'
      moveRow.appendChild(up)
    }
    if (opts.onMoveDown) {
      const down = el('button', { class: 'pb-block-move', type: 'button', title: 'Move down', onclick: opts.onMoveDown })
      down.innerHTML = '↓'
      moveRow.appendChild(down)
    }
    box.appendChild(moveRow)
  }

  const top = pbRow([
    pbField('Exercise name', pbTextInput(ex.name, 'e.g. DB lateral raise', v => {
      ex.name = v
      // Lock the stable id in the first time this exercise gets a real
      // name, then leave it alone — a later rename shouldn't sever its
      // logged history.
      if (!ex.id && v.trim()) ex.id = slugify(v)
      save()
    })),
  ])
  if (!opts.hideSets) {
    const setsField = pbField('Sets', pbNumberInput(ex.defaultSets, v => { ex.defaultSets = v; save() }, 0))
    setsField.style.maxWidth = '90px'
    top.appendChild(setsField)
  }
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

  if (!opts.hideRemoveButton && onRemove) {
    const rmBtn = el('button', { class: 'pb-entry-remove', type: 'button', onclick: onRemove })
    rmBtn.textContent = 'Remove exercise'
    box.appendChild(rmBtn)
  }

  return box
}

// One block card: a sequential exercise, or a circuit wrapping several.
// Up/down swap position in the blocks array (simplest reorder control
// for touch — no drag needed), and the header makes it visually obvious
// which kind of block this is, matching the tracker's own circuit styling.
function renderBlockCard(block, idx, blocks, save, rerenderList) {
  const isCircuit = block.kind === 'circuit'
  const card = el('div', { class: 'pb-block ' + (isCircuit ? 'pb-block-circuit' : 'pb-block-sequential') })

  const header = el('div', { class: 'pb-block-header' })
  header.appendChild(el('span', { class: 'pb-block-kind', html: isCircuit ? 'Circuit' : 'Sequential' }))
  header.appendChild(el('span', { class: 'pb-block-num', html: `Block ${idx + 1}` }))
  const spacer = el('div', { style: 'flex:1' })
  header.appendChild(spacer)
  if (idx > 0) {
    const moveUp = el('button', { class: 'pb-block-move', type: 'button', title: 'Move up', onclick: () => { [blocks[idx - 1], blocks[idx]] = [blocks[idx], blocks[idx - 1]]; save(); rerenderList() } })
    moveUp.innerHTML = '↑'
    header.appendChild(moveUp)
  }
  if (idx < blocks.length - 1) {
    const moveDown = el('button', { class: 'pb-block-move', type: 'button', title: 'Move down', onclick: () => { [blocks[idx + 1], blocks[idx]] = [blocks[idx], blocks[idx + 1]]; save(); rerenderList() } })
    moveDown.innerHTML = '↓'
    header.appendChild(moveDown)
  }
  const rm = el('button', { class: 'pb-entry-remove', type: 'button', onclick: () => { blocks.splice(idx, 1); save(); rerenderList() } })
  rm.textContent = 'Remove'
  header.appendChild(rm)
  card.appendChild(header)

  if (isCircuit) {
    card.appendChild(pbRow([
      pbField('Rounds', pbNumberInput(block.rounds, v => { block.rounds = v; save() }, 1)),
      pbField('Label (optional)', pbTextInput(block.label, 'e.g. Arm finisher', v => { block.label = v; save() })),
    ]))
    const exWrap = el('div', { class: 'pb-circuit-exercises' })
    card.appendChild(exWrap)
    const renderCircuitExercises = () => {
      exWrap.innerHTML = ''
      block.exercises.forEach((ex, exIdx) => {
        exWrap.appendChild(renderExerciseCard(ex, () => { block.exercises.splice(exIdx, 1); save(); renderCircuitExercises() }, save, {
          hideSets: true,
          exerciseIndex: exIdx,
          onMoveUp: exIdx > 0
            ? () => { [block.exercises[exIdx - 1], block.exercises[exIdx]] = [block.exercises[exIdx], block.exercises[exIdx - 1]]; save(); renderCircuitExercises() }
            : undefined,
          onMoveDown: exIdx < block.exercises.length - 1
            ? () => { [block.exercises[exIdx + 1], block.exercises[exIdx]] = [block.exercises[exIdx], block.exercises[exIdx + 1]]; save(); renderCircuitExercises() }
            : undefined,
        }))
      })
      exWrap.appendChild(el('button', {
        class: 'pb-add-btn', type: 'button',
        onclick: () => { block.exercises.push(emptyExercise()); save(); renderCircuitExercises() },
      }, [document.createTextNode('+ Add exercise to circuit')]))
    }
    renderCircuitExercises()
  } else {
    card.appendChild(renderExerciseCard(block.exercise, null, save, { hideRemoveButton: true }))
  }

  return card
}

function renderBlocksEditor(container, blocks, save) {
  container.innerHTML = ''
  const list = el('div', { class: 'pb-blocks' })
  container.appendChild(list)
  const rerenderList = () => renderBlocksEditor(container, blocks, save)
  blocks.forEach((block, idx) => list.appendChild(renderBlockCard(block, idx, blocks, save, rerenderList)))

  const addRow = el('div', { class: 'pb-block-add-row' })
  addRow.appendChild(el('button', {
    class: 'pb-add-btn', type: 'button',
    onclick: () => { blocks.push(emptySequentialBlock()); save(); rerenderList() },
  }, [document.createTextNode('+ Add sequential exercise')]))
  addRow.appendChild(el('button', {
    class: 'pb-add-btn', type: 'button',
    onclick: () => { blocks.push(emptyCircuitBlock()); save(); rerenderList() },
  }, [document.createTextNode('+ Add circuit')]))
  container.appendChild(addRow)
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
    container.appendChild(pbCheck(log.hasExercises, 'Also include an exercise breakdown (sequential and/or circuit blocks)', v => { log.hasExercises = v; save(); renderLogArea(container, s, save, rerenderEditor) }))
    if (log.hasExercises) {
      container.appendChild(hint('The distance/lengths field above always comes first, then these blocks in order — e.g. row’s own "1 × row" followed by a circuit.'))
      const blocksWrap = el('div', {})
      container.appendChild(blocksWrap)
      renderBlocksEditor(blocksWrap, log.blocks, save)
    }
    return
  }

  if (log.type === 'sets') {
    container.appendChild(hint('Add blocks in the order they should be done. Sequential = one exercise, all its sets back-to-back. Circuit = several exercises, one set of each per round, repeated for N rounds. Mix and reorder freely.'))
    const blocksWrap = el('div', {})
    container.appendChild(blocksWrap)
    renderBlocksEditor(blocksWrap, log.blocks, save)
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
    body.appendChild(pbField('Weekly target sessions', pbNumberInput(data.plan.weeklyTargetSessions, v => { data.plan.weeklyTargetSessions = v; save() }, 0)))
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
        showNotice('Could not read that file as JSON: ' + err.message)
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
      showConfirm('Discard this draft and start over?', 'Discard', () => {
        data = null
        clearDraft()
        render()
      })
    })
    content.appendChild(resetBtn)
  }

  render()
  return root
}
