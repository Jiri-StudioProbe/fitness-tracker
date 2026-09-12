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

    // Guided flow: every step is a peeking panel on a persistent
    // horizontal track (matching the tuned prototype's architecture —
    // see renderFlowScreen). All wheels for all steps mount up front,
    // same as the prototype, since a lazily-swapped single panel is what
    // made the old clone-based slide feel different from it. Navigating
    // between steps only ever translates .flow-track and updates the
    // shared chrome (progress bar, Back/Next) — it never calls the outer
    // render(), so the deck's own DOM (and any wheel mid-drag) survives
    // untouched. render() only runs again on actually leaving the flow.
    if (state.flow) {
      const { steps } = state.flow

      steps.forEach((step, i) => {
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
        mountFlowWheel(`#flow-weight-wheel-${i}`, 'weight', WHEEL_WEIGHT_MIN, WHEEL_WEIGHT_MAX)
        mountFlowWheel(`#flow-reps-wheel-${i}`, 'reps', WHEEL_REPS_MIN, WHEEL_REPS_MAX)
      })

      const deck = sheet.querySelector('#flow-deck')
      const track = sheet.querySelector('#flow-track')
      const progressFill = sheet.querySelector('#flow-progress-fill')
      const backBtn = sheet.querySelector('#flow-back')
      const nextBtn = sheet.querySelector('#flow-next')

      if (deck && track) {
        // Same numbers as the tuned prototype's deck: a fixed 64px margin
        // (32px peeking on each side) and 20px gap between panels, so
        // neighbours are visibly sliced at rest, not just during a drag.
        const GAP = 20
        const SIDE_MARGIN = 64
        const SLIDE_MS = 380
        const SLIDE_EASE = 'cubic-bezier(.2,.8,.2,1)'
        let panelW = Math.max(0, deck.clientWidth - SIDE_MARGIN)

        track.querySelectorAll('.flow-panel').forEach(panel => {
          panel.style.width = panelW + 'px'
          panel.style.marginRight = GAP + 'px'
        })

        const centerOffset = () => (deck.clientWidth - panelW) / 2
        const clampIndex = i => Math.min(steps.length - 1, Math.max(0, i))

        function updateChrome(index) {
          const pct = Math.round(((index + 1) / steps.length) * 100)
          if (progressFill) progressFill.style.width = pct + '%'
          if (backBtn) backBtn.style.visibility = index === 0 ? 'hidden' : ''
          if (nextBtn) nextBtn.textContent = computeNextLabel(steps, index)
        }

        function goTo(index, animate = true) {
          index = clampIndex(index)
          state.flow.stepIndex = index
          track.style.transition = animate ? `transform ${SLIDE_MS}ms ${SLIDE_EASE}` : 'none'
          track.style.transform = `translateX(${centerOffset() - index * (panelW + GAP)}px)`
          updateChrome(index)
        }

        // Land on the step the flow actually opened on — no transition,
        // this is the initial position, not a navigation.
        goTo(state.flow.stepIndex, false)

        let dragging = false
        let baseX = 0
        let dragStartX = 0
        let dragPointerId = null

        function currentTranslateX() {
          const m = /translateX\(([-\d.]+)px\)/.exec(track.style.transform)
          return m ? parseFloat(m[1]) : centerOffset() - state.flow.stepIndex * (panelW + GAP)
        }

        deck.addEventListener('pointerdown', e => {
          if (e.target.closest('.flow-wheel-mask')) return // a wheel owns its own vertical drag
          dragging = true
          baseX = currentTranslateX()
          dragStartX = e.clientX
          dragPointerId = e.pointerId
          track.style.transition = 'none'
          // Best-effort — a failure here must not stop the drag from
          // being tracked below.
          try { deck.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
        })
        deck.addEventListener('pointermove', e => {
          if (!dragging) return
          track.style.transform = `translateX(${baseX + (e.clientX - dragStartX)}px)`
        })
        function endDrag(e) {
          if (!dragging) return
          dragging = false
          const dx = e.clientX - dragStartX
          // Relative to the panel's own width, same ratio tuned in the
          // standalone prototype — a fixed px threshold doesn't scale
          // the same way across phone widths.
          const threshold = panelW * 0.18
          if (dx <= -threshold) goTo(state.flow.stepIndex + 1)
          else if (dx >= threshold) goTo(state.flow.stepIndex - 1)
          else goTo(state.flow.stepIndex) // snap back to where it already was
          // Release is best-effort cleanup — do it last, after the real
          // navigation/snap-back action above, never gating it.
          try { if (dragPointerId !== null) deck.releasePointerCapture?.(dragPointerId) } catch { /* ignore */ }
        }
        deck.addEventListener('pointerup', endDrag)
        deck.addEventListener('pointercancel', endDrag)

        // Buttons drive the exact same goTo, so navigating by tap reads
        // as the same motion as navigating by swipe — except stepping
        // past the last panel actually exits the flow, which is an
        // outer-render concern the deck itself has no notion of.
        backBtn?.addEventListener('click', () => goTo(state.flow.stepIndex - 1))
        nextBtn?.addEventListener('click', () => {
          if (state.flow.stepIndex === steps.length - 1) {
            advanceFlow(1) // out of bounds — exits the flow
            render()
          } else {
            goTo(state.flow.stepIndex + 1)
          }
        })
      }

      // Delegated: each panel's done-toggle carries its own step index,
      // since every panel exists at once. Flips the button in place
      // rather than going through render(), same reasoning as above.
      track?.addEventListener('click', e => {
        const btn = e.target.closest('[data-flow-done]')
        if (!btn) return
        const step = steps[parseInt(btn.dataset.flowDone, 10)]
        const wasDone = !!state.detail?.exercises?.[step.ex.name]?.[step.setIndex]?.done
        setDetailValue(state, step.ex.name, step.setIndex, 'done', !wasDone)
        btn.classList.toggle('checked', !wasDone)
        btn.textContent = !wasDone ? '✓ Done' : 'Mark done'
      })
    }

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

// The deck is a real persistent horizontal strip — every step is built as
// its own peeking .flow-panel up front (never lazily swapped for the
// current one), so navigating just translates the shared .flow-track;
// nothing here gets destroyed and recreated mid-gesture. See the deck
// wiring in render() for the goTo()/drag logic that moves it.
function renderFlowScreen(state, dayRecords, date) {
  const { steps, stepIndex } = state.flow
  const progressPct = Math.round(((stepIndex + 1) / steps.length) * 100)
  const nextLabel = computeNextLabel(steps, stepIndex)

  return `
    <div class="flow-screen">
      <div class="flow-progress-bar"><div class="flow-progress-fill" id="flow-progress-fill" style="width:${progressPct}%"></div></div>
      <div class="flow-deck" id="flow-deck">
        <div class="flow-track" id="flow-track">
          ${steps.map((step, i) => renderFlowPanel(step, i, state, dayRecords, date)).join('')}
        </div>
      </div>
      <div class="flow-nav">
        <button class="btn btn-ghost flow-back-btn" id="flow-back" ${stepIndex === 0 ? 'style="visibility:hidden"' : ''}>Back</button>
        <button class="btn btn-primary flow-next-btn" id="flow-next">${nextLabel}</button>
      </div>
    </div>
  `
}

function renderFlowPanel(step, i, state, dayRecords, date) {
  const { ex, setIndex, kind, block } = step
  const isCircuit = block.kind === 'circuit'
  const current = state.detail?.exercises?.[ex.name]?.[setIndex] ?? {}
  const tracksWeight = ex.track?.includes('weight')
  const tracksReps = ex.track?.includes('reps')
  const setCount = isCircuit ? (block.rounds ?? 1) : (ex.defaultSets ?? 1)
  const prevHint = renderPrevHint(ex, findPreviousSet(dayRecords, date, ex.name, setIndex), 'flow-prev-hint')

  return `
    <div class="flow-panel" data-index="${i}">
      ${isCircuit ? `<div class="flow-circuit-label">${escHtml(block.label || 'Circuit')}</div>` : ''}
      <div class="flow-exercise-name">${escHtml(ex.name)}</div>
      ${kind === 'value' && setCount > 1 ? `<div class="flow-set-label">${isCircuit ? 'Round' : 'Set'} ${setIndex + 1} of ${setCount}</div>` : ''}
      ${ex.repRange ? `<div class="exercise-target">${ex.repRange[0]}–${ex.repRange[1]} reps</div>` : ''}
      ${ex.target ? `<div class="exercise-target">${escHtml(ex.target)}</div>` : ''}
      ${prevHint}

      ${kind === 'done' ? `
        <button class="flow-done-btn ${current.done ? 'checked' : ''}" data-flow-done="${i}">
          ${current.done ? '✓ Done' : 'Mark done'}
        </button>
      ` : `
        <div class="flow-wheel-group">
          ${tracksWeight ? `
            <div class="flow-wheel-col">
              <div id="flow-weight-wheel-${i}"></div>
              <div class="flow-wheel-unit">kg</div>
            </div>
          ` : ''}
          ${tracksReps ? `
            <div class="flow-wheel-col">
              <div id="flow-reps-wheel-${i}"></div>
              <div class="flow-wheel-unit">reps</div>
            </div>
          ` : ''}
        </div>
      `}
    </div>
  `
}

function computeNextLabel(steps, stepIndex) {
  const step = steps[stepIndex]
  if (stepIndex === steps.length - 1) return 'Finish'
  const nextStep = steps[stepIndex + 1]
  if (!nextStep || nextStep.block !== step.block) return 'Next block'
  if (nextStep.ex !== step.ex) return 'Next exercise'
  return step.block.kind === 'circuit' ? 'Next round' : 'Next set'
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
