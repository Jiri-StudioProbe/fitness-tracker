import { weekDates, prevWeek, nextWeek, today, formatWeekRange, shortDayName, addDays } from '../dates.js'
import { weekBanners, weekStats } from '../engine.js'
import { getPhaseForDate } from '../plan.js'

export function renderWeekView({ plan, dayRecords, currentWeek, onDayTap, onPrevWeek, onNextWeek, onToday }) {
  const todayStr = today()
  const dates = weekDates(currentWeek)
  const banners = weekBanners(plan, dayRecords, dates)
  const phase = getPhaseForDate(plan, todayStr)
  const streak = calcStreak(dayRecords, todayStr)
  // weekStats reads weeklyTargetSessions off the inner plan object, not
  // the {plan, sessionTypes, ...} wrapper this view receives as `plan`.
  const stats = weekStats(plan.plan, dayRecords, dates)

  const el = document.createElement('div')
  el.className = 'screen'

  el.innerHTML = `
    ${phase ? `
    <div class="topbar" style="justify-content:flex-end">
      <span class="phase-pill">${phase.name}</span>
    </div>` : ''}
    <div class="content">

      ${streak > 0 ? `
      <!-- Streak hero -->
      <div class="streak-hero">
        <div>
          <span class="streak-hero-tag">Streak</span>
          <div class="streak-hero-count disp">${streak}</div>
          <div class="streak-hero-label">day streak</div>
        </div>
        <div class="streak-hero-stats">
          <span><span class="streak-hero-stat-value disp">${stats.completed}/${stats.target}</span><span class="streak-hero-stat-label">this week</span></span>
        </div>
      </div>` : ''}

      <!-- Week card — vertical list -->
      <div class="card" style="padding:12px">
        <div class="week-nav">
          <button class="btn-icon" id="prev-week" aria-label="Previous week">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 4L6 9l5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <span class="week-label">${formatWeekRange(currentWeek)}</span>
          <button class="btn-icon" id="next-week" aria-label="Next week">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 4l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="week-grid" id="week-grid">
          ${dates.map(date => renderDayCell(date, dayRecords[date], date === todayStr, plan, dayRecords)).join('')}
        </div>
        ${todayStr < currentWeek || todayStr > dates[6] ? `
          <div style="text-align:center;margin-top:10px">
            <button class="btn btn-ghost" id="today-btn" style="padding:8px 16px;font-size:13px;min-height:36px">Today</button>
          </div>` : ''}
      </div>

      ${banners.filter(b => b.type !== 'consecutive-hard').map(b => `
        <div class="banner"><span>⚑</span><span>${b.label}</span></div>
      `).join('')}

    </div>
  `

  el.querySelector('#prev-week')?.addEventListener('click', onPrevWeek)
  el.querySelector('#next-week')?.addEventListener('click', onNextWeek)
  el.querySelector('#today-btn')?.addEventListener('click', onToday)
  el.querySelector('#week-grid')?.addEventListener('click', e => {
    const cell = e.target.closest('.day-cell[data-date]')
    if (cell) onDayTap(cell.dataset.date)
  })

  return el
}

function renderDayCell(date, record, isToday, plan, dayRecords) {
  const completed = record?.completed
  const hasActivity = record?.activityId || record?.activityType

  let cls = 'day-cell'
  if (isToday) cls += ' today'
  if (completed) cls += ' completed'
  else if (hasActivity) cls += ' assigned'
  else cls += ' future-empty'

  const label = record?.activityLabel ?? ''
  const session = record?.activityId ? plan.sessionTypes.find(s => s.id === record.activityId) : null
  const location = session?.location ?? ''
  const flagged = hasActivity && isDayFlagged(plan, dayRecords, date)
  const sublabel = flagged ? 'Two hard in a row' : location

  // Completed: a solid check on the accent-fill row. Today, still
  // outstanding: a small watch-dial ring instead — a status other rows
  // don't get, without repeating the date number already shown on the left.
  const check = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6.2l2.7 2.7 5.3-6" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  const dial = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" style="color:var(--accent)">
    <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <path d="M11 2.8v2.1M19.2 11h-2.1M11 19.2v-2.1M2.8 11h2.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`
  const status = completed ? check : (isToday ? dial : '')

  return `
    <div class="${cls}" data-date="${date}">
      <div class="day-date-col">
        <span class="day-name">${shortDayName(date)}</span>
        <span class="day-num">${date.slice(8)}</span>
      </div>
      <div class="day-activity-col">
        <div class="day-tag">${esc(label)}${flagged ? '<span class="day-flag">!</span>' : ''}</div>
        ${sublabel ? `<div class="day-sublabel">${esc(sublabel)}</div>` : ''}
      </div>
      <div class="day-status">${status}</div>
    </div>
  `
}

function isDayFlagged(plan, dayRecords, date) {
  const rec = dayRecords[date]
  if (!rec?.activityId) return false
  const session = plan.sessionTypes.find(s => s.id === rec.activityId)
  if (session?.tags?.intensity !== 'hard') return false
  const prev = addDays(date, -1)
  const prevRec = dayRecords[prev]
  if (!prevRec?.activityId) return false
  const prevSession = plan.sessionTypes.find(s => s.id === prevRec.activityId)
  return prevSession?.tags?.intensity === 'hard'
}

function calcStreak(dayRecords, todayStr) {
  let streak = 0
  let current = todayStr
  while (true) {
    if (!dayRecords[current]?.completed) break
    streak++
    current = addDays(current, -1)
  }
  return streak
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
