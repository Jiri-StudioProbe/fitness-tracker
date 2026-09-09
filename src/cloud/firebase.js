import { initializeApp } from 'firebase/app'
import {
  getAuth,
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

export const auth = getAuth(app)

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
