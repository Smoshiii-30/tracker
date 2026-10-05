import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useData, useSyncing, useTargets } from '../lib/data'
import { NumField } from '../components/ui'

const LIMITS = { calories: [1200, 6000], protein: [30, 400] }
const within = (value, [lo, hi]) => value != null && value >= lo && value <= hi

export default function Settings({ user }) {
  const { state, store } = useData()
  const targets = useTargets()
  const syncing = useSyncing()
  const [calories, setCalories] = useState(targets.calorie_target)
  const [protein, setProtein] = useState(targets.protein_target)
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  const changed = calories !== targets.calorie_target || protein !== targets.protein_target
  const valid = within(calories, LIMITS.calories) && within(protein, LIMITS.protein)
  const waiting = state.outbox.length

  function save(event) {
    event.preventDefault()
    if (!valid) return
    store.upsert('profiles', { id: user.id, calorie_target: calories, protein_target: protein })
  }

  let status = 'Not synced yet.'
  if (syncing) status = 'Syncing now.'
  else if (waiting) status = `${waiting} ${waiting === 1 ? 'change is' : 'changes are'} saved on this device and waiting for a connection.`
  else if (state.lastSync) status = `Everything is synced. Last checked ${new Date(state.lastSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`

  return (
    <>
      <h1 className="page-title">Settings</h1>

      <section>
        <h2>Daily targets</h2>
        <form className="stack" onSubmit={save}>
          <div className="grid-2">
            <label className="label">
              Calories
              <NumField decimals={false} value={calories} onCommit={setCalories} />
            </label>
            <label className="label">
              Protein, g
              <NumField decimals={false} value={protein} onCommit={setProtein} />
            </label>
          </div>
          {!valid && (
            <p className="notice error">
              Calories go from {LIMITS.calories[0].toLocaleString('en-US')} to {LIMITS.calories[1].toLocaleString('en-US')}, protein from {LIMITS.protein[0]} to {LIMITS.protein[1]} g.
            </p>
          )}
          <button className="btn primary" type="submit" disabled={!changed || !valid}>
            {changed ? 'Save targets' : 'Targets saved'}
          </button>
        </form>
      </section>

      <section>
        <h2>Sync</h2>
        {store.canSync ? (
          <div className="stack">
            <p role="status">{status}</p>
            {waiting > 0 && state.syncError && <p className="muted small">Last attempt: {state.syncError}</p>}
            {state.rejected && <p className="notice error">The server refused a change: {state.rejected}</p>}
            <button type="button" className="btn" disabled={syncing} onClick={() => store.sync()}>
              Sync now
            </button>
          </div>
        ) : (
          <p>
            Saving to this device only. Add your Supabase keys to <code>.env.local</code> to sign in and sync across your phone and laptop.
          </p>
        )}
      </section>

      {supabase && (
        <section>
          <h2>Account</h2>
          <div className="stack">
            <p>Signed in as {user.email}</p>
            {confirmSignOut ? (
              <>
                <p className="notice error">
                  {waiting} unsynced {waiting === 1 ? 'change stays' : 'changes stay'} on this device until you sign in here again.
                </p>
                <button type="button" className="btn danger" onClick={() => supabase.auth.signOut()}>
                  Sign out anyway
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => (waiting ? setConfirmSignOut(true) : supabase.auth.signOut())}>
                Sign out
              </button>
            )}
          </div>
        </section>
      )}

      <section>
        <h2>Install on your phone</h2>
        <p className="muted">
          Open this site in Chrome or Safari, open the browser menu and choose Add to Home Screen. It then opens full screen and works without a signal.
        </p>
      </section>
    </>
  )
}
