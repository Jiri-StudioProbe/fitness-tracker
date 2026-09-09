// Firebase web config is NOT a secret — it's meant to be embedded in
// client code. Access control is enforced by Firestore security rules
// (see firestore.rules), not by hiding this object.
//
// For local dev/testing we point at the Firebase Local Emulator Suite
// (see firebase.json) using a "demo-" project id, which the emulators
// accept without any real Firebase project existing. To go live, set
// VITE_FIREBASE_* env vars (e.g. in .env.production.local, gitignored)
// to the values from your real Firebase project's web app config, and
// set VITE_USE_EMULATORS=false.

const demoConfig = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-fitness-tracker.firebaseapp.com',
  projectId: 'demo-fitness-tracker',
  storageBucket: 'demo-fitness-tracker.appspot.com',
  appId: 'demo-app-id',
}

export const firebaseConfig = import.meta.env.VITE_FIREBASE_PROJECT_ID
  ? {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }
  : demoConfig

// Default to emulators whenever there's no real project configured, or
// whenever running the Vite dev server. Explicit VITE_USE_EMULATORS=false
// forces real Firebase even in dev (rarely what you want).
export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'false'
  ? false
  : (import.meta.env.DEV || !import.meta.env.VITE_FIREBASE_PROJECT_ID)

// The single allowed user. Firestore rules independently enforce this —
// this constant just lets the client fail fast/clearly rather than
// silently querying data that rules will reject anyway. Set via env for
// your real account once you have one; the emulator doesn't care.
export const allowedEmail = import.meta.env.VITE_ALLOWED_EMAIL || null
