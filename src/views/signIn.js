import { sendMagicLink } from '../cloud/auth.js'

// Shown whenever there's no signed-in user. Email-link sign-in: no
// password to manage, and Firebase Auth keeps you signed in on this
// device afterward (see the note in cloud/auth.js) — this screen should
// be rare once you're set up, not a per-session gate.
export function renderSignInView() {
  const el = document.createElement('div')
  el.className = 'screen'

  let sentTo = null

  function draw() {
    el.innerHTML = `
      <div class="content" style="justify-content:center;flex:1">
        <div class="card" style="max-width:360px;margin:0 auto;width:100%">
          <div class="section-label" style="margin-bottom:8px">Sign in</div>
          ${sentTo
            ? `
              <p style="font-size:15px;line-height:1.6;color:var(--text)">
                Check <strong>${escHtml(sentTo)}</strong> for a sign-in link. Open it on this
                device to continue — you'll stay signed in after that.
              </p>
              <button class="btn btn-ghost btn-full" id="signin-retry" style="margin-top:16px">Use a different email</button>
            `
            : `
              <p class="pb-hint" style="margin:0 0 16px">
                Your training log lives in the cloud now, tied to your account.
              </p>
              <div class="pb-field">
                <label>Email</label>
                <input type="email" id="signin-email" class="pb-input" placeholder="you@example.com" autocomplete="email" />
              </div>
              <div id="signin-error" class="pb-validation bad" style="display:none;margin-bottom:14px"></div>
              <button class="btn btn-primary btn-full" id="signin-send">Send sign-in link</button>
            `
          }
        </div>
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
        btn.textContent = 'Send sign-in link'
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
