import { initializeApp } from 'firebase/app'
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  connectAuthEmulator,
} from 'firebase/auth'
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore'
import { firebaseConfig, useEmulators } from './firebaseConfig.js'

const app = initializeApp(firebaseConfig)

// getAuth()'s implicit default is indexedDBLocalPersistence with no
// fallback — fine normally, but IndexedDB is exactly the storage Safari
// (especially installed/home-screen PWAs, and Private Browsing) is most
// aggressive about evicting or blocking, and a failed IndexedDB open
// with no fallback configured can silently downgrade to session-only
// persistence. Listing an explicit fallback chain means a device that
// can't do IndexedDB still keeps the session in localStorage rather
// than losing it outright — only a device with neither survives just
// for the current tab.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
})

// Persistent local cache = writes made with no signal queue on-device and
// flush to Firestore once connectivity returns, and reads serve from
// cache instantly. This is what replaces our own IndexedDB code as the
// offline story, without us hand-rolling a sync queue.
export const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
})

if (useEmulators) {
  // 127.0.0.1 rather than localhost avoids IPv6/IPv4 resolution flakiness
  // in some browsers/CI environments.
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
}
