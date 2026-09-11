import './styles/main.css'
import { cloudDb } from './cloud/cloudDb.js'
import { onAuthChange, completeSignInIfLink, signOutUser } from './cloud/auth.js'
import { renderSignInView } from './views/signIn.js'
import { weekStart, today, prevWeek, nextWeek, weekDates } from './dates.js'
import { weekStats } from './engine.js'
import { renderWeekView } from './views/week.js'
import { renderDaySheet } from './views/day.js'
import { renderPlanBuilderView } from './views/planBuilder.js'

const app = document.getElementById('app')

const state = {
  plan: null,
  activePlanId: null,
  dayRecords: {},
  currentWeek: weekStart(today()),
  tab: 'week',
}

// ── Auth gate ──────────────────────────────────────────────────────────

function askForEmailInline() {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'pb-confirm-overlay'
    overlay.innerHTML = `
      <div class="pb-confirm-box">
        <p class="pb-confirm-message">Confirm the email you requested the sign-in link with:</p>
        <input type="email" id="confirm-email-input" class="pb-input" placeholder="you@example.com" autocomplete="email" />
        <div class="pb-confirm-actions">
          <button class="btn btn-ghost" id="confirm-email-cancel">Cancel</button>
          <button class="btn btn-primary" id="confirm-email-ok">Continue</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    overlay.querySelector('#confirm-email-cancel').addEventListener('click', () => { overlay.remove(); resolve(null) })
    overlay.querySelector('#confirm-email-ok').addEventListener('click', () => {
      const v = overlay.querySelector('#confirm-email-input').value.trim()
      overlay.remove()
      resolve(v || null)
    })
  })
}

async function boot() {
  // No-op unless this page load is a sign-in link; if it is, this may
  // complete the sign-in (triggering onAuthChange below) or ask for the
  // email once via askForEmailInline if opened on a different device.
  try {
    await completeSignInIfLink({ promptForEmail: askForEmailInline })
  } catch (err) {
    console.error('Sign-in link failed:', err)
  }

  onAuthChange(async user => {
    if (user) {
      cloudDb.setUser(user.uid)
      await initApp()
    } else {
      cloudDb.clearUser()
      renderSignedOut()
    }
  })
}

function renderSignedOut() {
  app.innerHTML = ''
  app.appendChild(renderSignInView())
}

// ── Signed-in app ────────────────────────────────────────────────────

// Which plan is "active" is its own explicit pointer (meta.activePlanId),
// not just "whichever was saved most recently" — see the Plan Builder's
// Saved plans list for where that pointer actually gets set.
async function resolveActivePlan() {
  const plans = await cloudDb.getAllPlans() // newest-first
  const activeId = await cloudDb.getMeta('activePlanId')
  let active = activeId ? plans.find(p => p.id === activeId) : undefined

  // Pre-upgrade accounts have plans but no activePlanId pointer yet (it
  // used to just be "whichever was saved last"). Adopt the newest one as
  // active once, so upgrading doesn't look like the plan disappeared.
  if (!active && !activeId && plans.length > 0) {
    active = plans[0]
    await cloudDb.setMeta('activePlanId', active.id)
  }

  state.plan = active ?? null
  state.activePlanId = active?.id ?? null
}

async function initApp() {
  await resolveActivePlan()

  const days = await cloudDb.getAllDays()
  state.dayRecords = Object.fromEntries(days.map(d => [d.date, d]))

  const savedWeek = await cloudDb.getMeta('currentWeek')
  if (savedWeek && new Date(savedWeek + 'T00:00:00').getDay() === 1) {
    state.currentWeek = savedWeek
  }

  render()
}

function render() {
  app.innerHTML = ''

  const main = document.createElement('div')
  main.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden'

  if (state.tab === 'plan') {
    main.appendChild(renderPlanBuilderView({
      activePlanId: state.activePlanId,
      onPlanActivated: plan => {
        state.plan = plan
        state.activePlanId = plan.plan.id
        state.tab = 'week'
        render()
      },
      // Editing the already-active plan and hitting Save pushes it live
      // without any navigation — just refresh the in-memory copy so the
      // Week view picks it up next time it's viewed, no reload needed.
      // Deliberately no render() here: the Plan Builder is still open and
      // mid-edit; forcing a full re-render would yank it out from under
      // the user.
      onActivePlanUpdated: plan => {
        state.plan = plan
        state.activePlanId = plan.plan.id
      },
      onSignOut: async () => {
        await signOutUser()
      },
    }))
  } else if (!state.plan) {
    renderNoplan(main)
  } else if (state.tab === 'week') {
    const view = renderWeekView({
      plan: state.plan,
      dayRecords: state.dayRecords,
      currentWeek: state.currentWeek,
      onDayTap: openDaySheet,
      onPrevWeek: () => {
        state.currentWeek = prevWeek(state.currentWeek)
        cloudDb.setMeta('currentWeek', state.currentWeek)
        render()
      },
      onNextWeek: () => {
        state.currentWeek = nextWeek(state.currentWeek)
        cloudDb.setMeta('currentWeek', state.currentWeek)
        render()
      },
      onToday: () => {
        state.currentWeek = weekStart(today())
        cloudDb.setMeta('currentWeek', state.currentWeek)
        render()
      },
    })
    main.appendChild(view)
  }

  app.appendChild(main)
  app.appendChild(renderNavTabs())
}

function renderNoplan(container) {
  const el = document.createElement('div')
  el.className = 'screen'
  el.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">🏋️</div>
      <div class="empty-title">No active plan</div>
      <div class="empty-body">Build one, import a JSON file, or activate a saved plan in the Plan tab.</div>
      <button class="btn btn-primary" id="goto-plan-tab">Go to Plan Builder</button>
    </div>
  `
  el.querySelector('#goto-plan-tab').addEventListener('click', () => {
    state.tab = 'plan'
    render()
  })
  container.appendChild(el)
}

