import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { round1, useData, useSyncing, useTargets } from '../lib/data'
import { addDays, daysBetween, formatShort, toKey } from '../lib/dates'
import { toAvatar } from '../lib/image'
import { NumField, Sheet } from '../components/ui'

const LIMITS = { calories: [1200, 6000], protein: [30, 400] }
const within = (value, [lo, hi]) => value != null && value >= lo && value <= hi
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length

function initials(name, email) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length) return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  return email ? email[0].toUpperCase() : 'H'
}

// Consecutive days with at least one meal logged. Today still counts as part
// of the streak before the first meal goes in.
function mealStreak(meals, today) {
  const days = new Set(meals.map((m) => m.eaten_on))
  let day = days.has(today) ? today : addDays(today, -1)
  let count = 0
  while (days.has(day)) {
    count += 1
    day = addDays(day, -1)
  }
  return count
}

export default function Profile({ user }) {
  const { state, store } = useData()
  const targets = useTargets()
  const syncing = useSyncing()
  const profile = state.profiles[0] ?? {}
  const today = toKey()
  const [calories, setCalories] = useState(targets.calorie_target)
  const [protein, setProtein] = useState(targets.protein_target)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [editing, setEditing] = useState(false)

  const changed = calories !== targets.calorie_target || protein !== targets.protein_target
  const valid = within(calories, LIMITS.calories) && within(protein, LIMITS.protein)
  const waiting = state.outbox.length

  // Every save sends the whole row, so editing one field never blanks another.
  function saveProfile(patch) {
    store.upsert('profiles', {
      calorie_target: targets.calorie_target,
      protein_target: targets.protein_target,
      ...profile,
      id: user.id,
      ...patch,
    })
  }

  function save(event) {
    event.preventDefault()
    if (!valid) return
    saveProfile({ calorie_target: calories, protein_target: protein })
  }

  const stats = useMemo(() => {
    const weights = [...state.weights].map((w) => ({ date: w.measured_on, kg: Number(w.kg) })).sort((a, b) => a.date.localeCompare(b.date))
    const week = weights.filter((w) => w.date >= addDays(today, -6))
    const start = weights[0] ?? null
    const current = week.length ? mean(week.map((w) => w.kg)) : weights.at(-1)?.kg ?? null
    const firstDays = [start?.date, ...state.meals.map((m) => m.eaten_on), ...state.workout_sets.map((s) => s.performed_on)].filter(Boolean)
    const began = firstDays.length ? firstDays.reduce((min, d) => (d < min ? d : min)) : null
    return {
      start,
      current,
      began,
      workouts: new Set(state.workout_sets.filter((s) => s.reps != null).map((s) => s.performed_on)).size,
      streak: mealStreak(state.meals, today),
    }
  }, [state.weights, state.meals, state.workout_sets, today])

  const goal = profile.goal_kg != null ? Number(profile.goal_kg) : null
  const lost = stats.start && stats.current != null ? stats.start.kg - stats.current : null
  const toGo = goal != null && stats.current != null ? stats.current - goal : null
  const progress = goal != null && stats.start && stats.start.kg > goal && lost != null ? Math.min(Math.max(lost / (stats.start.kg - goal), 0), 1) : null

  const name = profile.display_name?.trim()
  const subtitle = [
    user.email ?? 'Saved on this device',
    stats.began && `Day ${daysBetween(stats.began, today) + 1} of the cut`,
  ].filter(Boolean)

  let status = 'Not synced yet.'
  if (syncing) status = 'Syncing now.'
  else if (waiting) status = `${waiting} ${waiting === 1 ? 'change is' : 'changes are'} saved on this device and waiting for a connection.`
  else if (state.lastSync) status = `Everything is synced. Last checked ${new Date(state.lastSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`

  return (
    <>
      <header className="profile">
        <Avatar photo={profile.avatar} name={name} email={user.email} />
        <div className="profile-text">
          <h1 className="profile-name">{name || 'Your profile'}</h1>
          {subtitle.map((line) => (
            <p key={line} className="muted small">
              {line}
            </p>
          ))}
        </div>
        <button type="button" className="btn small-btn" onClick={() => setEditing(true)}>
          Edit
        </button>
      </header>

      <section aria-label="Progress">
        <div className="stats">
          <Stat label="Current" value={stats.current != null ? stats.current.toFixed(1) : '–'} unit="kg" />
          <Stat label="Lost" value={lost != null ? round1(Math.max(lost, 0)).toFixed(1) : '–'} unit="kg" />
          <Stat label="Goal" value={goal != null ? goal.toFixed(1) : '–'} unit="kg" />
          <Stat label="Log streak" value={stats.streak} unit={stats.streak === 1 ? 'day' : 'days'} />
          <Stat label="Workouts" value={stats.workouts} />
          <Stat label="To go" value={toGo != null ? Math.max(toGo, 0).toFixed(1) : '–'} unit="kg" />
        </div>

        {progress != null ? (
          <div className="goal">
            <div className="goal-track" role="meter" aria-label="Progress to goal weight" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <div className="goal-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="goal-ends muted small">
              <span>
                {stats.start.kg.toFixed(1)} kg on {formatShort(stats.start.date)}
              </span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
          </div>
        ) : (
          <p className="muted small">
            {goal == null ? 'Set a goal weight to see how far along the cut you are.' : 'Log a weigh-in to start tracking toward your goal.'}
          </p>
        )}
      </section>

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

      {editing && (
        <ProfileForm
          profile={profile}
          email={user.email}
          onClose={() => setEditing(false)}
          onSave={(patch) => {
            saveProfile(patch)
            setEditing(false)
          }}
        />
      )}
    </>
  )
}

