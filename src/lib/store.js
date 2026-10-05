// Local-first store. Every change is saved to this device first, then queued
// for Supabase. The queue drains whenever there is a connection, so logging a
// set with no gym signal just works and syncs later.
//
// No browser or React imports here, so it can be tested in plain Node.

export const TABLES = {
  profiles: { conflict: 'id' },
  meals: { conflict: 'id', dateCol: 'eaten_on' },
  weights: { conflict: 'user_id,measured_on', dateCol: 'measured_on' },
  workout_sets: { conflict: 'user_id,performed_on,exercise,set_number', dateCol: 'performed_on' },
}

// How far back each sync re-reads from the server. Older rows stay on the
// device as they are.
const WINDOW_DAYS = 120
const PAGE = 1000

function dayKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

function emptyState() {
  return {
    profiles: [],
    meals: [],
    weights: [],
    workout_sets: [],
    outbox: [],
    lastSync: null,
    syncError: null,
    rejected: null,
  }
}

// A failed request is retried when the server never answered or the session
// needs refreshing. Anything else is the server refusing the change, and
// retrying would block the queue forever.
function shouldRetry(status) {
  return !status || status === 401 || status === 408 || status === 429 || status >= 500
}

export function createStore({ client = null, userId, storage, now = () => new Date() }) {
  const storageKey = `hiwa:${userId}`
  const listeners = new Set()
  let state = load()
  let syncing = false
  let again = false

  function load() {
    try {
      const raw = storage.getItem(storageKey)
      if (raw) return { ...emptyState(), ...JSON.parse(raw) }
    } catch {
      // Unreadable storage: start empty and let the next sync refill it.
    }
    return emptyState()
  }

  function notify() {
    listeners.forEach((listener) => listener())
  }

  function commit(next) {
    state = next
    try {
      storage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // Storage full or blocked. The change still lives in memory.
    }
    notify()
  }

  function setSyncing(value) {
    syncing = value
    notify()
  }

  function upsert(table, row) {
    const full = client && table !== 'profiles' ? { ...row, user_id: userId } : row
    const rows = state[table].filter((r) => r.id !== full.id)
    rows.push(full)
    let outbox = state.outbox
    if (client) {
      // A newer write to the same row replaces any older one still waiting.
      outbox = outbox.filter((o) => !(o.op === 'upsert' && o.table === table && o.row.id === full.id))
      outbox.push({ op: 'upsert', table, row: full })
    }
    commit({ ...state, [table]: rows, outbox })
    sync()
    return full
  }

  function remove(table, id) {
    let outbox = state.outbox
    if (client) {
      outbox = outbox.filter((o) => !(o.op === 'upsert' && o.table === table && o.row.id === id))
      outbox.push({ op: 'delete', table, id })
    }
    commit({ ...state, [table]: state[table].filter((r) => r.id !== id), outbox })
    sync()
  }

  async function flush() {
    while (state.outbox.length) {
      const op = state.outbox[0]
      let result
      try {
        result =
          op.op === 'upsert'
            ? await client.from(op.table).upsert(op.row, { onConflict: TABLES[op.table].conflict })
            : await client.from(op.table).delete().eq('id', op.id)
      } catch (error) {
        result = { error: { message: String(error) }, status: 0 }
      }

      if (result.error && shouldRetry(result.status)) {
        commit({ ...state, syncError: result.error.message || 'No connection' })
        return false
      }

      const outbox = state.outbox.filter((o) => o !== op)
      commit(result.error ? { ...state, outbox, rejected: result.error.message } : { ...state, outbox })
    }
    return true
  }

  async function pull() {
    const since = new Date(now())
    since.setDate(since.getDate() - WINDOW_DAYS)
    const sinceKey = dayKey(since)
    const tables = {}

    for (const [table, config] of Object.entries(TABLES)) {
      const rows = []
      for (let from = 0; ; from += PAGE) {
        let query = client.from(table).select('*')
        if (config.dateCol) query = query.gte(config.dateCol, sinceKey).order(config.dateCol)
        let result
        try {
          result = await query.order('id').range(from, from + PAGE - 1)
        } catch (error) {
          result = { error: { message: String(error) } }
        }
        if (result.error) {
          commit({ ...state, syncError: result.error.message || 'No connection' })
          return null
        }
        rows.push(...result.data)
        if (result.data.length < PAGE) break
      }
      tables[table] = rows
    }
    return { sinceKey, tables }
  }

  function apply({ sinceKey, tables }) {
    const next = { ...state, lastSync: now().toISOString(), syncError: null }
    for (const [table, config] of Object.entries(TABLES)) {
      const older = config.dateCol ? state[table].filter((r) => r[config.dateCol] < sinceKey) : []
      next[table] = [...older, ...tables[table]]
    }
    commit(next)
  }

  // Push queued changes, then read the server copy. If something is written
  // while the read is in flight, the read is thrown away and the loop runs
  // again, so a fresh local change is never overwritten by older server data.
  async function sync() {
    if (!client) return
    if (syncing) {
      again = true
      return
    }
    setSyncing(true)
    try {
      do {
        again = false
        if (!(await flush())) break
        const pulled = await pull()
        if (!pulled) break
        if (state.outbox.length) {
          again = true
          continue
        }
        apply(pulled)
      } while (again)
    } finally {
      setSyncing(false)
    }
  }

  return {
    getState: () => state,
    isSyncing: () => syncing,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    upsert,
    remove,
    sync,
    canSync: Boolean(client),
  }
}
