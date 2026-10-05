import { useEffect, useRef, useState } from 'react'
import { daysBetween, formatDay, formatShort } from '../lib/dates'

const HEIGHT = 220
const MARGIN = { top: 12, right: 14, bottom: 28, left: 40 }

function yScale(values) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min + 1
  const step = spread <= 2.5 ? 0.5 : spread <= 5 ? 1 : spread <= 10 ? 2 : 5
  const lo = Math.floor((min - 0.25) / step) * step
  const hi = Math.ceil((max + 0.25) / step) * step
  const ticks = []
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10)
  return { lo, hi, ticks }
}

// points: [{ date, kg, avg }] sorted oldest first.
export default function WeightChart({ points }) {
  const wrap = useRef(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState(null)

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(wrap.current)
    return () => observer.disconnect()
  }, [])

  const first = points[0].date
  const last = points[points.length - 1].date
  const span = daysBetween(first, last)
  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 0)
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom
  const { lo, hi, ticks } = yScale(points.flatMap((p) => [p.kg, p.avg]))

  const x = (date) => MARGIN.left + (span === 0 ? innerW / 2 : (daysBetween(first, date) / span) * innerW)
  const y = (kg) => MARGIN.top + (1 - (kg - lo) / (hi - lo)) * innerH

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.avg).toFixed(1)}`).join(' ')

  const xLabels = span === 0 ? [first] : span < 6 ? [first, last] : [first, points[Math.floor(points.length / 2)].date, last]
  const uniqueLabels = [...new Set(xLabels)]

  function pick(event) {
    const box = wrap.current.getBoundingClientRect()
    const px = event.clientX - box.left
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(points[best].date) - px)) best = i
    })
    setActive(best)
  }

  const hover = active != null ? points[Math.min(active, points.length - 1)] : null
  const tipLeft = hover ? Math.min(Math.max(x(hover.date), 84), Math.max(width - 84, 84)) : 0

  return (
    <figure className="chart">
      <ul className="legend">
        <li>
          <svg width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="4" className="dot" />
          </svg>
          Weigh-in
        </li>
        <li>
          <svg width="18" height="14" aria-hidden="true">
            <path d="M1 7h16" className="avg" />
          </svg>
          7-day average
        </li>
      </ul>

      <div className="chart-wrap" ref={wrap}>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Weight from ${formatShort(first)} to ${formatShort(last)}. Latest 7-day average ${points[points.length - 1].avg.toFixed(1)} kg.`}
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={(event) => event.pointerType === 'mouse' && setActive(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} className="grid" />
                <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="axis">
                  {t}
                </text>
              </g>
            ))}
            {uniqueLabels.map((date, i) => (
              <text
                key={date}
                x={x(date)}
                y={HEIGHT - 8}
                textAnchor={span === 0 ? 'middle' : i === 0 ? 'start' : i === uniqueLabels.length - 1 ? 'end' : 'middle'}
                className="axis"
              >
                {formatShort(date)}
              </text>
            ))}

            {hover && <line x1={x(hover.date)} x2={x(hover.date)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} className="crosshair" />}
            {points.length > 1 && <path d={line} className="avg" />}
            {points.map((p) => (
              <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={hover === p ? 6 : 4} className="dot ringed" />
            ))}
          </svg>
        )}

        {hover && (
          <div className="tip" style={{ left: tipLeft }} role="status">
            <b>{formatDay(hover.date)}</b>
            <span>Weigh-in {hover.kg.toFixed(1)} kg</span>
            <span>7-day average {hover.avg.toFixed(1)} kg</span>
          </div>
        )}
      </div>
    </figure>
  )
}