function renderNavTabs() {
  const nav = document.createElement('nav')
  nav.className = 'nav-tabs'
  nav.innerHTML = `
    <button class="nav-tab ${state.tab === 'week' ? 'active' : ''}" data-tab="week">
      <span class="nav-tab-icon">📅</span>
      <span class="nav-tab-label">Week</span>
    </button>
    <button class="nav-tab ${state.tab === 'plan' ? 'active' : ''}" data-tab="plan">
      <span class="nav-tab-icon">📝</span>
      <span class="nav-tab-label">Plan</span>
    </button>
  `
  nav.addEventListener('click', e => {
    const btn = e.target.closest('.nav-tab[data-tab]')
    if (!btn) return
    state.tab = btn.dataset.tab
    render()
  })
  return nav
}

function openDaySheet(date) {
  const overlay = renderDaySheet({
    plan: state.plan,
    dayRecords: state.dayRecords,
    date,
    onClose: () => {
      overlay.remove()
      render()
    },
    onSave: async (record, celebrate) => {
      await cloudDb.saveDay(record)
      state.dayRecords[record.date] = record
      overlay.remove()

      if (celebrate) {
        showCelebration(record, () => render())
      } else {
        render()
      }
    }
  })
  app.appendChild(overlay)
}

function showCelebration(record, cb) {
  // Check if week is complete
  const dates = weekDates(weekStart(record.date))
  const stats = weekStats(state.plan, state.dayRecords, dates)
  const weekDone = stats.completed >= stats.target

  if (weekDone) {
    const el = document.createElement('div')
    el.className = 'week-celebration'
    el.innerHTML = `
      <div class="week-celebration-icon">🎉</div>
      <div class="week-celebration-title">Week complete!</div>
      <div class="week-celebration-sub">${stats.completed} of ${stats.target} sessions done</div>
      <div class="text-muted text-sm" style="margin-top:8px">Tap to continue</div>
    `
    el.addEventListener('click', () => { el.remove(); cb() })
    app.appendChild(el)
  } else {
    const el = document.createElement('div')
    el.className = 'celebration'
    el.innerHTML = `<div class="celebration-burst">✓</div>`
    app.appendChild(el)
    setTimeout(() => { el.remove(); cb() }, 600)
  }
}

boot()
