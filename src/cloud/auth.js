import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth'
import { auth } from './firebase.js'
import { allowedEmail } from './firebaseConfig.js'

const EMAIL_STORAGE_KEY = 'fitness-tracker:signInEmail'

// Firebase Auth's default persistence is LOCAL (IndexedDB), so once
// signed in, the session survives browser restarts on this device —
// no re-auth on every open, only after an explicit sign-out or if this
// browser's site data gets cleared.

export function onAuthChange(cb) {
  return onAuthStateChanged(auth, cb)
}

export function currentUser() {
  return auth.currentUser
}

export async function sendMagicLink(email) {
  if (allowedEmail && email.trim().toLowerCase() !== allowedEmail.toLowerCase()) {
    throw new Error('This app is set up for one account only.')
  }
  const actionCodeSettings = {
    url: window.location.href.split('?')[0],
    handleCodeInApp: true,
  }
  await sendSignInLinkToEmail(auth, email, actionCodeSettings)
  try { window.localStorage.setItem(EMAIL_STORAGE_KEY, email) } catch { /* ignore */ }
}

// Call once on startup. If the current URL is a sign-in link, completes
// the sign-in and cleans the link out of the URL. Returns true if it
// handled a link (whether it succeeded or the user needs to be asked
// for their email again), false if this load isn't a sign-in link at all.
export async function completeSignInIfLink({ promptForEmail } = {}) {
  if (!isSignInWithEmailLink(auth, window.location.href)) return false

  let email = null
  try { email = window.localStorage.getItem(EMAIL_STORAGE_KEY) } catch { /* ignore */ }

  if (!email && promptForEmail) {
    email = await promptForEmail()
  }
  if (!email) return true // handled: it IS a sign-in link, just couldn't complete it

  await signInWithEmailLink(auth, email, window.location.href)
  try { window.localStorage.removeItem(EMAIL_STORAGE_KEY) } catch { /* ignore */ }
  // Drop the one-time-use link params so a refresh doesn't retry them.
  window.history.replaceState({}, document.title, window.location.pathname)
  return true
}

export function signOutUser() {
  return signOut(auth)
}
