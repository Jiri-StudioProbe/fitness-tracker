import { weekDates, prevWeek, nextWeek, today, formatWeekRange, shortDayName, addDays } from '../dates.js'
import { weekBanners } from '../engine.js'
import { getPhaseForDate } from '../plan.js'

export function renderWeekView({ plan, dayRecords, currentWeek, onDayTap, onPrevWeek, onNextWeek, onToday }) {
  const todayStr = today()
  const dates = weekDates(currentWeek)
  const banners = weekBanners(plan, dayRecords, dates)
  const phase = getPhaseForDate(plan, todayStr)
  const streak = calcStreak(dayRecords, todayStr)

  const el = document.createElement('div')
  el.className = 'screen'

  el.innerHTML = `
    <div class="topbar">
      <span class="topbar-title">Trainer</span>
      <div class="flex items-center gap-8">
        ${phase ? `<span class="phase-pill">${phase.name}</span>` : ''}
      </div>
    </div>
    <div class="content">

      ${streak > 0 ? `
      <!-- Streak -->
      <div class="card">
        <div class="week-stats">
          <div class="stat-item">
            <div class="streak-block">
              <span class="streak-count">${streak}</span>
              <span class="streak-label">day streak</span>
            </div>
          </div>
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

  const check = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 5.5l2.5 2.5 5.5-5" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`

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
      <div class="day-status">${completed ? check : ''}</div>
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
