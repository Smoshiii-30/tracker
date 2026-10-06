import { addDays, daysBetween, fromKey } from './dates.js'

// About 7,700 kcal of eating below maintenance takes off 1 kg of body weight.
const KCAL_PER_KG = 7700
// A day under this was probably only half logged, and would make maintenance
// look lower than it is.
const MIN_DAY_KCAL = 800
const WINDOW = 21
const NEED_DAYS = 10
const NEED_WEIGH_INS = 6
// A steady cut: 0.5 kg a week is about 550 kcal a day under maintenance.
const DEFICIT = 550

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length
const roundTo = (n, step) => Math.round(n / step) * step

function dailyCalories(meals, from, to) {
  const days = new Map()
  for (const meal of meals) {
    if (meal.eaten_on < from || meal.eaten_on > to) continue
    days.set(meal.eaten_on, (days.get(meal.eaten_on) ?? 0) + Number(meal.calories || 0))
  }
  return days
}

// Least-squares line through the weigh-ins, so one salty morning barely moves it.
function fitLine(points) {
  const x0 = points[0].date
  const xs = points.map((p) => daysBetween(x0, p.date))
  const ys = points.map((p) => p.kg)
  const mx = mean(xs)
  const my = mean(ys)
  const sxx = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0)
  const slope = sxx ? xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i] - my), 0) / sxx : 0
  return { slope, at: (date) => my + slope * (daysBetween(x0, date) - mx) }
}

// Works out real maintenance from the last three weeks: what you ate, plus
// what the scale says that intake did. Today is left out because it is not
// finished yet. Returns { ready: false, ... } with the counts still needed.
export function estimateMaintenance({ meals, weights, today, goalKg = null }) {
  const from = addDays(today, -WINDOW)
  const to = addDays(today, -1)

  const logged = [...dailyCalories(meals, from, to).values()].filter((kcal) => kcal >= MIN_DAY_KCAL)
  const points = weights
    .map((w) => ({ date: w.measured_on, kg: Number(w.kg) }))
    .filter((p) => p.date >= from && p.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const span = points.length ? daysBetween(points[0].date, points.at(-1).date) : 0

  if (logged.length < NEED_DAYS || points.length < NEED_WEIGH_INS || span < NEED_DAYS) {
    return { ready: false, loggedDays: logged.length, weighIns: points.length, needDays: NEED_DAYS, needWeighIns: NEED_WEIGH_INS }
  }

  const line = fitLine(points)
  const intake = mean(logged)
  const maintenance = intake - line.slope * KCAL_PER_KG
  // Far outside this range means the logging or the scale is off, not the body.
  if (maintenance < 1200 || maintenance > 5000) {
    return { ready: false, loggedDays: logged.length, weighIns: points.length, needDays: NEED_DAYS, needWeighIns: NEED_WEIGH_INS, unclear: true }
  }

  const weekly = line.slope * 7
  const current = line.at(today)
  let goalOn = null
  if (goalKg != null && current > goalKg && weekly < -0.05) {
    goalOn = addDays(today, Math.round(((current - goalKg) / -weekly) * 7))
  }

  return {
    ready: true,
    maintenance: roundTo(maintenance, 10),
    intake: Math.round(intake),
    weekly,
    loggedDays: logged.length,
    weighIns: points.length,
    suggested: Math.max(1200, roundTo(maintenance - DEFICIT, 50)),
    goalOn,
  }
}

// Monday of the week before the one `today` is in.
export function lastWeekStart(today) {
  const weekday = (fromKey(today).getDay() + 6) % 7 // Monday is 0
  return addDays(today, -weekday - 7)
}

// A Monday-to-Sunday summary of the week starting `start`.
export function weekReview({ meals, weights, sets, targets, start }) {
  const end = addDays(start, 6)
  const totals = new Map()
  for (const meal of meals) {
    if (meal.eaten_on < start || meal.eaten_on > end) continue
    const day = totals.get(meal.eaten_on) ?? { calories: 0, protein: 0 }
    day.calories += Number(meal.calories || 0)
    day.protein += Number(meal.protein || 0)
    totals.set(meal.eaten_on, day)
  }
  const days = [...totals.values()]

  const avgKg = (from, to) => {
    const kgs = weights.filter((w) => w.measured_on >= from && w.measured_on <= to).map((w) => Number(w.kg))
    return kgs.length ? mean(kgs) : null
  }
  const thisWeek = avgKg(start, end)
  const before = avgKg(addDays(start, -7), addDays(start, -1))

  return {
    start,
    end,
    loggedDays: days.length,
    avgCalories: days.length ? Math.round(mean(days.map((d) => d.calories))) : null,
    calorieTarget: targets.calorie_target,
    proteinDays: days.filter((d) => d.protein >= targets.protein_target).length,
    weightChange: thisWeek != null && before != null ? thisWeek - before : null,
    workouts: new Set(sets.filter((s) => s.reps != null && s.performed_on >= start && s.performed_on <= end).map((s) => s.performed_on)).size,
  }
}
