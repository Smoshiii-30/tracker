import test from 'node:test'
import assert from 'node:assert/strict'
import { createStore, TABLES } from '../src/lib/store.js'

// A stand-in for the Supabase client: in-memory tables behind the same
// chained calls the store uses, with a switch to simulate lost signal.
function fakeServer() {
  const db = Object.fromEntries(Object.keys(TABLES).map((t) => [t, []]))
  const server = { db, offline: false, reject: null, calls: 0 }

  server.from = (table) => {
    const q = { filters: [], range: null }
    const run = () => {
      server.calls++
      if (server.offline) return { error: { message: 'TypeError: Failed to fetch' }, status: 0 }
      if (server.reject) return { error: { message: server.reject }, status: 400 }
      if (q.kind === 'upsert') {
        const keys = q.conflict.split(',')
        const same = (r) => keys.every((k) => r[k] === q.row[k])
        if (db[table].some((r) => r.id === q.row.id && !same(r))) {
          return { error: { message: 'duplicate key' }, status: 409 }
        }
        db[table] = db[table].filter((r) => !same(r)).concat({ ...q.row })
        return { error: null, status: 201 }
      }
      if (q.kind === 'delete') {
        db[table] = db[table].filter((r) => !q.filters.every((f) => f(r)))
        return { error: null, status: 204 }
      }
      const rows = db[table].filter((r) => q.filters.every((f) => f(r)))
      return { data: rows.slice(q.range[0], q.range[1] + 1), error: null, status: 200 }
    }
    const api = {
      upsert: (row, opts) => ((q.kind = 'upsert'), (q.row = row), (q.conflict = opts.onConflict), api),
      delete: () => ((q.kind = 'delete'), api),
      select: () => ((q.kind = 'select'), api),
      eq: (col, v) => (q.filters.push((r) => r[col] === v), api),
      gte: (col, v) => (q.filters.push((r) => r[col] >= v), api),
      order: () => api,
      range: (a, b) => ((q.range = [a, b]), api),
      then: (resolve, rejectFn) => Promise.resolve().then(run).then(resolve, rejectFn),
    }
    return api
  }
  return server
}

function memoryStorage() {
  const map = new Map()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), map }
}

const NOW = () => new Date(2026, 9, 5, 12)
const idle = async (store) => {
  for (let i = 0; i < 50 && store.isSyncing(); i++) await new Promise((r) => setTimeout(r, 1))
}
const meal = (id, name = 'Egg') => ({ id, eaten_on: '2026-10-05', name, calories: 72, protein: 6.3 })

test('a write reaches the server and comes back on the next read', async () => {
  const server = fakeServer()
  const store = createStore({ client: server, userId: 'u1', storage: memoryStorage(), now: NOW })
  store.upsert('meals', meal('m1'))
  await idle(store)
  assert.equal(server.db.meals.length, 1)
  assert.equal(server.db.meals[0].user_id, 'u1')
  assert.equal(store.getState().outbox.length, 0)
  assert.equal(store.getState().meals.length, 1)
  assert.ok(store.getState().lastSync)
})

test('offline writes stay on the device, survive a restart, and sync later', async () => {
  const server = fakeServer()
  const storage = memoryStorage()
  server.offline = true
  let store = createStore({ client: server, userId: 'u1', storage, now: NOW })
  store.upsert('meals', meal('m1'))
  store.upsert('weights', { id: 'w1', measured_on: '2026-10-05', kg: 76.6 })
  await idle(store)
  assert.equal(store.getState().outbox.length, 2)
  assert.equal(store.getState().meals.length, 1)
  assert.equal(server.db.meals.length, 0)

  store = createStore({ client: server, userId: 'u1', storage, now: NOW }) // app reopened
  assert.equal(store.getState().outbox.length, 2)
  server.offline = false
  await store.sync()
  assert.equal(store.getState().outbox.length, 0)
  assert.equal(server.db.meals.length, 1)
  assert.equal(server.db.weights[0].kg, 76.6)
})

test('repeated edits to one row collapse into a single queued write', async () => {
  const server = fakeServer()
  server.offline = true
  const store = createStore({ client: server, userId: 'u1', storage: memoryStorage(), now: NOW })
  for (const reps of [1, 12]) {
    store.upsert('workout_sets', { id: 's1', performed_on: '2026-10-05', exercise: 'Squat', set_number: 1, reps })
  }
  await idle(store)
  assert.equal(store.getState().outbox.length, 1)
  assert.equal(store.getState().outbox[0].row.reps, 12)
})

test('deleting an unsynced row cancels its queued write', async () => {
  const server = fakeServer()
  server.offline = true
  const store = createStore({ client: server, userId: 'u1', storage: memoryStorage(), now: NOW })
  store.upsert('meals', meal('m1'))
  store.remove('meals', 'm1')
  await idle(store)
  assert.deepEqual(store.getState().outbox.map((o) => o.op), ['delete'])
  assert.equal(store.getState().meals.length, 0)
})

test('a change the server refuses is dropped so the queue keeps moving', async () => {
  const server = fakeServer()
  const store = createStore({ client: server, userId: 'u1', storage: memoryStorage(), now: NOW })
  server.reject = 'violates check constraint'
  store.upsert('meals', meal('bad'))
  await idle(store)
  assert.equal(store.getState().outbox.length, 0)
  assert.match(store.getState().rejected, /check constraint/)
})

test('rows changed on another device arrive, and old history is kept', async () => {
  const server = fakeServer()
  const storage = memoryStorage()
  storage.setItem(
    'hiwa:u1',
    JSON.stringify({ meals: [{ id: 'old', user_id: 'u1', eaten_on: '2026-01-01', name: 'Old', calories: 1 }] }),
  )
  server.db.meals.push({ ...meal('remote', 'From laptop'), user_id: 'u1' })
  const store = createStore({ client: server, userId: 'u1', storage, now: NOW })
  await store.sync()
  assert.deepEqual(store.getState().meals.map((m) => m.id).sort(), ['old', 'remote'])
})

test('a second weigh-in for the same day replaces the first', async () => {
  const server = fakeServer()
  const store = createStore({ client: server, userId: 'u1', storage: memoryStorage(), now: NOW })
  store.upsert('weights', { id: 'w1', measured_on: '2026-10-05', kg: 76.6 })
  await idle(store)
  store.upsert('weights', { id: 'w2', measured_on: '2026-10-05', kg: 76.2 })
  await idle(store)
  assert.equal(server.db.weights.length, 1)
  assert.equal(server.db.weights[0].kg, 76.2)
})

test('a write made while a read is in flight is not overwritten', async () => {
  const server = fakeServer()
  const store = createStore({ client: server, userId: 'u1', storage: memoryStorage(), now: NOW })
  const running = store.sync() // nothing queued, so this goes straight to reading
  store.upsert('meals', meal('late'))
  await running
  await idle(store)
  assert.equal(store.getState().meals.length, 1)
  assert.equal(server.db.meals.length, 1)
})

test('without a client everything is saved locally and nothing is queued', () => {
  const store = createStore({ userId: 'local', storage: memoryStorage(), now: NOW })
  store.upsert('meals', meal('m1'))
  assert.equal(store.getState().meals.length, 1)
  assert.equal(store.getState().outbox.length, 0)
  assert.equal(store.getState().meals[0].user_id, undefined)
})
