import * as d3 from 'd3'
import { weekStart, weekDates, today, addDays } from '../dates.js'

const C = {
  accent:    '#FF10F0',
  accentDim: 'rgba(255,16,240,0.14)',
  surface2:  '#21252B',
  border:    '#333840',
  text:      '#F2F3F5',
  muted:     '#A8B2BE',
}

export function renderProgressView({ plan, dayRecords }) {
  const el = document.createElement('div')
  el.className = 'screen'

  el.innerHTML = `
    <div class="topbar">
      <span class="topbar-title">Progress</span>
    </div>
    <div class="content">
      <div class="card" id="prog-arc" style="padding:16px 16px 10px"></div>
      <div class="card" id="prog-sessions"><div class="section-label" style="margin-bottom:8px">Sessions per week</div></div>
      <div class="card" id="prog-fasting"><div class="section-label" style="margin-bottom:8px">Intermittent fasting</div></div>
      <div class="card" id="prog-supps"><div class="section-label" style="margin-bottom:8px">Supplement adherence</div></div>
    </div>
  `

  // D3 renders after element is in DOM
  requestAnimationFrame(() => {
    drawArc(el.querySelector('#prog-arc'), plan, dayRecords)
    drawSessions(el.querySelector('#prog-sessions'), plan, dayRecords)
    drawFasting(el.querySelector('#prog-fasting'), plan, dayRecords)
    drawSupplements(el.querySelector('#prog-supps'), plan, dayRecords)
  })

  return el
}

function chartWidth(el) {
  return Math.max(el.clientWidth - 32, 240)
}

function addGlow(defs, id, blur = 3) {
  const f = defs.append('filter').attr('id', id)
    .attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%')
  f.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', blur).attr('result', 'blur')
  const m = f.append('feMerge')
  m.append('feMergeNode').attr('in', 'blur')
  m.append('feMergeNode').attr('in', 'SourceGraphic')
}

// ── 1. Plan arc ───────────────────────────────
function drawArc(el, plan, dayRecords) {
  const W = chartWidth(el), H = 200
  const cx = W / 2, cy = 108
  const outerR = 70, innerR = 54

  // Compute weeks done
  const startMon = weekStart(plan.plan.startDate)
  const todayStr = today()
  let totalWeeks = 0, doneWeeks = 0
  let cur = startMon
  while (cur <= plan.plan.endDate) {
    totalWeeks++
    const dates = weekDates(cur)
    const completed = dates.filter(d => dayRecords[d]?.completed).length
    if (completed >= (plan.plan.weeklyTargetSessions ?? 5)) doneWeeks++
    cur = addDays(cur, 7)
  }
  totalWeeks = Math.max(totalWeeks, 1)

  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`)
  const defs = svg.append('defs')
  addGlow(defs, 'arc-glow', 5)

  const g = svg.append('g').attr('transform', `translate(${cx},${cy})`)
  const tau = Math.PI * 2, start = -Math.PI / 2
  const gap = 0.06, seg = tau / totalWeeks - gap

  for (let i = 0; i < totalWeeks; i++) {
    const sa = start + (tau / totalWeeks) * i + gap / 2
    const ea = sa + seg
    const filled = i < doneWeeks
    g.append('path')
      .attr('d', d3.arc()({ innerRadius: innerR, outerRadius: outerR, startAngle: sa, endAngle: ea, cornerRadius: filled ? 4 : 0 }))
      .attr('fill', filled ? C.accent : C.border)
      .attr('opacity', filled ? 1 : 0.5)
      .attr('filter', filled ? 'url(#arc-glow)' : null)
  }

  g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.05em')
    .attr('font-family', 'Inter,sans-serif').attr('font-size', 32).attr('font-weight', 700)
    .attr('letter-spacing', -1.5).attr('fill', C.text).text(`${doneWeeks}/${totalWeeks}`)

  g.append('text').attr('text-anchor', 'middle').attr('dy', '1.5em')
    .attr('font-family', 'Inter,sans-serif').attr('font-size', 10).attr('font-weight', 600)
    .attr('letter-spacing', 1.5).attr('fill', C.muted).text('WEEKS COMPLETE')

  const phase = plan.phases?.find(ph => todayStr >= ph.dateRange[0] && todayStr <= ph.dateRange[1])
  if (phase) {
    svg.append('text').attr('x', cx).attr('y', H - 8).attr('text-anchor', 'middle')
      .attr('font-family', 'Inter,sans-serif').attr('font-size', 12).attr('fill', C.muted)
      .text(`${phase.name} phase`)
  }
}

// ── 2. Sessions per week bar chart ────────────
function drawSessions(el, plan, dayRecords) {
  const W = chartWidth(el), H = 130
  const mt = 18, mr = 4, mb = 28, ml = 4
  const iW = W - ml - mr, iH = H - mt - mb
  const target = plan.plan.weeklyTargetSessions ?? 5

  // Build week data from plan start to today
  const data = []
  let cur = weekStart(plan.plan.startDate)
  let idx = 0
  const todayStr = today()
  while (cur <= plan.plan.endDate && cur <= todayStr) {
    const dates = weekDates(cur)
    const completed = dates.filter(d => dayRecords[d]?.completed).length
    data.push({ week: `W${++idx}`, completed })
    cur = addDays(cur, 7)
  }
  if (!data.length) { el.querySelector('.section-label')?.remove(); return }

  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`)
  const defs = svg.append('defs')
  addGlow(defs, 'bar-glow', 4)

  const grad = defs.append('linearGradient').attr('id', 'bar-grad').attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',1)
  grad.append('stop').attr('offset','0%').attr('stop-color', C.accent).attr('stop-opacity', 1)
  grad.append('stop').attr('offset','100%').attr('stop-color', C.accent).attr('stop-opacity', 0.55)

  const g = svg.append('g').attr('transform', `translate(${ml},${mt})`)
  const x = d3.scaleBand().domain(data.map(d => d.week)).range([0, iW]).padding(0.4)
  const y = d3.scaleLinear().domain([0, target]).range([iH, 0])

  // Grid
  for (let v = 1; v <= target; v++) {
    g.append('line').attr('x1', 0).attr('x2', iW).attr('y1', y(v)).attr('y2', y(v))
      .attr('stroke', C.border).attr('stroke-width', 0.5).attr('opacity', 0.7)
  }

  // Target dashed line
  g.append('line').attr('x1', 0).attr('x2', iW).attr('y1', y(target)).attr('y2', y(target))
    .attr('stroke', C.muted).attr('stroke-width', 1).attr('stroke-dasharray', '3,4').attr('opacity', 0.4)

  data.forEach(d => {
    const bx = x(d.week), bw = x.bandwidth()
    const full = d.completed >= target

    // Background track
    g.append('rect').attr('x', bx).attr('y', 0).attr('width', bw).attr('height', iH)
      .attr('rx', 5).attr('fill', C.surface2).attr('opacity', 0.5)

    if (d.completed > 0) {
      const barH = iH - y(d.completed)
      g.append('rect').attr('x', bx).attr('y', y(d.completed)).attr('width', bw).attr('height', barH)
        .attr('rx', 5).attr('fill', full ? 'url(#bar-grad)' : C.accentDim)
        .attr('stroke', full ? 'none' : C.accent).attr('stroke-width', 1)
        .attr('filter', full ? 'url(#bar-glow)' : null)

      g.append('text').attr('x', bx + bw / 2).attr('y', y(d.completed) - 5)
        .attr('text-anchor', 'middle')
        .attr('font-family', 'Inter,sans-serif').attr('font-size', 11).attr('font-weight', 700)
        .attr('fill', full ? C.accent : C.muted).text(d.completed)
    }

    g.append('text').attr('x', bx + bw / 2).attr('y', iH + 17)
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Inter,sans-serif').attr('font-size', 11).attr('font-weight', 600)
      .attr('fill', full ? C.text : C.muted).text(d.week)
  })
}

