import { useMemo, useState } from 'react'
import { newId, useData, useTargets } from '../lib/data'
import { addDays, formatDay, toKey } from '../lib/dates'
import { NumField } from '../components/ui'
import WeightChart from '../components/WeightChart'

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length

// Compares the last 7 days with the 7 before. Needs 3 weigh-ins in each week,
// because one heavy morning says more about water than about fat.
function pace(entries, today, calorieTarget) {
  const between = (from, to) => entries.filter((e) => e.date >= from && e.date <= to).map((e) => e.kg)
  const thisWeek = between(addDays(today, -6), today)
  const lastWeek = between(addDays(today, -13), addDays(today, -7))
  if (thisWeek.length < 3 || lastWeek.length < 3) return null

  const change = mean(thisWeek) - mean(lastWeek)
  let advice
  if (change <= -0.8) advice = 'Faster than planned. Add 100 to 150 kcal a day to protect your lifts.'
  else if (change <= -0.3) advice = 'On pace for a steady cut.'
  else if (calorieTarget > 1800) advice = 'Slower than 0.3 kg a week. If next week looks the same, drop about 150 kcal a day.'
  else advice = 'Slower than planned, and your target is already low. Hold it and tighten your logging before cutting further.'
  return { change, advice }
}

export default function Weight() {
  const { state, store } = useData()
  const targets = useTargets()
  const today = toKey()
  const [date, setDate] = useState(today)
  const [kg, setKg] = useState(null)
  const [range, setRange] = useState(30)

  const entries = useMemo(
    () =>
      state.weights
        .map((w) => ({ id: w.id, date: w.measured_on, kg: Number(w.kg), created_at: w.created_at }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [state.weights],
  )

  const points = useMemo(() => {
    const from = addDays(today, -(range - 1))
    return entries
      .filter((e) => e.date >= from)
      .map((e) => {
        const start = addDays(e.date, -6)
        return { ...e, avg: mean(entries.filter((o) => o.date >= start && o.date <= e.date).map((o) => o.kg)) }
      })
  }, [entries, range, today])

  const week = entries.filter((e) => e.date >= addDays(today, -6) && e.date <= today)
  const trend = pace(entries, today, targets.calorie_target)
  const valid = kg != null && kg >= 20 && kg <= 400

  function save(event) {
    event.preventDefault()
    if (!valid) return
    const existing = entries.find((e) => e.date === date)
    store.upsert('weights', {
      id: existing?.id ?? newId(),
      measured_on: date,
      kg,
      created_at: existing?.created_at ?? new Date().toISOString(),
    })
    setKg(null)
  }

  return (
    <>
      <h1 className="page-title">Weight</h1>

      <section className="hero" aria-label="Weekly average">
        {week.length > 0 ? (
          <>
            <p className="hero-num">
              {mean(week.map((e) => e.kg)).toFixed(1)}
              <span className="hero-unit">kg</span>
            </p>
            <p className="hero-label">
              7-day average from {week.length} {week.length === 1 ? 'weigh-in' : 'weigh-ins'}
            </p>
          </>
        ) : (
          <p className="hero-label">No weigh-ins in the last 7 days.</p>
        )}
        {trend ? (
          <p className="trend">
            <b>
              {trend.change > 0 ? '+' : trend.change < 0 ? '−' : ''}
              {Math.abs(trend.change).toFixed(1)} kg
            </b>{' '}
            against the week before. {trend.advice}
          </p>
        ) : (
          <p className="trend muted">Weigh in at least 3 mornings a week and your weekly pace shows up here.</p>
        )}
      </section>

      <form className="weigh-form" onSubmit={save}>
        <label className="label">
          Date
          <input className="field" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value || today)} />
        </label>
        <label className="label">
          Weight, kg
          <NumField value={kg} onCommit={setKg} placeholder="76.6" />
        </label>
        <button className="btn primary" type="submit" disabled={!valid}>
          Save weigh-in
        </button>
      </form>
      {kg != null && !valid && <p className="notice error">Enter a weight between 20 and 400 kg.</p>}

      <section>
        <div className="section-head">
          <h2>Trend</h2>
          <div className="segmented" role="group" aria-label="Chart range">
            {[30, 90].map((days) => (
              <button key={days} type="button" className={range === days ? 'active' : ''} aria-pressed={range === days} onClick={() => setRange(days)}>
                {days} days
              </button>
            ))}
          </div>
        </div>
        {points.length > 0 ? (
          <WeightChart points={points} />
        ) : (
          <p className="empty">Save a weigh-in and the chart starts here. Same time each morning gives the cleanest line.</p>
        )}
      </section>

      {entries.length > 0 && (
        <section>
          <h2>Weigh-ins</h2>
          <ul className="list">
            {[...entries]
              .reverse()
              .slice(0, 14)
              .map((entry) => (
                <li key={entry.id} className="row static">
                  <span className="row-name">{formatDay(entry.date)}</span>
                  <span className="row-num">{entry.kg.toFixed(1)} kg</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Delete weigh-in for ${formatDay(entry.date)}`}
                    onClick={() => store.remove('weights', entry.id)}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  )
}
