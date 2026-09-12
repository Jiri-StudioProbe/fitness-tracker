import { formatDayHeader, today } from '../dates.js'
import { recommendDay, FLAG } from '../engine.js'
import { getSessionById, getSupplementsForDay } from '../plan.js'
import { showConfirm } from '../dialogs.js'
import { mountWheelPicker } from './wheelPicker.js'

// Practical bounds for the guided flow's drag-to-scrub weight/reps wheels
// — a wheel needs a fixed range to spin through, unlike a free-text
// number input. Generous enough for any real set; not user-configurable.
const WHEEL_WEIGHT_MIN = 0, WHEEL_WEIGHT_MAX = 150
const WHEEL_REPS_MIN = 0, WHEEL_REPS_MAX = 40

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

  const sheet = document.createElement('div')
  sheet.className = 'sheet'

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
    // Whether the Activity Log page (its own full page, opened from the
    // Day page) is showing.
    logOpen: false,
  }

  function currentSession() {
    if (state.activityType === 'custom' || state.activityType === 'rest') return null
    return state.activityId ? getSessionById(plan, state.activityId) : null
  }

  function hasAnythingToClear() {
    return !!(
      state.activityId || state.activityType || state.completed ||
      state.supplements.length || state.fasting ||
      Object.keys(state.detail).length
    )
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
    const logApplicable = !!(session?.log && session.log.type !== 'completion')

    sheet.innerHTML = `
      <div class="sheet-header">
        <div class="flex items-center justify-between">
          <span class="sheet-title">${state.logOpen
            ? escHtml(state.activityLabel ?? 'Log')
            : formatDayHeader(date)}</span>
          <button class="btn-icon" id="close-btn">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
        </div>
        ${!state.logOpen && state.completed ? '<span class="phase-pill text-accent" style="border-color:var(--accent);background:var(--accent-dim)">Completed ✓</span>' : ''}
      </div>
      <div class="sheet-body">
        ${state.logOpen ? (session ? renderLogDetail(session, state, dayRecords, date) : '') : `

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

          <!-- Activity log entry point — its own full page -->
          ${logApplicable ? `
            <div class="log-section">
              <div class="section-label">Log (optional)</div>
              <button class="btn btn-ghost btn-full" id="open-log">Open activity log ›</button>
            </div>
          ` : ''}

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

          ${hasAnythingToClear() ? `
            <button class="btn btn-full btn-danger" id="clear-day-btn" style="margin-top:16px">Clear day</button>
          ` : ''}

        `}
      </div>
    `

    // Bind events
    sheet.querySelector('#close-btn').addEventListener('click', () => {
      // Three levels deep, closest first: exiting the guided flow drops
      // back to the Activity Log page's glanceable view; closing the
      // Activity Log page drops back to the Day page; closing the Day
      // page returns to the Week page. Nothing entered is lost at any
      // level — each is just a view state, not a discard.
      if (state.flow) {
        state.flow = null
        render()
      } else if (state.logOpen) {
        state.logOpen = false
        render()
      } else {
        save(false)
      }
    })

    sheet.querySelector('#open-log')?.addEventListener('click', () => {
      state.logOpen = true
      // If the Activity Log page would show nothing but the 'Log exercise'
      // button (no metric field, nothing logged yet), skip straight past
      // it into the flow instead of landing on an empty-feeling page.
      if (logHasOnlyEntryButton(session, state)) {
        const steps = buildFlowSteps(normalizeBlocks(session.log))
        if (steps.length > 0) {
          state.flow = { steps, stepIndex: firstIncompleteStepIndex(steps, state) }
        }
      }
      render()
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
      const steps = buildFlowSteps(session?.log ? normalizeBlocks(session.log) : [])
      if (steps.length === 0) return
      state.flow = { steps, stepIndex: firstIncompleteStepIndex(steps, state) }
      render()
    })

    // Guided flow: drag-to-scrub weight/reps wheels, mounted fresh on
    // every render (same model as the innerHTML they live in — there's
    // no persistent-component update path here). A drag survives a
    // render because nothing calls render() again until the value
    // actually commits on release; see wheelPicker.js.
    if (state.flow) {
      const step = state.flow.steps[state.flow.stepIndex]
      const existing = state.detail?.exercises?.[step.ex.name]?.[step.setIndex]
      const prevSet = findPreviousSet(dayRecords, date, step.ex.name, step.setIndex)

      function mountFlowWheel(id, field, min, max) {
        const mask = sheet.querySelector(id)
        if (!mask) return
        const hasExisting = existing?.[field] !== undefined && existing[field] !== ''
        const fallback = prevSet?.[field] !== undefined && prevSet[field] !== '' ? Number(prevSet[field]) : 0
        const startValue = hasExisting ? Number(existing[field]) : fallback
        // Seed state with the starting value immediately (previous
        // session's number, or 0) so what the wheel shows and what gets
        // saved never disagree — dragging then adjusts it from there.
        if (!hasExisting) setDetailValue(state, step.ex.name, step.setIndex, field, String(startValue))
        mountWheelPicker(mask, {
          min, max, value: startValue,
          onChange: v => setDetailValue(state, step.ex.name, step.setIndex, field, String(v)),
        })
      }
      mountFlowWheel('#flow-weight-wheel', 'weight', WHEEL_WEIGHT_MIN, WHEEL_WEIGHT_MAX)
      mountFlowWheel('#flow-reps-wheel', 'reps', WHEEL_REPS_MIN, WHEEL_REPS_MAX)

      // Swipe left/right anywhere in the flow header (but not on a wheel,
      // which owns its own vertical drag) to move between sets/exercises
      // — the same action as the Back/Next buttons below, just gestural.
      const flowTop = sheet.querySelector('.flow-top')
      const flowScreenEl = sheet.querySelector('.flow-screen')
      if (flowTop && flowScreenEl) {
        const SLIDE_MS = 220
        const SLIDE_EASE = 'cubic-bezier(.2,.8,.2,1)'

        // render() replaces the whole sheet, so the outgoing .flow-screen
        // is gone the instant advanceFlow's step changes — without a
        // snapshot, a swipe or a tap would cut straight to the new step
        // with no motion at all. Cloning it lets the exit keep sliding
        // (in whatever direction it was already heading) while the real
        // re-render happens underneath, and the fresh .flow-screen starts
        // just off the opposite edge and eases in — the pair reads as one
        // continuous slide rather than an exit and an unrelated entrance.
        function slideToNewStep(dir) {
          const rect = flowScreenEl.getBoundingClientRect()
          const clone = flowScreenEl.cloneNode(true)
          clone.style.position = 'fixed'
          clone.style.left = rect.left + 'px'
          clone.style.top = rect.top + 'px'
          clone.style.width = rect.width + 'px'
          clone.style.margin = '0'
          clone.style.pointerEvents = 'none'
          clone.style.zIndex = '50'
          clone.style.transition = `transform ${SLIDE_MS}ms ${SLIDE_EASE}, opacity ${SLIDE_MS}ms ${SLIDE_EASE}`
          document.body.appendChild(clone)
          requestAnimationFrame(() => {
            clone.style.transform = `translateX(${dir > 0 ? -rect.width : rect.width}px)`
            clone.style.opacity = '0'
          })
          setTimeout(() => clone.remove(), SLIDE_MS + 40)

          advanceFlow(dir)
          render()

          const freshScreen = sheet.querySelector('.flow-screen')
          if (freshScreen) {
            freshScreen.style.transition = 'none'
            freshScreen.style.transform = `translateX(${dir > 0 ? rect.width : -rect.width}px)`
            freshScreen.getBoundingClientRect() // force layout before animating away from it
            freshScreen.style.transition = `transform ${SLIDE_MS}ms ${SLIDE_EASE}`
            freshScreen.style.transform = 'translateX(0px)'
          }
        }

        let swiping = false
        let swipeStartX = 0
        let swipePointerId = null
        flowTop.addEventListener('pointerdown', e => {
          if (e.target.closest('.flow-wheel-mask')) return
          swiping = true
          swipeStartX = e.clientX
          swipePointerId = e.pointerId
          // Best-effort — a failure here must not stop the swipe from
          // being tracked below.
          try { flowTop.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
        })
        flowTop.addEventListener('pointermove', e => {
          if (!swiping) return
          flowScreenEl.style.transition = ''
          flowScreenEl.style.transform = `translateX(${e.clientX - swipeStartX}px)`
        })
        function endSwipe(e) {
          if (!swiping) return
          swiping = false
          const dx = e.clientX - swipeStartX
          // Relative to the header's own width, same ratio as the drag
          // sensitivity tuned in the standalone prototype — a fixed px
          // threshold doesn't scale the same way across phone widths.
          const threshold = flowTop.clientWidth * 0.18
          // Mirrors the Back button's own guard (it doesn't render on the
          // first step either) — swiping right there has nothing to do.
          if (dx <= -threshold) {
            slideToNewStep(1)
          } else if (dx >= threshold && state.flow.stepIndex > 0) {
            slideToNewStep(-1)
          } else {
            flowScreenEl.style.transition = `transform ${SLIDE_MS}ms ${SLIDE_EASE}`
            flowScreenEl.style.transform = 'translateX(0px)'
          }
          // Release is best-effort cleanup — do it last, after the real
          // navigation/snap-back action above, never gating it.
          try { if (swipePointerId !== null) flowTop.releasePointerCapture?.(swipePointerId) } catch { /* ignore */ }
        }
        flowTop.addEventListener('pointerup', endSwipe)
        flowTop.addEventListener('pointercancel', endSwipe)

        // Buttons drive the exact same slide, so navigating by tap reads
        // as the same motion as navigating by swipe.
        sheet.querySelector('#flow-next')?.addEventListener('click', () => slideToNewStep(1))
        sheet.querySelector('#flow-back')?.addEventListener('click', () => slideToNewStep(-1))
      }
    }

    sheet.querySelector('#flow-done-toggle')?.addEventListener('click', () => {
      const step = state.flow.steps[state.flow.stepIndex]
      const current = state.detail?.exercises?.[step.ex.name]?.[step.setIndex]?.done
      setDetailValue(state, step.ex.name, step.setIndex, 'done', !current)
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

    // Clear day — wipes everything chosen/logged for this date and saves
    // it that way, so the Week view shows this day empty again. save()
    // already closes the sheet (see #close-btn above), returning to Week.
    sheet.querySelector('#clear-day-btn')?.addEventListener('click', () => {
      showConfirm('Clear this day? This removes the activity, log, and completion status — the day will show as empty.', 'Clear day', () => {
        state.activityId = null
        state.activityType = null
        state.activityLabel = null
        state.completed = false
        state.detail = {}
        state.supplements = []
        state.fasting = null
        state.customText = ''
        save(false)
      })
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

// ── Exercise blocks ──────────────────────────────────────────────────
// A session's exercise log is an ordered list of blocks:
//   { kind: 'sequential', exercise }              — one exercise, all its
//                                                     sets back-to-back
//   { kind: 'circuit', rounds, exercises, label? } — several exercises,
//                                                     one set of each per
//                                                     round, for `rounds`
//                                                     rounds
// Blocks can mix freely in one session (e.g. row's own distance metric
// followed by a sequential exercise, followed by a circuit).
//
// normalizeBlocks() also reads the older flat 'exercises' + 'order'
// shape for plans authored before blocks existed.

function normalizeBlocks(log) {
  if (Array.isArray(log?.blocks)) return log.blocks
  const exercises = log?.exercises ?? []
  if (exercises.length === 0) return []
  if (log.order === 'circuit') {
    return [{
      kind: 'circuit',
      rounds: Math.max(1, ...exercises.map(ex => ex.defaultSets ?? 1)),
      label: log.exerciseLabel,
      exercises,
    }]
  }
  return exercises.map(ex => ({ kind: 'sequential', exercise: ex }))
}

function blockExercises(block) {
  return block.kind === 'circuit' ? block.exercises : [block.exercise]
}

function allExercises(blocks) {
  return blocks.flatMap(blockExercises)
}

// ── Guided one-set-at-a-time flow ──────────────────────────────────────
// Each exercise contributes one step per set (or a single step for
// done/checkbox-tracked exercises like Plank). Sequential blocks walk
// through the one exercise's sets in order; circuit blocks interleave
// one set of every exercise in the block per round.

function buildFlowSteps(blocks) {
  const isDone = ex => !!ex.track?.includes('done')
  const kindOf = ex => isDone(ex) ? 'done' : 'value'

  const steps = []
  for (const block of blocks) {
    if (block.kind === 'circuit') {
      // Round count is the block's own `rounds`, not any per-exercise
      // defaultSets (circuit members don't carry their own set count —
      // the whole group repeats together). A done/checkbox exercise
      // nested in a circuit still only needs marking once, though.
      const rounds = block.rounds ?? 1
      for (let round = 0; round < rounds; round++) {
        for (const ex of block.exercises) {
          if (isDone(ex) && round > 0) continue
          steps.push({ ex, setIndex: round, kind: kindOf(ex), block })
        }
      }
    } else {
      const ex = block.exercise
      const setCount = isDone(ex) ? 1 : (ex.defaultSets ?? 1)
      for (let si = 0; si < setCount; si++) {
        steps.push({ ex, setIndex: si, kind: kindOf(ex), block })
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

// ── Previous-performance hints ──────────────────────────────────────
// Looks back through history (never the day currently open) for the
// most recent day that logged this exercise, so the log screen can show
// it as lightweight context ("here's what you did last time") without
// pre-filling or auto-copying it into today's entry. Matches by exercise
// name — the same name across sessions/weeks is treated as the same
// exercise, same as the rest of the logging model.
function findPreviousSet(dayRecords, date, exName, setIndex) {
  const priorDates = Object.keys(dayRecords).filter(d => d < date).sort().reverse()
  for (const d of priorDates) {
    const sets = dayRecords[d]?.detail?.exercises?.[exName]
    if (!sets || sets.length === 0) continue
    const set = sets[setIndex] ?? sets[sets.length - 1]
    const hasValue = set && ((set.weight ?? '') !== '' || (set.reps ?? '') !== '' || set.done)
    if (hasValue) return set
  }
  return null
}

function formatPrevSetValue(ex, set) {
  if (!set) return ''
  if (ex.track?.includes('done')) return set.done ? 'Done ✓' : ''
  const parts = []
  if (ex.track?.includes('weight') && (set.weight ?? '') !== '') parts.push(`${set.weight}kg`)
  if (ex.track?.includes('reps') && (set.reps ?? '') !== '') parts.push(`${set.reps} reps`)
  return parts.length ? parts.join(' / ') : ''
}

// Two-line hint: a small "Previously" label, then the value itself sized
// to match the actual entry field it sits above — big and glanceable,
// the same as the number you're about to type over it.
function renderPrevHint(ex, set, cls) {
  const value = formatPrevSetValue(ex, set)
  if (!value) return ''
  return `
    <div class="${cls}">
      <div class="prev-hint-label">Previously</div>
      <div class="prev-hint-value">${escHtml(value)}</div>
    </div>
  `
}

function hasAnyLoggedData(blocks, state) {
  return allExercises(blocks).some(ex => {
    const sets = state.detail?.exercises?.[ex.name]
    if (!sets) return false
    return sets.some(s => (s?.weight ?? '') !== '' || (s?.reps ?? '') !== '' || s?.done)
  })
}

// True when the Activity Log page would render nothing but the
// 'Log exercise' entry button — no metric field, nothing logged yet —
// so the Day page can skip straight into the flow instead.
function logHasOnlyEntryButton(session, state) {
  if (!session?.log) return false
  const blocks = normalizeBlocks(session.log)
  if (blocks.length === 0) return false
  const hasMetric = session.log.type === 'single' &&
    (session.log.track?.includes('distance') || session.log.track?.includes('lengths'))
  if (hasMetric) return false
  return !hasAnyLoggedData(blocks, state)
}

function renderFlowScreen(state, dayRecords, date) {
  const { steps, stepIndex } = state.flow
  const step = steps[stepIndex]
  const { ex, setIndex, kind, block } = step
  const isLast = stepIndex === steps.length - 1
  const nextStep = steps[stepIndex + 1]
  const isCircuit = block.kind === 'circuit'
  const nextLabel = isLast ? 'Finish'
    : (!nextStep || nextStep.block !== block) ? 'Next block'
    : nextStep.ex !== ex ? 'Next exercise'
    : isCircuit ? 'Next round' : 'Next set'
  const current = state.detail?.exercises?.[ex.name]?.[setIndex] ?? {}
  const tracksWeight = ex.track?.includes('weight')
  const tracksReps = ex.track?.includes('reps')
  const setCount = isCircuit ? (block.rounds ?? 1) : (ex.defaultSets ?? 1)
  const progressPct = Math.round(((stepIndex + 1) / steps.length) * 100)
  const prevHint = renderPrevHint(ex, findPreviousSet(dayRecords, date, ex.name, setIndex), 'flow-prev-hint')

  return `
    <div class="flow-screen">
      <div class="flow-top">
        <div class="flow-progress-bar"><div class="flow-progress-fill" style="width:${progressPct}%"></div></div>
        ${isCircuit ? `<div class="flow-circuit-label">${escHtml(block.label || 'Circuit')}</div>` : ''}
        <div class="flow-exercise-name">${escHtml(ex.name)}</div>
        ${kind === 'value' && setCount > 1 ? `<div class="flow-set-label">${isCircuit ? 'Round' : 'Set'} ${setIndex + 1} of ${setCount}</div>` : ''}
        ${ex.repRange ? `<div class="exercise-target">${ex.repRange[0]}–${ex.repRange[1]} reps</div>` : ''}
        ${ex.target ? `<div class="exercise-target">${escHtml(ex.target)}</div>` : ''}
        ${prevHint}

        ${kind === 'done' ? `
          <button class="flow-done-btn ${current.done ? 'checked' : ''}" id="flow-done-toggle">
            ${current.done ? '✓ Done' : 'Mark done'}
          </button>
        ` : `
          <div class="flow-wheel-group">
            ${tracksWeight ? `
              <div class="flow-wheel-col">
                <div id="flow-weight-wheel"></div>
                <div class="flow-wheel-unit">kg</div>
              </div>
            ` : ''}
            ${tracksReps ? `
              <div class="flow-wheel-col">
                <div id="flow-reps-wheel"></div>
                <div class="flow-wheel-unit">reps</div>
              </div>
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

function renderExerciseRow(ex, state, dayRecords, date) {
  const defaultCount = ex.defaultSets ?? 1
  const emptySet = ex.track?.includes('done') ? { done: false } : { weight: '', reps: '' }
  const sets = state.detail?.exercises?.[ex.name] ?? Array.from({ length: defaultCount }, () => ({ ...emptySet }))
  const tracksWeight = ex.track?.includes('weight')
  const tracksReps = ex.track?.includes('reps')
  const tracksDone = ex.track?.includes('done')
  const doneHint = tracksDone ? renderPrevHint(ex, findPreviousSet(dayRecords, date, ex.name, 0), 'set-prev-hint') : ''

  return `
    <div class="exercise-row">
      <div class="exercise-name">${escHtml(ex.name)}</div>
      ${ex.repRange ? `<div class="exercise-target">${ex.repRange[0]}–${ex.repRange[1]} reps</div>` : ''}
      ${ex.target ? `<div class="exercise-target">${escHtml(ex.target)}</div>` : ''}
      ${tracksDone ? `
        ${doneHint}
        <label class="done-row">
          <input type="checkbox" ${sets[0]?.done ? 'checked' : ''} data-ex="${escHtml(ex.name)}" class="set-done" />
          <span class="done-label">Done</span>
        </label>
      ` : `
        <div class="sets-row">
          ${sets.map((set, si) => {
            const prevHint = renderPrevHint(ex, findPreviousSet(dayRecords, date, ex.name, si), 'set-prev-hint')
            return `
            <div class="set-with-hint">
              ${prevHint}
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
            </div>
          `}).join('')}
          <button class="add-set-btn" data-ex="${escHtml(ex.name)}">+ Set</button>
        </div>
      `}
    </div>
  `
}

// A circuit block wraps its exercises in a bordered group with a header
// (rounds + optional label) so it's visually obvious on the glanceable
// view which exercises belong together as one circuit, as opposed to
// sequential blocks which just render as standalone exercise cards.
function renderBlock(block, state, dayRecords, date) {
  if (block.kind !== 'circuit') return renderExerciseRow(block.exercise, state, dayRecords, date)

  const rounds = block.rounds ?? Math.max(1, ...block.exercises.map(ex => ex.defaultSets ?? 1))
  return `
    <div class="circuit-block">
      <div class="circuit-block-header">
        <span class="circuit-badge">Circuit</span>
        <span class="circuit-rounds">× ${rounds} round${rounds === 1 ? '' : 's'}</span>
        ${block.label ? `<span class="circuit-block-label">${escHtml(block.label)}</span>` : ''}
      </div>
      <div class="circuit-block-exercises">
        ${block.exercises.map(ex => renderExerciseRow(ex, state, dayRecords, date)).join('')}
      </div>
    </div>
  `
}

// Renders the entry button (fresh), the guided flow (active), or the
// glanceable all-fields view (once something has been logged).
function renderExerciseLogSection(blocks, state, label, dayRecords, date) {
  if (blocks.length === 0) return ''

  if (state.flow) return renderFlowScreen(state, dayRecords, date)

  const hasData = hasAnyLoggedData(blocks, state)

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
      ${blocks.map(b => renderBlock(b, state, dayRecords, date)).join('')}
      <button class="btn btn-ghost btn-full" id="start-flow">Continue guided log</button>
    </div>
  `
}

function renderLogDetail(session, state, dayRecords, date) {
  if (!session.log || session.log.type === 'completion') return ''

  if (session.log.type === 'sets') {
    return renderExerciseLogSection(normalizeBlocks(session.log), state, 'Log (optional)', dayRecords, date)
  }

  if (session.log.type === 'single') {
    const tracksDistance = session.log.track?.includes('distance')
    const tracksLengths = session.log.track?.includes('lengths')
    const blocks = normalizeBlocks(session.log)
    const hasMetric = tracksDistance || tracksLengths

    // The guided flow takes over the whole log area while active — the
    // metric field can wait until it's done or exited.
    if (state.flow) return renderFlowScreen(state, dayRecords, date)

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

    const exerciseSection = renderExerciseLogSection(blocks, state, 'Exercises (optional)', dayRecords, date)

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
