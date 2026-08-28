import { dayName, today } from '../dates.js'
import { recommendDay, FLAG } from '../engine.js'
import { getSessionById, getSupplementsForDay } from '../plan.js'

const FLAG_LABELS = {
  [FLAG.CONSECUTIVE_HARD]: 'Two hard sessions in a row',
  [FLAG.CONSECUTIVE_RUN]: 'Two runs in a row',
  [FLAG.REST_SUGGESTED]: 'Rest suggested after hard session',
}

export function renderDaySheet({ plan, dayRecords, date, onClose, onSave }) {
  const record = dayRecords[date] ?? {}
  const isToday = date === today()
  const recs = recommendDay(plan, dayRecords, date)

  const overlay = document.createElement('div')
  overlay.className = 'sheet-overlay'
  overlay.addEventListener('click', e => { if (e.target === overlay) onClose() })

  const sheet = document.createElement('div')
  sheet.className = 'sheet'
  sheet.addEventListener('click', e => e.stopPropagation())

  const state = {
    activityId: record.activityId ?? null,
    activityType: record.activityType ?? null,
    activityLabel: record.activityLabel ?? null,
    completed: record.completed ?? false,
    detail: record.detail ? JSON.parse(JSON.stringify(record.detail)) : {},
    supplements: record.supplements ? [...record.supplements] : [],
    fasting: record.fasting ?? null,
    customText: (record.activityType === 'custom' ? record.activityLabel : '') ?? '',
    // Picker starts collapsed once something is already chosen — expand on tap to change it.
    pickerOpen: !(record.activityId || record.activityType),
    // Guided one-set-at-a-time log flow. null when not active.
    flow: null,
  }

  function currentSession() {
    if (state.activityType === 'custom' || state.activityType === 'rest') return null
    return state.activityId ? getSessionById(plan, state.activityId) : null
  }

  function advanceFlow(dir) {
    if (!state.flow) return
    const next = state.flow.stepIndex + dir
    if (next < 0 || next >= state.flow.steps.length) {
      state.flow = null
    } else {
      state.flow.stepIndex = next
    }
  }

  function render() {
    const session = currentSession()
    const supplements = getSupplementsForDay(plan, state.activityId)

    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-header">
        <div class="flex items-center justify-between">
          <span class="sheet-title">${dayName(date)}, ${parseInt(date.slice(8), 10)}/${parseInt(date.slice(5, 7), 10)}</span>
          <button class="btn-icon" id="close-btn">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
        ${!state.flow && state.completed ? '<span class="phase-pill text-accent" style="border-color:var(--accent);background:var(--accent-dim)">Completed ✓</span>' : ''}
      </div>
      <div class="sheet-body">
        ${state.flow ? (session ? renderLogDetail(session, state) : '') : `

          <!-- Activity picker -->
          <div>
            <div class="section-label" style="margin-bottom:8px">Activity</div>
            ${state.pickerOpen ? `
              <div class="session-list" id="session-list">
                ${[...recs].sort((a, b) => a.flags.length - b.flags.length)
                  .map(({ session, flags }) => renderSessionOption(session, flags, state)).join('')}
              </div>
            ` : renderActivitySummary(state)}

            ${state.activityType === 'custom' ? `
              <input type="text" class="custom-input mt-8" id="custom-text" placeholder="What did you do?" value="${escHtml(state.customText)}" />
            ` : ''}
          </div>

          <!-- Log detail -->
          ${session ? renderLogDetail(session, state) : ''}

          <!-- Supplements -->
          ${supplements.length > 0 ? renderSupplements(supplements, state) : ''}

          <!-- Fasting -->
          ${renderFasting(state, plan)}

          <!-- Complete button -->
          <button class="btn btn-full complete-btn ${state.completed ? 'done' : 'btn-primary'}" id="complete-btn">
            ${state.completed ? 'Completed ✓' : 'Mark complete'}
          </button>

          ${state.completed ? `
            <button class="btn btn-full btn-ghost" id="uncomplete-btn" style="margin-top:-4px">Undo completion</button>
          ` : ''}

        `}
      </div>
    `

    // Bind events
    sheet.querySelector('#close-btn').addEventListener('click', () => {
      // Exiting the guided flow drops back to the glanceable view instead
      // of closing the whole sheet — whatever was entered stays saved.
      if (state.flow) {
        state.flow = null
        render()
      } else {
        save(false)
      }
    })

    sheet.querySelector('#session-list')?.addEventListener('click', e => {
      const opt = e.target.closest('.session-option[data-id]')
      if (!opt) return
      const id = opt.dataset.id
      if (id === '__custom__') {
        state.activityId = null
        state.activityType = 'custom'
        state.activityLabel = state.customText || 'Custom activity'
      } else if (id === 'rest') {
        state.activityId = 'rest'
        state.activityType = 'rest'
        state.activityLabel = 'Rest'
      } else {
        const s = getSessionById(plan, id)
        state.activityId = id
        state.activityType = 'session'
        state.activityLabel = s?.name ?? id
      }
      state.pickerOpen = false
      render()
    })

    sheet.querySelector('#activity-summary')?.addEventListener('click', () => {
      state.pickerOpen = true
      render()
    })

    const customInput = sheet.querySelector('#custom-text')
    if (customInput) {
      customInput.addEventListener('input', e => {
        state.customText = e.target.value
        state.activityLabel = e.target.value || 'Custom activity'
      })
    }

    // Glanceable sets inputs
    sheet.querySelectorAll('.set-weight').forEach(inp => {
      inp.addEventListener('change', e => {
        const { ex, set } = e.target.dataset
        setDetailValue(state, ex, set, 'weight', e.target.value)
      })
    })
    sheet.querySelectorAll('.set-reps').forEach(inp => {
      inp.addEventListener('change', e => {
        const { ex, set } = e.target.dataset
        setDetailValue(state, ex, set, 'reps', e.target.value)
      })
    })
    sheet.querySelectorAll('.set-done').forEach(inp => {
      inp.addEventListener('change', e => {
        const ex = e.target.dataset.ex
        setDetailValue(state, ex, 0, 'done', e.target.checked)
      })
    })
    sheet.querySelectorAll('.add-set-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const ex = e.target.dataset.ex
        if (!state.detail.exercises) state.detail.exercises = {}
        if (!state.detail.exercises[ex]) state.detail.exercises[ex] = []
        state.detail.exercises[ex].push({ weight: '', reps: '' })
        render()
      })
    })

    const distInput = sheet.querySelector('#distance-input')
    if (distInput) distInput.addEventListener('change', e => { state.detail.distance = e.target.value })

    const lengthsInput = sheet.querySelector('#lengths-input')
    if (lengthsInput) lengthsInput.addEventListener('change', e => { state.detail.lengths = e.target.value })

    // Guided flow: start / navigate
    sheet.querySelector('#start-flow')?.addEventListener('click', () => {
      const exercises = session?.log?.exercises ?? []
      const steps = buildFlowSteps(exercises)
      if (steps.length === 0) return
      state.flow = { steps, stepIndex: firstIncompleteStepIndex(steps, state) }
      render()
    })

    sheet.querySelector('#flow-weight')?.addEventListener('input', e => {
      const step = state.flow.steps[state.flow.stepIndex]
      setDetailValue(state, step.ex.name, step.setIndex, 'weight', e.target.value)
    })
    sheet.querySelector('#flow-reps')?.addEventListener('input', e => {
      const step = state.flow.steps[state.flow.stepIndex]
      setDetailValue(state, step.ex.name, step.setIndex, 'reps', e.target.value)
    })
    sheet.querySelector('#flow-done-toggle')?.addEventListener('click', () => {
      const step = state.flow.steps[state.flow.stepIndex]
      const current = state.detail?.exercises?.[step.ex.name]?.[step.setIndex]?.done
      setDetailValue(state, step.ex.name, step.setIndex, 'done', !current)
      render()
    })
    sheet.querySelector('#flow-next')?.addEventListener('click', () => {
      advanceFlow(1)
      render()
    })
    sheet.querySelector('#flow-back')?.addEventListener('click', () => {
      advanceFlow(-1)
      render()
    })

    // Supplements
    sheet.querySelectorAll('.supplement-item').forEach(item => {
      item.addEventListener('click', () => {
        const name = item.dataset.name
        const idx = state.supplements.indexOf(name)
        if (idx >= 0) state.supplements.splice(idx, 1)
        else state.supplements.push(name)
        render()
      })
    })

    // Fasting
    sheet.querySelectorAll('.fasting-option').forEach(opt => {
      opt.addEventListener('click', () => {
        state.fasting = opt.dataset.value
        render()
      })
    })

    // Complete
    sheet.querySelector('#complete-btn')?.addEventListener('click', () => {
      state.completed = true
      save(true)
    })
    sheet.querySelector('#uncomplete-btn')?.addEventListener('click', () => {
      state.completed = false
      render()
    })
  }

  function save(withCelebration) {
    const rec = {
      date,
      activityId: state.activityId,
      activityType: state.activityType,
      activityLabel: state.activityLabel,
      completed: state.completed,
      detail: state.detail,
      supplements: state.supplements,
      fasting: state.fasting,
    }
    onSave(rec, withCelebration && state.completed)
  }

  render()
  overlay.appendChild(sheet)
  return overlay
}

function setDetailValue(state, exName, setIndex, field, value) {
  if (!state.detail.exercises) state.detail.exercises = {}
  if (!state.detail.exercises[exName]) state.detail.exercises[exName] = []
  if (!state.detail.exercises[exName][setIndex]) state.detail.exercises[exName][setIndex] = {}
  state.detail.exercises[exName][setIndex][field] = value
}

function renderActivitySummary(state) {
  return `
    <div class="session-option selected" id="activity-summary">
      <div class="session-option-name">${escHtml(state.activityLabel ?? '')}</div>
      <div class="activity-summary-change">
        <span>Change</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 3l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
    </div>
  `
}

function renderSessionOption(session, flags, state) {
  const isFlagged = flags.length > 0
  const isSelected = session.id === '__custom__'
    ? state.activityType === 'custom'
    : session.id === 'rest'
    ? state.activityType === 'rest' || state.activityId === 'rest'
    : state.activityId === session.id

  let cls = 'session-option'
  if (isSelected) cls += ' selected'
  if (isFlagged && !isSelected) cls += ' flagged'

  const reason = flags.map(f => FLAG_LABELS[f]).join(' · ')

  return `
    <div class="${cls}" data-id="${session.id}">
      <div>
        <div class="session-option-name">${escHtml(session.name)}</div>
        ${isFlagged ? `<div class="session-option-reason">${escHtml(reason)}</div>` : ''}
      </div>
      ${isSelected ? `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9l4.5 4.5L15 5" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
    </div>
  `
}

// ── Guided one-set-at-a-time flow ──────────────────────────────────────
// Each exercise contributes one step per set (or a single step for
// done/checkbox-tracked exercises like Plank).

function buildFlowSteps(exercises) {
  const steps = []
  for (const ex of exercises) {
    if (ex.track?.includes('done')) {
      steps.push({ ex, setIndex: 0, kind: 'done' })
    } else {
      const count = ex.defaultSets ?? 1
      for (let si = 0; si < count; si++) {
        steps.push({ ex, setIndex: si, kind: 'value' })
      }
    }
  }
  return steps
}

function isStepFilled(state, step) {
  const { ex, setIndex, kind } = step
  const set = state.detail?.exercises?.[ex.name]?.[setIndex]
  if (kind === 'done') return !!set?.done
  const tracksWeight = ex.track?.includes('weight')
  const tracksReps = ex.track?.includes('reps')
  const weightOk = !tracksWeight || (set?.weight ?? '') !== ''
  const repsOk = !tracksReps || (set?.reps ?? '') !== ''
  return weightOk && repsOk
}

function firstIncompleteStepIndex(steps, state) {
  const idx = steps.findIndex(step => !isStepFilled(state, step))
  return idx === -1 ? 0 : idx
}

function hasAnyLoggedData(exercises, state) {
  return exercises.some(ex => {
    const sets = state.detail?.exercises?.[ex.name]
    if (!sets) return false
    return sets.some(s => (s?.weight ?? '') !== '' || (s?.reps ?? '') !== '' || s?.done)
  })
}

function renderFlowScreen(state) {
  const { steps, stepIndex } = state.flow
  const step = steps[stepIndex]
  const { ex, setIndex, kind } = step
  const isLast = stepIndex === steps.length - 1
  const nextStep = steps[stepIndex + 1]
  const nextLabel = isLast ? 'Finish' : (nextStep && nextStep.ex !== ex ? 'Next exercise' : 'Next set')
  const current = state.detail?.exercises?.[ex.name]?.[setIndex] ?? {}
  const tracksWeight = ex.track?.includes('weight')
  const tracksReps = ex.track?.includes('reps')
  const setCount = ex.defaultSets ?? 1

  return `
    <div class="flow-screen">
      <div class="flow-top">
        <div class="flow-progress">Step ${stepIndex + 1} of ${steps.length}</div>
        <div class="flow-exercise-name">${escHtml(ex.name)}</div>
        ${kind === 'value' && setCount > 1 ? `<div class="flow-set-label">Set ${setIndex + 1} of ${setCount}</div>` : ''}
        ${ex.repRange ? `<div class="exercise-target">${ex.repRange[0]}–${ex.repRange[1]} reps</div>` : ''}
        ${ex.target ? `<div class="exercise-target">${escHtml(ex.target)}</div>` : ''}

        ${kind === 'done' ? `
          <button class="flow-done-btn ${current.done ? 'checked' : ''}" id="flow-done-toggle">
            ${current.done ? '✓ Done' : 'Mark done'}
          </button>
        ` : `
          <div class="set-input-group flow-input-group">
            ${tracksWeight ? `
              <input type="number" class="set-input flow-input" id="flow-weight" inputmode="decimal" placeholder="—" value="${escHtml(current.weight ?? '')}" />
              <span class="set-input-label">kg</span>
              <span class="set-input-label" style="margin:0 2px">×</span>
            ` : ''}
            ${tracksReps ? `
              <input type="number" class="set-input flow-input" id="flow-reps" inputmode="numeric" placeholder="—" value="${escHtml(current.reps ?? '')}" />
              <span class="set-input-label">reps</span>
            ` : ''}
          </div>
        `}
      </div>

      <div class="flow-nav">
        ${stepIndex > 0 ? `<button class="btn btn-ghost flow-back-btn" id="flow-back">Back</button>` : ''}
        <button class="btn btn-primary flow-next-btn" id="flow-next">${nextLabel}</button>
      </div>
    </div>
  `
}

function renderExerciseRow(ex, state) {
  const defaultCount = ex.defaultSets ?? 1
  const emptySet = ex.track?.includes('done') ? { done: false } : { weight: '', reps: '' }
  const sets = state.detail?.exercises?.[ex.name] ?? Array.from({ length: defaultCount }, () => ({ ...emptySet }))
  const tracksWeight = ex.track?.includes('weight')
  const tracksReps = ex.track?.includes('reps')
  const tracksDone = ex.track?.includes('done')

  return `
    <div class="exercise-row">
      <div class="exercise-name">${escHtml(ex.name)}</div>
      ${ex.repRange ? `<div class="exercise-target">${ex.repRange[0]}–${ex.repRange[1]} reps</div>` : ''}
      ${ex.target ? `<div class="exercise-target">${escHtml(ex.target)}</div>` : ''}
      ${tracksDone ? `
        <label class="done-row">
          <input type="checkbox" ${sets[0]?.done ? 'checked' : ''} data-ex="${escHtml(ex.name)}" class="set-done" />
          <span class="done-label">Done</span>
        </label>
      ` : `
        <div class="sets-row">
          ${sets.map((set, si) => `
            <div class="set-input-group">
              ${tracksWeight ? `
                <input type="number" class="set-input set-weight" inputmode="decimal" placeholder="—" value="${escHtml(set.weight ?? '')}" data-ex="${escHtml(ex.name)}" data-set="${si}" />
                <span class="set-input-label">kg</span>
                <span class="set-input-label" style="margin:0 2px">×</span>
              ` : ''}
              ${tracksReps ? `
                <input type="number" class="set-input set-reps" inputmode="numeric" placeholder="—" value="${escHtml(set.reps ?? '')}" data-ex="${escHtml(ex.name)}" data-set="${si}" />
                <span class="set-input-label">reps</span>
              ` : ''}
            </div>
          `).join('')}
          <button class="add-set-btn" data-ex="${escHtml(ex.name)}">+ Set</button>
        </div>
      `}
    </div>
  `
}

// Renders the entry button (fresh), the guided flow (active), or the
// glanceable all-fields view (once something has been logged).
function renderExerciseLogSection(exercises, state, label) {
  if (exercises.length === 0) return ''

  if (state.flow) return renderFlowScreen(state)

  const hasData = hasAnyLoggedData(exercises, state)

  if (!hasData) {
    return `
      <div class="log-section">
        <div class="section-label">${escHtml(label)}</div>
        <button class="btn btn-primary btn-full" id="start-flow">Log exercise</button>
      </div>
    `
  }

  return `
    <div class="log-section">
      <div class="section-label">${escHtml(label)}</div>
      ${exercises.map(ex => renderExerciseRow(ex, state)).join('')}
      <button class="btn btn-ghost btn-full" id="start-flow">Continue guided log</button>
    </div>
  `
}

function renderLogDetail(session, state) {
  if (!session.log || session.log.type === 'completion') return ''

  if (session.log.type === 'sets') {
    const exercises = session.log.exercises ?? []
    return renderExerciseLogSection(exercises, state, 'Log (optional)')
  }

  if (session.log.type === 'single') {
    const tracksDistance = session.log.track?.includes('distance')
    const tracksLengths = session.log.track?.includes('lengths')
    const exercises = session.log.exercises ?? []
    const hasMetric = tracksDistance || tracksLengths

    // The guided flow takes over the whole log area while active — the
    // metric field can wait until it's done or exited.
    if (state.flow) return renderFlowScreen(state)

    const metricSection = hasMetric ? `
      <div class="log-section">
        <div class="section-label">Log (optional)</div>
        <div class="metric-input-row">
          ${tracksDistance ? `
            <input type="number" id="distance-input" class="metric-input" inputmode="decimal"
              placeholder="0" value="${state.detail?.distance ?? ''}" />
            <span class="metric-unit">metres</span>
          ` : ''}
          ${tracksLengths ? `
            <input type="number" id="lengths-input" class="metric-input" inputmode="numeric"
              placeholder="0" value="${state.detail?.lengths ?? ''}" />
            <span class="metric-unit">lengths</span>
          ` : ''}
        </div>
      </div>
    ` : ''

    const exerciseSection = renderExerciseLogSection(exercises, state, session.log.exerciseLabel ?? 'Exercises (optional)')

    return metricSection + exerciseSection
  }

  return ''
}

function renderSupplements(supplements, state) {
  return `
    <div class="log-section">
      <div class="section-label">Supplements</div>
      <div class="card supplement-list" style="padding:0 16px">
        ${supplements.map(s => {
          const checked = state.supplements.includes(s.name)
          return `
            <div class="supplement-item ${checked ? 'checked' : ''}" data-name="${escHtml(s.name)}">
              <div class="supplement-check">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div class="supplement-info">
                <div class="supplement-name">${escHtml(s.name)}</div>
                <div class="supplement-detail">${escHtml(s.dose)} · ${escHtml(s.timing)}</div>
              </div>
            </div>
          `
        }).join('')}
      </div>
    </div>
  `
}

function renderFasting(state, plan) {
  const window = plan.fasting?.window
  const windowStr = window ? `${window.start}–${window.end}` : ''

  return `
    <div class="log-section">
      <div class="section-label">Fasting ${windowStr ? `· ${windowStr}` : ''}</div>
      <div class="fasting-row">
        ${[
          { value: 'held', icon: '✓', label: 'Held' },
          { value: 'broke-early', icon: '↩', label: 'Broke early' },
          { value: 'not-today', icon: '—', label: 'Not today' },
        ].map(opt => `
          <button class="fasting-option ${state.fasting === opt.value ? 'selected' : ''}" data-value="${opt.value}">
            <span class="fasting-icon">${opt.icon}</span>
            <span class="fasting-label">${opt.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
