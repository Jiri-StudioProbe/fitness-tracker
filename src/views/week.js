import { weekDates, weekStart, prevWeek, nextWeek, today, formatWeekRange, shortDayName } from '../dates.js'
import { weekStats, weekBanners } from '../engine.js'
import { getPhaseForDate } from '../plan.js'

export function renderWeekView({ plan, dayRecords, currentWeek, onDayTap, onPrevWeek, onNextWeek, onToday }) {
  const todayStr = today()
  const monday = currentWeek
  const dates = weekDates(monday)
  const stats = weekStats(plan, dayRecords, dates)
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
      <!-- Week nav -->
      <div class="card" style="padding:12px 14px">
        <div class="week-nav">
          <button class="btn-icon" id="prev-week" aria-label="Previous week">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div style="text-align:center">
            <div class="week-label">${formatWeekRange(monday)}</div>
          </div>
          <button class="btn-icon" id="next-week" aria-label="Next week">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M8 5l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>

        <div class="week-grid" id="week-grid">
          ${dates.map(date => renderDayCell(date, dayRecords[date], date === todayStr)).join('')}
        </div>

        ${todayStr < monday || todayStr > dates[6] ? `
          <div style="text-align:center;margin-top:10px">
            <button class="btn btn-ghost" id="today-btn" style="padding:8px 16px;font-size:13px">Today</button>
          </div>
        ` : ''}
      </div>

      <!-- Stats -->
      <div class="card">
        <div class="week-stats">
          <div class="stat-item">
            <span class="stat-value">${stats.completed}<span style="color:var(--muted);font-size:14px">/${stats.target}</span></span>
            <span class="stat-label">Sessions done</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value ${stats.hasRow ? 'text-accent' : ''}">${stats.hasRow ? '✓' : '—'}</span>
            <span class="stat-label">Row backbone</span>
          </div>
          ${streak > 0 ? `
          <div class="stat-divider"></div>
          <div class="stat-item">
            <div class="streak-block">
              <span class="streak-count">${streak}</span>
              <span class="streak-label">day streak</span>
            </div>
          </div>` : ''}
        </div>
      </div>

      <!-- Banners -->
      ${banners.map(b => `
        <div class="banner">
          <span>⚠</span>
          <span>${b.label}</span>
        </div>
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

function renderDayCell(date, record, isToday) {
  const completed = record?.completed
  const hasActivity = record?.activityId || record?.activityType === 'custom' || record?.activityType === 'rest'

  let cls = 'day-cell'
  if (isToday) cls += ' today'
  if (completed) cls += ' completed'
  else if (hasActivity) cls += ' assigned'

  const label = record?.activityLabel
    ? abbreviate(record.activityLabel)
    : ''

  return `
    <div class="${cls}" data-date="${date}">
      <span class="day-name">${shortDayName(date)}</span>
      <span class="day-num">${date.slice(8)}</span>
      <span class="day-dot"></span>
      ${label ? `<span class="day-activity">${label}</span>` : ''}
    </div>
  `
}

function abbreviate(name) {
  const map = {
    'Push session': 'Push',
    'Row + arm finisher': 'Row',
    'Swim': 'Swim',
    'Easy 5k run': 'Easy run',
    'Long run': 'Long run',
    'Optional easy row/swim': 'Optional',
    'Rest': 'Rest',
  }
  return map[name] ?? (name.length > 7 ? name.slice(0, 7) + '…' : name)
}

function calcStreak(dayRecords, todayStr) {
  let streak = 0
  let current = todayStr
  while (true) {
    const rec = dayRecords[current]
    if (!rec?.completed) break
    streak++
    const d = new Date(current + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    current = d.toISOString().slice(0, 10)
  }
  return streak
}
