import { validatePlan, applyRepair } from '../plan.js'
import { db } from '../db.js'

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = () => reject(new Error('FileReader error: ' + reader.error?.message))
    reader.readAsText(file)
  })
}

export function renderSettingsView({ plan, onPlanLoaded }) {
  const el = document.createElement('div')
  el.className = 'screen'

  el.innerHTML = `
    <div class="topbar">
      <span class="topbar-title">Settings</span>
    </div>
    <div class="content">
      ${plan ? `
        <div class="card">
          <div class="section-label" style="margin-bottom:8px">Active plan</div>
          <div style="font-size:16px;font-weight:600;color:var(--text)">${plan.plan.title}</div>
          <div style="font-size:13px;color:var(--muted);margin-top:4px">
            ${plan.plan.startDate} → ${plan.plan.endDate}
          </div>
        </div>
      ` : ''}

      <div class="card">
        <div class="section-label" style="margin-bottom:12px">Import plan</div>
        <div class="import-area">
          <span style="font-size:32px">📋</span>
          <p class="import-label">Select a <strong>.json</strong> plan file from your Files app</p>
          <label class="btn btn-primary" style="cursor:pointer">
            Choose file
            <input type="file" id="plan-file" accept=".json" style="display:none" />
          </label>
        </div>
        <div id="repair-area"></div>
      </div>

      <div class="card">
        <div class="section-label" style="margin-bottom:12px">Backup</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-ghost btn-full" id="export-btn">Export all data</button>
          <label class="btn btn-ghost btn-full" style="cursor:pointer">
            Import backup
            <input type="file" id="backup-file" accept=".json" style="display:none" />
          </label>
        </div>
        <p class="text-sm text-muted" style="margin-top:10px;line-height:1.6">
          iOS may clear app storage under pressure. Export regularly and keep a copy in Files or iCloud.
        </p>
      </div>
    </div>
  `

  let pendingPlan = null
  let pendingErrors = []

  el.querySelector('#plan-file').addEventListener('change', async e => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await readFileAsText(file)
      const raw = JSON.parse(text)
      const { valid, errors } = validatePlan(raw)
      if (valid) {
        await db.savePlan(raw)
        onPlanLoaded(raw)
      } else {
        pendingPlan = raw
        pendingErrors = errors
        renderRepair(el.querySelector('#repair-area'), raw, errors, onPlanLoaded)
      }
    } catch (err) {
      el.querySelector('#repair-area').innerHTML = `
        <div class="banner" style="margin-top:12px;border-color:var(--danger);color:var(--danger)">
          ${err instanceof SyntaxError ? 'Invalid JSON: ' : 'Could not read file: '}${err.message}
        </div>
      `
    }
    e.target.value = ''
  })

  el.querySelector('#export-btn').addEventListener('click', async () => {
    const data = await db.exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fitness-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  })

  el.querySelector('#backup-file').addEventListener('change', async e => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await readFileAsText(file)
      const data = JSON.parse(text)
      await db.importAll(data)
      // reload the latest plan
      const plans = await db.getAllPlans()
      if (plans.length > 0) onPlanLoaded(plans[plans.length - 1])
      alert('Backup restored.')
    } catch (err) {
      alert('Import failed: ' + err.message)
    }
    e.target.value = ''
  })

  return el
}

function renderRepair(container, raw, errors, onPlanLoaded) {
  container.innerHTML = `
    <div style="margin-top:16px">
      <div class="section-label" style="margin-bottom:8px">Fix required (${errors.length} issue${errors.length > 1 ? 's' : ''})</div>
      ${errors.map((err, i) => `
        <div class="repair-prompt" style="margin-bottom:8px" data-index="${i}">
          <div class="repair-path">${err.path}</div>
          <div class="repair-msg">${err.msg}</div>
          ${err.repair === 'choice' ? `
            <div class="repair-choices">
              ${err.options.map(opt => `
                <button class="repair-choice" data-path="${err.path}" data-value="${opt}">${opt}</button>
              `).join('')}
            </div>
          ` : err.repair === 'text' ? `
            <input type="text" class="custom-input repair-text" style="margin-top:6px"
              placeholder="Enter value" data-path="${err.path}" />
          ` : ''}
        </div>
      `).join('')}
      <button class="btn btn-primary btn-full" id="apply-repairs" style="margin-top:8px">Apply fixes</button>
    </div>
  `

  const resolved = {}

  container.querySelectorAll('.repair-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      const { path, value } = btn.dataset
      resolved[path] = value
      btn.closest('.repair-choices').querySelectorAll('.repair-choice').forEach(b => b.classList.remove('selected'))
      btn.classList.add('selected')
    })
  })

  container.querySelector('#apply-repairs')?.addEventListener('click', async () => {
    container.querySelectorAll('.repair-text').forEach(inp => {
      if (inp.value) resolved[inp.dataset.path] = inp.value
    })

    let patched = raw
    for (const [path, value] of Object.entries(resolved)) {
      patched = applyRepair(patched, path, value)
    }

    const { valid, errors: remaining } = validatePlan(patched)
    if (!valid) {
      renderRepair(container, patched, remaining, onPlanLoaded)
      return
    }

    await db.savePlan(patched)
    onPlanLoaded(patched)
    container.innerHTML = ''
  })
}
