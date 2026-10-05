// The upper/lower split. Edit this file to change exercises, sets or rep ranges.
// Logged sets are matched by exercise name, so renaming an exercise starts its
// history fresh.

export const PROGRAM = [
  {
    key: 'upper-a',
    name: 'Upper A',
    exercises: [
      { name: 'Bench press', sets: 3, reps: [6, 8] },
      { name: 'Barbell row', sets: 3, reps: [8, 10] },
      { name: 'Dumbbell shoulder press', sets: 3, reps: [8, 10] },
      { name: 'Lat pulldown', sets: 3, reps: [10, 12] },
      { name: 'Lateral raise', sets: 3, reps: [12, 15] },
      { name: 'Triceps pushdown', sets: 2, reps: [10, 15] },
      { name: 'Dumbbell curl', sets: 2, reps: [10, 15] },
    ],
  },
  {
    key: 'lower-a',
    name: 'Lower A',
    exercises: [
      { name: 'Squat', sets: 3, reps: [6, 8] },
      { name: 'Romanian deadlift', sets: 3, reps: [8, 10] },
      { name: 'Leg press', sets: 3, reps: [10, 12] },
      { name: 'Leg curl', sets: 3, reps: [10, 12] },
      { name: 'Calf raise', sets: 3, reps: [12, 15] },
    ],
  },
  {
    key: 'upper-b',
    name: 'Upper B',
    exercises: [
      { name: 'Incline dumbbell press', sets: 3, reps: [8, 10] },
      { name: 'Pull-up', sets: 3, reps: [8, 10], bodyweight: true },
      { name: 'Seated cable row', sets: 3, reps: [10, 12] },
      { name: 'Chest fly', sets: 2, reps: [12, 15] },
      { name: 'Face pull', sets: 3, reps: [12, 15] },
      { name: 'Lateral raise', sets: 3, reps: [12, 15] },
      { name: 'Dumbbell curl', sets: 2, reps: [10, 15] },
      { name: 'Overhead triceps extension', sets: 2, reps: [10, 15] },
    ],
  },
  {
    key: 'lower-b',
    name: 'Lower B',
    exercises: [
      { name: 'Deadlift', sets: 3, reps: [5, 8] },
      { name: 'Bulgarian split squat', sets: 3, reps: [8, 10], note: 'Reps per leg' },
      { name: 'Leg extension', sets: 3, reps: [12, 15] },
      { name: 'Leg curl', sets: 3, reps: [12, 15] },
      { name: 'Hanging leg raise', sets: 3, reps: [10, 15], bodyweight: true },
    ],
  },
  {
    key: 'day-5',
    name: 'Day 5',
    optional: true,
    finisher: 'Finish with 20 to 30 minutes of incline walking.',
    exercises: [
      { name: 'Dumbbell curl', sets: 3, reps: [10, 15] },
      { name: 'Triceps pushdown', sets: 3, reps: [10, 15] },
      { name: 'Lateral raise', sets: 3, reps: [12, 15] },
      { name: 'Rear delt fly', sets: 3, reps: [12, 15] },
      { name: 'Hanging leg raise', sets: 3, reps: [10, 15], bodyweight: true },
    ],
  },
]

// The four main days rotate. Day 5 is extra and never suggested automatically.
const ROTATION = PROGRAM.filter((day) => !day.optional).map((day) => day.key)

export function nextDayKey(lastKey) {
  const index = ROTATION.indexOf(lastKey)
  return ROTATION[(index + 1) % ROTATION.length]
}
