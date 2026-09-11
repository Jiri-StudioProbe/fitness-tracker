import { currentUser } from '../cloud/auth.js'

export function renderSettingsView({ plan, onSignOut }) {
  const el = document.createElement('div')
  el.className = 'screen'

  const email = currentUser()?.email ?? ''

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
          <p class="text-sm text-muted" style="margin-top:10px;line-height:1.6">
            Build, import, or switch plans from the Plan tab — it manages every saved plan, not just this one.
          </p>
        </div>
      ` : ''}

      <div class="card">
        <div class="section-label" style="margin-bottom:8px">Account</div>
        <div style="font-size:14px;color:var(--text);margin-bottom:12px">${email}</div>
        <p class="text-sm text-muted" style="margin-bottom:12px;line-height:1.6">
          Your training log is stored in the cloud against this account, synced across devices.
        </p>
        <button class="btn btn-ghost btn-full" id="sign-out-btn">Sign out</button>
      </div>
    </div>
  `

  el.querySelector('#sign-out-btn').addEventListener('click', () => onSignOut())

  return el
}
