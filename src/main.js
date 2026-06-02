import './styles/main.css'
import { db } from './db.js'
import { weekStart, today, prevWeek, nextWeek, weekDates } from './dates.js'
import { weekStats } from './engine.js'
import { renderWeekView } from './views/week.js'
import { renderDaySheet } from './views/day.js'
import { renderSettingsView } from './views/settings.js'
import { renderProgressView } from './views/progress.js'

const app = document.getElementById('app')

const state = {
  plan: null,
  dayRecords: {},
  currentWeek: weekStart(today()),
  tab: 'week',
}

async function init() {
  // Load plan from db (most recently saved)
  const plans = await db.getAllPlans()
  if (plans.length > 0) {
    state.plan = plans[plans.length - 1]
  }

  // Load all day records
  const days = await db.getAllDays()
  state.dayRecords = Object.fromEntries(days.map(d => [d.date, d]))

  // Restore last viewed week
  const savedWeek = await db.getMeta('currentWeek')
  if (savedWeek) state.currentWeek = savedWeek

  render()
}

function render() {
  app.innerHTML = ''

  const main = document.createElement('div')
  main.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden'

  if (!state.plan) {
    renderNoplan(main)
  } else if (state.tab === 'week') {
    const view = renderWeekView({
      plan: state.plan,
      dayRecords: state.dayRecords,
      currentWeek: state.currentWeek,
      onDayTap: openDaySheet,
      onPrevWeek: () => {
        state.currentWeek = prevWeek(state.currentWeek)
        db.setMeta('currentWeek', state.currentWeek)
        render()
      },
      onNextWeek: () => {
        state.currentWeek = nextWeek(state.currentWeek)
        db.setMeta('currentWeek', state.currentWeek)
        render()
      },
      onToday: () => {
        state.currentWeek = weekStart(today())
        db.setMeta('currentWeek', state.currentWeek)
        render()
      },
    })
    main.appendChild(view)
  } else if (state.tab === 'progress') {
    const view = renderProgressView({ plan: state.plan, dayRecords: state.dayRecords })
    main.appendChild(view)
  } else if (state.tab === 'settings') {
    const view = renderSettingsView({
      plan: state.plan,
      onPlanLoaded: plan => {
        state.plan = plan
        state.tab = 'week'
        render()
      }
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
      <div class="empty-title">No plan loaded</div>
      <div class="empty-body">Import your training plan JSON to get started.</div>
      <label class="btn btn-primary" style="cursor:pointer">
        Import plan
        <input type="file" accept=".json" id="quick-import" style="display:none" />
      </label>
    </div>
  `
  el.querySelector('#quick-import').addEventListener('change', async e => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = ev => resolve(ev.target.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsText(file)
      })
      const raw = JSON.parse(text)
      await db.savePlan(raw)
      state.plan = raw
      render()
    } catch (err) {
      alert('Could not read file: ' + err.message)
    }
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
    <button class="nav-tab ${state.tab === 'progress' ? 'active' : ''}" data-tab="progress">
      <span class="nav-tab-icon">📈</span>
      <span class="nav-tab-label">Progress</span>
    </button>
    <button class="nav-tab ${state.tab === 'settings' ? 'active' : ''}" data-tab="settings">
      <span class="nav-tab-icon">⚙️</span>
      <span class="nav-tab-label">Settings</span>
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
      await db.saveDay(record)
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

init()
