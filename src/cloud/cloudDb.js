import {
  doc, setDoc, getDoc, getDocs, collection, query, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { firestore } from './firebase.js'

// Mirrors db.js's IndexedDB shape exactly (plan/days/meta), just backed
// by Firestore under the signed-in user instead of a local-only store.
// Record shapes are unchanged from today's app — this swap is purely
// "where does the data live," not a rework of what gets recorded.

let _uid = null

function requireUid() {
  if (!_uid) throw new Error('cloudDb used before a signed-in user was set')
  return _uid
}

function userCollection(name) {
  return collection(firestore, 'users', requireUid(), name)
}

export const cloudDb = {
  setUser: uid => { _uid = uid },
  clearUser: () => { _uid = null },

  savePlan: plan => setDoc(
    doc(userCollection('plans'), plan.plan.id),
    { ...plan, id: plan.plan.id, _savedAt: serverTimestamp() },
  ),

  loadPlan: async id => {
    const snap = await getDoc(doc(userCollection('plans'), id))
    return snap.exists() ? snap.data() : undefined
  },

  getAllPlans: async () => {
    // Oldest-first, so callers picking `plans[plans.length - 1]` (as
    // main.js does) get the most recently saved plan — same convention
    // db.js's callers already rely on, now actually ordered by recency
    // rather than IndexedDB's arbitrary key order.
    const snap = await getDocs(query(userCollection('plans'), orderBy('_savedAt', 'asc')))
    return snap.docs.map(d => d.data())
  },

  saveDay: day => setDoc(doc(userCollection('days'), day.date), day),

  loadDay: async date => {
    const snap = await getDoc(doc(userCollection('days'), date))
    return snap.exists() ? snap.data() : undefined
  },

  getAllDays: async () => {
    const snap = await getDocs(userCollection('days'))
    return snap.docs.map(d => d.data())
  },

  getMeta: async key => {
    const snap = await getDoc(doc(userCollection('meta'), key))
    return snap.exists() ? snap.data().value : undefined
  },

  setMeta: (key, value) => setDoc(doc(userCollection('meta'), key), { key, value }),
}