// ── 3. Fasting dot calendar ───────────────────
function drawFasting(el, plan, dayRecords) {
  const todayStr = today()
  const days = []
  let cur = plan.plan.startDate
  while (cur <= todayStr && cur <= plan.plan.endDate) {
    days.push({ date: cur, state: dayRecords[cur]?.fasting ?? null })
    cur = addDays(cur, 1)
  }
  if (!days.length) { el.querySelector('.section-label')?.remove(); return }

  // Group into Mon-aligned weeks
  const weeks = []
  let mon = weekStart(days[0].date)
  while (mon <= days[days.length - 1].date) {
    const row = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(mon, i)
      const found = days.find(x => x.date === d)
      return found ? { ...found, inPlan: true } : { date: d, state: null, inPlan: false }
    })
    if (row.some(r => r.inPlan)) weeks.push(row)
    mon = addDays(mon, 7)
  }

  const W = chartWidth(el)
  const slotW = (W - 28) / 7
  const slotH = 34
  const topPad = 22
  const H = topPad + weeks.length * slotH + 26

  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`)
  const defs = svg.append('defs')
  addGlow(defs, 'dot-glow', 3)

  // Day headers Mon–Sun
  ;['M','T','W','T','F','S','S'].forEach((d, i) => {
    svg.append('text').attr('x', 28 + slotW * i + slotW / 2).attr('y', 13)
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Inter,sans-serif').attr('font-size', 10).attr('font-weight', 600)
      .attr('fill', C.muted).text(d)
  })

  weeks.forEach((week, wi) => {
    const cy = topPad + wi * slotH + slotH / 2

    svg.append('text').attr('x', 20).attr('y', cy + 4).attr('text-anchor', 'end')
      .attr('font-family', 'Inter,sans-serif').attr('font-size', 9).attr('font-weight', 600)
      .attr('fill', C.border).text(`W${wi + 1}`)

    week.forEach(({ state, inPlan }, di) => {
      const cx = 28 + slotW * di + slotW / 2
      const r = 10
      if (!inPlan || state === null) {
        svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r)
          .attr('fill', 'none').attr('stroke', C.border).attr('stroke-width', 1).attr('opacity', 0.3)
      } else if (state === 'held') {
        svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r)
          .attr('fill', C.accent).attr('filter', 'url(#dot-glow)')
      } else if (state === 'broke-early') {
        svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r)
          .attr('fill', 'none').attr('stroke', C.accent).attr('stroke-width', 1.5).attr('opacity', 0.45)
      } else {
        // not-today
        svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r)
          .attr('fill', C.surface2).attr('stroke', C.border).attr('stroke-width', 1)
        svg.append('line').attr('x1', cx - 4).attr('x2', cx + 4).attr('y1', cy).attr('y2', cy)
          .attr('stroke', C.muted).attr('stroke-width', 1.5).attr('opacity', 0.4)
      }
    })
  })

  // Legend
  const ly = H - 8
  const items = [
    { label: 'Held', draw: (x,y) => svg.append('circle').attr('cx',x).attr('cy',y).attr('r',5).attr('fill',C.accent) },
    { label: 'Broke early', draw: (x,y) => svg.append('circle').attr('cx',x).attr('cy',y).attr('r',5).attr('fill','none').attr('stroke',C.accent).attr('stroke-width',1.5).attr('opacity',0.5) },
    { label: 'Skipped', draw: (x,y) => { svg.append('circle').attr('cx',x).attr('cy',y).attr('r',5).attr('fill',C.surface2).attr('stroke',C.border).attr('stroke-width',1) } },
  ]
  let lx = 28
  items.forEach(item => {
    item.draw(lx, ly)
    svg.append('text').attr('x', lx + 9).attr('y', ly + 4)
      .attr('font-family', 'Inter,sans-serif').attr('font-size', 10).attr('font-weight', 500)
      .attr('fill', C.muted).text(item.label)
    lx += item.label.length * 6.2 + 20
  })
}

// ── 4. Supplement adherence bars ─────────────
function drawSupplements(el, plan, dayRecords) {
  const todayStr = today()
  const supps = plan.supplements ?? []

  const data = supps.map(supp => {
    let applicable = 0, taken = 0
    let cur = plan.plan.startDate
    while (cur <= todayStr && cur <= plan.plan.endDate) {
      const rec = dayRecords[cur]
      const session = rec?.activityId ? plan.sessionTypes.find(s => s.id === rec.activityId) : null
      const isLoading = session?.isLoadingSession ?? false
      const applicable_ =
        supp.schedule === 'daily' ? true :
        (supp.schedule === 'preLoadingSession' || supp.schedule === 'postLoadingSession') ? isLoading : false
      if (applicable_) {
        applicable++
        if (rec?.supplements?.includes(supp.name)) taken++
      }
      cur = addDays(cur, 1)
    }
    return {
      name: supp.name.replace(' + vitamin C', '').replace(' glycinate', ''),
      pct: applicable > 0 ? Math.round((taken / applicable) * 100) : 0,
    }
  }).sort((a, b) => b.pct - a.pct)

  if (!data.length || data.every(d => d.pct === 0)) {
    el.querySelector('.section-label')?.remove()
    return
  }

  const W = chartWidth(el)
  const labelW = 86, pctW = 34, barAreaW = W - labelW - pctW - 8
  const rowH = 30, H = data.length * rowH

  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`)
  const defs = svg.append('defs')
  addGlow(defs, 'sup-glow', 2.5)

  const grad = defs.append('linearGradient').attr('id', 'sup-grad').attr('x1',0).attr('y1',0).attr('x2',1).attr('y2',0)
  grad.append('stop').attr('offset','0%').attr('stop-color', C.accent).attr('stop-opacity', 0.65)
  grad.append('stop').attr('offset','100%').attr('stop-color', C.accent).attr('stop-opacity', 1)

  data.forEach((d, i) => {
    const y = i * rowH + rowH / 2
    const barW = (d.pct / 100) * barAreaW
    const high = d.pct >= 80

    svg.append('text').attr('x', 0).attr('y', y + 4.5)
      .attr('font-family', 'Inter,sans-serif').attr('font-size', 12).attr('font-weight', 500)
      .attr('fill', C.text).text(d.name)

    svg.append('rect').attr('x', labelW).attr('y', y - 4).attr('width', barAreaW).attr('height', 7)
      .attr('rx', 3).attr('fill', C.surface2)

    if (barW > 0) {
      svg.append('rect').attr('x', labelW).attr('y', y - 4).attr('width', barW).attr('height', 7)
        .attr('rx', 3).attr('fill', 'url(#sup-grad)').attr('filter', high ? 'url(#sup-glow)' : null)
    }

    svg.append('text').attr('x', labelW + barAreaW + 8).attr('y', y + 4.5)
      .attr('font-family', 'Inter,sans-serif').attr('font-size', 12).attr('font-weight', 700)
      .attr('fill', high ? C.accent : C.muted).text(`${d.pct}%`)
  })
}
