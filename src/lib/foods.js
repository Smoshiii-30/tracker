// Everyday foods for one-tap logging. Values are typical estimates per `per`
// units, cooked where it applies. Check canned and packaged foods against
// their label and adjust here.

export const STAPLES = [
  { name: 'Egg', per: 1, unit: 'egg', plural: 'eggs', amount: 1, calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8 },
  { name: 'Chicken breast, cooked', per: 100, unit: 'g', amount: 120, calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { name: 'Tuna in water, drained', per: 1, unit: 'can', plural: 'cans', amount: 1, calories: 120, protein: 24, carbs: 0, fat: 2 },
  { name: 'White rice, cooked', per: 100, unit: 'g', amount: 160, calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { name: 'Banana', per: 1, unit: 'banana', plural: 'bananas', amount: 1, calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  { name: 'White bread', per: 1, unit: 'slice', plural: 'slices', amount: 2, calories: 75, protein: 2.5, carbs: 14, fat: 1 },
  { name: 'Cooking oil', per: 1, unit: 'tsp', plural: 'tsp', amount: 1, calories: 40, protein: 0, carbs: 0, fat: 4.5 },
]

export function portion(food, amount) {
  const k = amount / food.per
  const label = food.unit === 'g' ? `${amount} g` : `${amount} ${amount === 1 ? food.unit : food.plural}`
  return {
    name: `${food.name} (${label})`,
    calories: Math.round(food.calories * k),
    protein: Math.round(food.protein * k * 10) / 10,
    carbs: Math.round(food.carbs * k * 10) / 10,
    fat: Math.round(food.fat * k * 10) / 10,
  }
}
