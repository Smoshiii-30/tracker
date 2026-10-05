import { useMemo, useState } from 'react'
import { newId, useData } from '../lib/data'
import { formatShort, toKey } from '../lib/dates'
import { PROGRAM, nextDayKey } from '../lib/program'
import { DayNav, NumField } from '../components/ui'

const isMainDay = (key) => PROGRAM.some((day) => day.key === key && !day.optional)

export default function Workout() {
  const { state, store } = useData()
  const [date, setDate] = useState(toKey())
  const [picked, setPicked] = useState(null)

  const todays = useMemo(() => state.workout_sets.filter((s) => s.performed_on === date), [state.workout_sets, date])

  // Open on whatever was already started today, otherwise the next day in the rotation.
  const suggested = useMemo(() => {
    if (todays.length) return todays[todays.length - 1].day_key
    const earlier = state.workout_sets
      .filter((s) => s.performed_on < date && isMainDay(s.day_key))
      .sort((a, b) => b.performed_on.localeCompare(a.performed_on))
    return earlier.length ? nextDayKey(earlier[0].day_key) : PROGRAM[0].key
  }, [state.workout_sets, todays, date])

  const day = PROGRAM.find((d) => d.key === (picked ?? suggested)) ?? PROGRAM[0]
  const planned = day.exercises.reduce((n, e) => n + e.sets, 0)
  const done = todays.filter((s) => s.day_key === day.key && s.reps != null).length

  return (
    <>
      <DayNav
        day={date}
        onChange={(next) => {
          setDate(next)
          setPicked(null)
        }}
      />

      <div className="segmented scroll" role="group" aria-label="Workout day">
        {PROGRAM.map((d) => (
          <button key={d.key} type="button" className={d.key === day.key ? 'active' : ''} aria-pressed={d.key === day.key} onClick={() => setPicked(d.key)}>
            {d.name}
          </button>
        ))}
      </div>

      <p className="muted workout-progress">
        {done} of {planned} sets logged. Stop each set 1 or 2 reps short of failure.
      </p>

      {day.exercises.map((exercise) => (
        <Exercise
          key={`${day.key}:${exercise.name}`}
          exercise={exercise}
          dayKey={day.key}
          date={date}
          sets={todays.filter((s) => s.exercise === exercise.name)}
          all={state.workout_sets}
          store={store}
        />
      ))}

      {day.finisher && <p className="notice">{day.finisher}</p>}
    </>
  )
}

function Exercise({ exercise, dayKey, date, sets, all, store }) {
  const [lo, hi] = exercise.reps

  // The most recent earlier session of this exercise, from any workout day.
  const previous = useMemo(() => {
    const older = all.filter((s) => s.exercise === exercise.name && s.performed_on < date && s.reps != null)
    if (!older.length) return null
    const latest = older.reduce((max, s) => (s.performed_on > max ? s.performed_on : max), '')
    return {
      date: latest,
      sets: older.filter((s) => s.performed_on === latest).sort((a, b) => a.set_number - b.set_number),
    }
  }, [all, exercise.name, date])

  const readyForMore = previous && previous.sets.length >= exercise.sets && previous.sets.every((s) => s.reps >= hi)

  function write(number, patch) {
    const current = sets.find((s) => s.set_number === number)
    const next = { weight_kg: current?.weight_kg ?? null, reps: current?.reps ?? null, ...patch }
    if (next.weight_kg == null && next.reps == null) {
      if (current) store.remove('workout_sets', current.id)
      return
    }
    store.upsert('workout_sets', {
      id: current?.id ?? newId(),
      performed_on: date,
      day_key: dayKey,
      exercise: exercise.name,
      set_number: number,
      ...next,
      created_at: current?.created_at ?? new Date().toISOString(),
    })
  }

  return (
    <section className="exercise">
      <div className="exercise-head">
        <h2>{exercise.name}</h2>
        <span className="target">
          {exercise.sets} sets of {lo} to {hi}
        </span>
      </div>
      {exercise.note && <p className="muted small">{exercise.note}</p>}
      {previous ? (
        <p className="muted small">
          {formatShort(previous.date)}:{' '}
          {previous.sets.map((s) => (s.weight_kg != null ? `${Number(s.weight_kg)} kg × ${s.reps}` : `${s.reps} reps`)).join(', ')}
        </p>
      ) : (
        <p className="muted small">No earlier session yet. Pick a weight you can move for {lo} clean reps.</p>
      )}
      {readyForMore && <p className="nudge">You hit {hi} reps on every set last time. Add weight today.</p>}

      {Array.from({ length: exercise.sets }, (_, i) => i + 1).map((number) => {
        const current = sets.find((s) => s.set_number === number)
        const before = previous?.sets.find((s) => s.set_number === number)
        return (
          <div className="set-row" key={number}>
            <span className="set-n">Set {number}</span>
            <NumField
              aria-label={`${exercise.name}, set ${number}, weight in kg`}
              placeholder={before?.weight_kg != null ? String(Number(before.weight_kg)) : exercise.bodyweight ? '0' : ''}
              value={current?.weight_kg == null ? null : Number(current.weight_kg)}
              onCommit={(weight_kg) => write(number, { weight_kg })}
            />
            <span className="unit">kg</span>
            <NumField
              decimals={false}
              aria-label={`${exercise.name}, set ${number}, reps`}
              placeholder={before?.reps != null ? String(before.reps) : ''}
              value={current?.reps ?? null}
              onCommit={(reps) => write(number, { reps })}
            />
            <span className="unit">reps</span>
          </div>
        )
      })}
    </section>
  )
}
