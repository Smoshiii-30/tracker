import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from '../src/lib/dates.js'
import { estimateMaintenance, lastWeekStart, weekReview } from '../src/lib/insights.js'

const TODAY = '2026-10-07' // a Wednesday

// Three weeks of eating `kcal` a day while weight falls `perWeek` kg a week.
function history({ kcal = 2000, perWeek = -0.5, days = 21, weighEvery = 2, startKg = 80 } = {}) {
  const meals = []
  const weights = []
  for (let i = days; i >= 1; i--) {
    const date = addDays(TODAY, -i)
    meals.push({ eaten_on: date, calories: kcal, protein: 150 })
    if (i % weighEvery === 0) weights.push({ measured_on: date, kg: startKg + (perWeek / 7) * (days - i) })
  }
  return { meals, weights }
}

test('maintenance is intake plus what the weight loss says the deficit was', () => {
  const result = estimateMaintenance({ ...history({ kcal: 2000, perWeek: -0.5 }), today: TODAY })
  assert.equal(result.ready, true)
  // 0.5 kg a week = 550 kcal a day under maintenance.
  assert.equal(result.maintenance, 2550)
  assert.equal(result.suggested, 2000)
  assert.ok(Math.abs(result.weekly + 0.5) < 0.01)
})

test('gaining weight puts maintenance below intake', () => {
  const result = estimateMaintenance({ ...history({ kcal: 2500, perWeek: 0.3 }), today: TODAY })
  assert.equal(result.maintenance, 2170)
})

test('half-logged days are ignored, not counted as low intake', () => {
  const { meals, weights } = history({ kcal: 2000, perWeek: -0.5 })
  meals.push({ eaten_on: addDays(TODAY, -3), calories: -1500 }) // that day now totals 500
  const result = estimateMaintenance({ meals, weights, today: TODAY })
  assert.equal(result.loggedDays, 20)
  assert.equal(result.intake, 2000)
})

test('not enough data reports what is still needed', () => {
  const result = estimateMaintenance({ ...history({ days: 5 }), today: TODAY })
  assert.equal(result.ready, false)
  assert.equal(result.loggedDays, 5)
  assert.equal(result.needDays, 10)
})

test('goal date follows the current pace', () => {
  const result = estimateMaintenance({ ...history({ perWeek: -0.5, startKg: 80 }), today: TODAY, goalKg: 75 })
  // About 78.5 kg today, 3.5 kg to go at 0.5 kg a week: about 7 weeks.
  assert.equal(result.goalOn, addDays(TODAY, 49))
})

test('last week starts on the Monday before this one', () => {
  assert.equal(lastWeekStart('2026-10-07'), '2026-09-28') // Wednesday
  assert.equal(lastWeekStart('2026-10-05'), '2026-09-28') // Monday
  assert.equal(lastWeekStart('2026-10-11'), '2026-09-28') // Sunday
})

test('week review sums each day before averaging', () => {
  const start = '2026-09-28'
  const meals = [
    { eaten_on: start, calories: 1000, protein: 80 },
    { eaten_on: start, calories: 1000, protein: 80 },
    { eaten_on: '2026-09-29', calories: 2200, protein: 120 },
    { eaten_on: '2026-10-05', calories: 9999, protein: 999 }, // next week
  ]
  const weights = [
    { measured_on: '2026-09-22', kg: 80 },
    { measured_on: '2026-09-30', kg: 79.4 },
  ]
  const sets = [
    { performed_on: start, reps: 8 },
    { performed_on: start, reps: 8 },
    { performed_on: '2026-10-01', reps: null },
  ]
  const review = weekReview({ meals, weights, sets, targets: { calorie_target: 2100, protein_target: 150 }, start })
  assert.equal(review.loggedDays, 2)
  assert.equal(review.avgCalories, 2100)
  assert.equal(review.proteinDays, 1)
  assert.ok(Math.abs(review.weightChange + 0.6) < 1e-9)
  assert.equal(review.workouts, 1)
})
