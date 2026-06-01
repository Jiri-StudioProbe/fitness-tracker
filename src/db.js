const DB_NAME = 'fitness-tracker'
const DB_VERSION = 1

let _db = null

function open() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('plan')) {
        db.createObjectStore('plan', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('days')) {
        db.createObjectStore('days', { keyPath: 'date' })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' })
      }
    }
    req.onsuccess = e => { _db = e.target.result; resolve(_db) }
    req.onerror = () => reject(req.error)
  })
}

function tx(storeName, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode)
    const store = t.objectStore(storeName)
    const req = fn(store)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export const db = {
  savePlan: plan => tx('plan', 'readwrite', s => s.put(plan)),
  loadPlan: id => tx('plan', 'readonly', s => s.get(id)),
  getAllPlans: () => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction('plan', 'readonly')
    const req = t.objectStore('plan').getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })),

  saveDay: day => tx('days', 'readwrite', s => s.put(day)),
  loadDay: date => tx('days', 'readonly', s => s.get(date)),
  getAllDays: () => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction('days', 'readonly')
    const req = t.objectStore('days').getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })),

  getMeta: key => tx('meta', 'readonly', s => s.get(key)).then(r => r?.value),
  setMeta: (key, value) => tx('meta', 'readwrite', s => s.put({ key, value })),

  exportAll: async () => {
    const [plans, days] = await Promise.all([db.getAllPlans(), db.getAllDays()])
    return { plans, days, exportedAt: new Date().toISOString() }
  },

  importAll: async ({ plans, days }) => {
    const db_ = await open()
    await new Promise((resolve, reject) => {
      const t = db_.transaction(['plan', 'days'], 'readwrite')
      plans.forEach(p => t.objectStore('plan').put(p))
      days.forEach(d => t.objectStore('days').put(d))
      t.oncomplete = resolve
      t.onerror = () => reject(t.error)
    })
  }
}