function Avatar({ photo, name, email, large = false }) {
  return (
    <div className={large ? 'avatar large' : 'avatar'} aria-hidden="true">
      {photo ? <img src={photo} alt="" /> : initials(name, email)}
    </div>
  )
}

function Stat({ label, value, unit }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit && value !== '–' && <span className="stat-unit">{unit}</span>}
      </span>
    </div>
  )
}

function ProfileForm({ profile, email, onClose, onSave }) {
  const [name, setName] = useState(profile.display_name ?? '')
  const [photo, setPhoto] = useState(profile.avatar ?? null)
  const [photoError, setPhotoError] = useState(false)
  const fileInput = useRef(null)
  const [goal, setGoal] = useState(profile.goal_kg != null ? Number(profile.goal_kg) : null)
  const valid = goal == null || (goal >= 20 && goal <= 400)

  return (
    <Sheet title="Edit profile" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) onSave({ display_name: name.trim().slice(0, 60) || null, goal_kg: goal, avatar: photo })
        }}
      >
        <div className="avatar-edit">
          <Avatar photo={photo} name={name} email={email} large />
          <div className="avatar-actions">
            <button type="button" className="btn small-btn" onClick={() => fileInput.current.click()}>
              {photo ? 'Change photo' : 'Add photo'}
            </button>
            {photo && (
              <button type="button" className="btn link small-btn" onClick={() => setPhoto(null)}>
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={async (event) => {
              const file = event.target.files[0]
              event.target.value = ''
              if (!file) return
              try {
                setPhoto(await toAvatar(file))
                setPhotoError(false)
              } catch {
                setPhotoError(true)
              }
            }}
          />
        </div>
        {photoError && <p className="notice error">That file could not be read as a photo. Try a JPEG or PNG.</p>}
        <label className="label">
          Name
          <input className="field" type="text" maxLength={60} autoComplete="name" placeholder="Hiwa" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="label">
          <span>
            Goal weight, kg <span className="muted">optional</span>
          </span>
          <NumField value={goal} onCommit={setGoal} placeholder="70" />
        </label>
        {!valid && <p className="notice error">Enter a goal between 20 and 400 kg.</p>}
        <button className="btn primary" type="submit" disabled={!valid}>
          Save profile
        </button>
      </form>
    </Sheet>
  )
}
