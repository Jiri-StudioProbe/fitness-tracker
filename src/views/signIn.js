import { sendMagicLink } from '../cloud/auth.js'

// Shown whenever there's no signed-in user. Email-link sign-in: no
// password to manage, and Firebase Auth keeps you signed in on this
// device afterward (see the note in cloud/auth.js) — this screen should
// be rare once you're set up, not a per-session gate.
//
// Visually distinct from the rest of the app on purpose (see the Figma
// redesign this was ported from): a light, brand-forward entry screen
// rather than the dark workout-log theme — see .signin-* in main.css.
// The original mock used a hand-brushed "TRAiN" wordmark graphic; that
// asset wasn't available to port directly, so it's approximated here
// as oversized, tilted display type in the same orange.
export function renderSignInView() {
  const el = document.createElement('div')
  el.className = 'signin-screen'

  let sentTo = null

  const mailIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 5h18v14H3V5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 5.5l9 7 9-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`

  function draw() {
    el.innerHTML = `
      <div class="signin-wordmark">TRAiN</div>
      <div class="signin-card">
        ${sentTo
          ? `
            <p class="signin-sent-text">
              Check <strong>${escHtml(sentTo)}</strong> for a sign-in link. Open it on this
              device to continue — you'll stay signed in after that.
            </p>
            <button class="signin-ghost-btn" id="signin-retry">Use a different email</button>
          `
          : `
            <div class="signin-input-row">
              ${mailIcon}
              <input type="email" id="signin-email" class="signin-input" placeholder="you@example.com" autocomplete="email" />
            </div>
            <div id="signin-error" class="signin-error" style="display:none"></div>
            <button class="signin-btn" id="signin-send">Email link</button>
          `
        }
      </div>
    `

    el.querySelector('#signin-send')?.addEventListener('click', async () => {
      const input = el.querySelector('#signin-email')
      const email = input.value.trim()
      const errBox = el.querySelector('#signin-error')
      errBox.style.display = 'none'
      if (!email) return
      const btn = el.querySelector('#signin-send')
      btn.disabled = true
      btn.textContent = 'Sending…'
      try {
        await sendMagicLink(email)
        sentTo = email
        draw()
      } catch (err) {
        errBox.textContent = friendlyAuthError(err)
        errBox.style.display = ''
        btn.disabled = false
        btn.textContent = 'Email link'
      }
    })

    el.querySelector('#signin-retry')?.addEventListener('click', () => {
      sentTo = null
      draw()
    })
  }

  draw()
  return el
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function friendlyAuthError(err) {
  switch (err.code) {
    case 'auth/network-request-failed':
      return "Couldn't reach the sign-in service — check your connection and try again."
    case 'auth/invalid-email':
      return "That doesn't look like a valid email address."
    case 'auth/too-many-requests':
      return 'Too many attempts — wait a bit before trying again.'
    default:
      return err.message || 'Could not send sign-in link.'
  }
}
