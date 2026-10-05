import { useEffect, useRef, useState } from 'react'
import { addDays, formatDay, toKey } from '../lib/dates'
import { fmt } from '../lib/data'

// Text input that only accepts a number. It keeps its own text so half-typed
// values like "62." survive, and reports a number (or null when empty).
export function NumField({ value, onCommit, decimals = true, className = '', ...rest }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const last = useRef(value ?? null)

  useEffect(() => {
    const incoming = value ?? null
    if (incoming !== last.current) {
      last.current = incoming
      setText(incoming == null ? '' : String(incoming))
    }
  }, [value])

  return (
    <input
      {...rest}
      className={`field num ${className}`}
      type="text"
      inputMode={decimals ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={text}
      onChange={(event) => {
        const next = event.target.value.replace(',', '.')
        const pattern = decimals ? /^\d{0,4}(\.\d{0,2})?$/ : /^\d{0,5}$/
        if (!pattern.test(next)) return
        setText(next)
        const number = next === '' || next === '.' ? null : Number(next)
        last.current = number
        onCommit(number)
      }}
    />
  )
}

// Bottom sheet built on <dialog>, so focus trapping and Escape come for free.
export function Sheet({ title, onClose, children }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) ref.current.close()
      }}
    >
      <div className="sheet-body">
        <header className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => ref.current.close()}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}

export function DayNav({ day, onChange }) {
  const today = toKey()
  return (
    <div className="day-nav">
      <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => onChange(addDays(day, -1))}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h1>{formatDay(day, { long: true })}</h1>
      <button
        type="button"
        className="icon-btn"
        aria-label="Next day"
        disabled={day >= today}
        onClick={() => onChange(addDays(day, 1))}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}

// Progress toward a daily target. Tick marks sit at fixed steps so the bar
// reads like a loaded barbell sleeve: each notch is another 500 kcal or 50 g.
export function Meter({ label, value, target, unit, tone, step }) {
  const ratio = target > 0 ? value / target : 0
  const over = value > target
  const ticks = []
  for (let t = step; t < target; t += step) ticks.push(t / target)

  return (
    <div className="meter">
      <div className="meter-row">
        <span className="meter-label">{label}</span>
        <span className="meter-value">
          <b>{fmt(value)}</b> of {fmt(target)} {unit}
        </span>
      </div>
      <div
        className={`meter-track ${tone}`}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.round(value)}
        aria-valuetext={`${fmt(value)} of ${fmt(target)} ${unit}`}
      >
        <div className={`meter-fill ${over ? 'over' : ''}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
        {ticks.map((position) => (
          <span key={position} className="meter-tick" style={{ left: `${position * 100}%` }} />
        ))}
      </div>
      {over && (
        <p className="meter-note over-text">
          Over by {fmt(value - target)} {unit}
        </p>
      )}
    </div>
  )
}

const ICONS = {
  today: 'M4 11h16M7 4v7M12 4v7M17 4v7M6 11v6a3 3 0 003 3h6a3 3 0 003-3v-6',
  weight: 'M4 17l5-5 4 3 7-8M15 7h5v5',
  workout: 'M3 12h3M18 12h3M6 7v10M9 5v14M15 5v14M18 7v10M9 12h6',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
}

export function TabBar({ tab, onChange }) {
  const tabs = [
    ['today', 'Today'],
    ['weight', 'Weight'],
    ['workout', 'Workout'],
    ['settings', 'Settings'],
  ]
  return (
    <nav className="tabbar" aria-label="Sections">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={tab === key ? 'tab active' : 'tab'}
          aria-current={tab === key ? 'page' : undefined}
          onClick={() => onChange(key)}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d={ICONS[key]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
