import { useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, newId, round1, useData, useTargets } from '../lib/data'
import { toKey } from '../lib/dates'
import { STAPLES, portion } from '../lib/foods'
import { toJpeg } from '../lib/image'
import { DayNav, Meter, NumField, Sheet } from '../components/ui'

const byLogged = (a, b) => Date.parse(a.created_at || 0) - Date.parse(b.created_at || 0)

export default function Today() {
  const { state, store } = useData()
  const targets = useTargets()
  const [day, setDay] = useState(toKey())
  const [sheet, setSheet] = useState(null)
  const fileInput = useRef(null)
  const cameraInput = useRef(null)

  const meals = useMemo(() => state.meals.filter((m) => m.eaten_on === day).sort(byLogged), [state.meals, day])

  const totals = useMemo(
    () =>
      meals.reduce(
        (sum, m) => ({
          calories: sum.calories + Number(m.calories || 0),
          protein: sum.protein + Number(m.protein || 0),
          carbs: sum.carbs + Number(m.carbs || 0),
          fat: sum.fat + Number(m.fat || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [meals],
  )

  // The last few distinct foods, newest first, for logging a repeat in one tap.
  const recent = useMemo(() => {
    const seen = new Set()
    const list = []
    for (const meal of [...state.meals].sort(byLogged).reverse()) {
      if (seen.has(meal.name)) continue
      seen.add(meal.name)
      list.push(meal)
      if (list.length === 6) break
    }
    return list
  }, [state.meals])

  function addMeal(food, source) {
    store.upsert('meals', {
      id: newId(),
      eaten_on: day,
      name: food.name.trim().slice(0, 120),
      calories: Math.round(food.calories),
      protein: round1(food.protein || 0),
      carbs: food.carbs == null ? null : round1(food.carbs),
      fat: food.fat == null ? null : round1(food.fat),
      source,
      created_at: new Date().toISOString(),
    })
  }

  async function analyze(file) {
    if (!file) return
    setSheet({ kind: 'photo', status: 'working' })
    try {
      const { base64, preview } = await toJpeg(file)
      const { data, error } = await supabase.functions.invoke('analyze-food', {
        body: { image: base64, mime: 'image/jpeg' },
      })
      if (error) throw error
      const items = (data.ingredients || []).map((item) => ({ ...item, id: newId(), on: true }))
      setSheet({ kind: 'photo', status: 'review', preview, dish: data.dish || '', items, note: data.note })
    } catch (error) {
      setSheet({ kind: 'photo', status: 'error', message: await explain(error) })
    }
  }

  function pickPhoto(input) {
    if (supabase) input.current.click()
    else setSheet({ kind: 'photo', status: 'unavailable' })
  }

  function onPhoto(event) {
    analyze(event.target.files[0])
    event.target.value = ''
  }

  const left = targets.calorie_target - totals.calories

  return (
    <>
      <DayNav day={day} onChange={setDay} />

      <section className="hero" aria-label="Calories">
        <p className={left < 0 ? 'hero-num over-text' : 'hero-num'}>{fmt(Math.abs(left))}</p>
        <p className="hero-label">
          {left >= 0
            ? `kcal left of ${fmt(targets.calorie_target)}`
            : `kcal over your ${fmt(targets.calorie_target)} target`}
        </p>
      </section>

      <section className="meters">
        <Meter label="Calories" value={totals.calories} target={targets.calorie_target} unit="kcal" tone="cal" step={500} />
        <Meter label="Protein" value={round1(totals.protein)} target={targets.protein_target} unit="g" tone="pro" step={50} />
        {(totals.carbs > 0 || totals.fat > 0) && (
          <p className="muted small">
            Carbs {fmt(totals.carbs)} g, fat {fmt(totals.fat)} g
          </p>
        )}
      </section>

      <div className="actions">
        <button type="button" className="btn primary wide" onClick={() => setSheet({ kind: 'manual' })}>
          Add food
        </button>
        <button type="button" className="btn" onClick={() => pickPhoto(cameraInput)}>
          Take photo
        </button>
        <button type="button" className="btn" onClick={() => pickPhoto(fileInput)}>
          Upload photo
        </button>
        {/* capture opens the camera directly; without it the phone offers its gallery and files. */}
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={onPhoto} />
      </div>

      <section>
        <h2>Staples</h2>
        <div className="chips">
          {STAPLES.map((food) => (
            <button key={food.name} type="button" className="chip" onClick={() => setSheet({ kind: 'staple', food })}>
              {food.name}
            </button>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <h2>Log again</h2>
          <div className="chips">
            {recent.map((meal) => (
              <button key={meal.id} type="button" className="chip" onClick={() => addMeal(meal, 'recent')}>
                {meal.name} <span className="chip-num">{fmt(meal.calories)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>Eaten</h2>
        {meals.length === 0 ? (
          <p className="empty">Nothing logged for this day. Add a food or tap a staple to start.</p>
        ) : (
          <ul className="list">
            <li className="list-head" aria-hidden="true">
              <span />
              <span>kcal</span>
              <span>protein</span>
            </li>
            {meals.map((meal) => (
              <li key={meal.id}>
                <button type="button" className="row" onClick={() => setSheet({ kind: 'edit', meal })}>
                  <span className="row-name">{meal.name}</span>
                  <span className="row-num">{fmt(meal.calories)}</span>
                  <span className="row-num">{round1(Number(meal.protein || 0))} g</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sheet?.kind === 'manual' && (
        <FoodForm
          title="Add food"
          onClose={() => setSheet(null)}
          onSave={(food) => {
            addMeal(food, 'manual')
            setSheet(null)
          }}
        />
      )}

      {sheet?.kind === 'edit' && (
        <FoodForm
          title="Edit food"
          meal={sheet.meal}
          onClose={() => setSheet(null)}
          onSave={(food) => {
            store.upsert('meals', {
              ...sheet.meal,
              name: food.name.trim().slice(0, 120),
              calories: Math.round(food.calories),
              protein: round1(food.protein || 0),
              carbs: food.carbs == null ? null : round1(food.carbs),
              fat: food.fat == null ? null : round1(food.fat),
            })
            setSheet(null)
          }}
          onDelete={() => {
            store.remove('meals', sheet.meal.id)
            setSheet(null)
          }}
        />
      )}

      {sheet?.kind === 'staple' && (
        <StapleForm
          food={sheet.food}
          onClose={() => setSheet(null)}
          onSave={(food) => {
            addMeal(food, 'staple')
            setSheet(null)
          }}
        />
      )}

      {sheet?.kind === 'photo' && (
        <PhotoSheet
          sheet={sheet}
          onChange={setSheet}
          onRetry={() => fileInput.current.click()}
          onClose={() => setSheet(null)}
          onSave={(foods) => {
            foods.forEach((food) => addMeal(food, 'photo'))
            setSheet(null)
          }}
        />
      )}
    </>
  )
}

async function explain(error) {
  const response = error?.context
  if (response && typeof response.json === 'function') {
    if (response.status === 404) {
      return 'Photo analysis is not deployed yet. Deploy the analyze-food function (see the README), then try again.'
    }
    try {
      const body = await response.json()
      if (body?.error) return body.error
    } catch {
      // Fall through to the generic message.
    }
  }
  if (error?.name === 'FunctionsFetchError') {
    return 'Could not reach the photo service. Check your connection and try again.'
  }
  return 'The photo could not be analyzed. Try again, or add the food by hand.'
}

function FoodForm({ title, meal, onClose, onSave, onDelete }) {
  const [name, setName] = useState(meal?.name ?? '')
  const [calories, setCalories] = useState(meal?.calories ?? null)
  const [protein, setProtein] = useState(meal?.protein ?? null)
  const [carbs, setCarbs] = useState(meal?.carbs ?? null)
  const [fat, setFat] = useState(meal?.fat ?? null)
  const ready = name.trim() !== '' && calories != null

  return (
    <Sheet title={title} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          if (ready) onSave({ name, calories, protein, carbs, fat })
        }}
      >
        <label className="label">
          Food
          <input
            className="field"
            type="text"
            maxLength={120}
            placeholder="Chicken adobo with rice"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="grid-2">
          <label className="label">
            Calories
            <NumField decimals={false} value={calories} onCommit={setCalories} />
          </label>
          <label className="label">
            Protein, g
            <NumField value={protein} onCommit={setProtein} />
          </label>
          <label className="label">
            <span>
              Carbs, g <span className="muted">optional</span>
            </span>
            <NumField value={carbs} onCommit={setCarbs} />
          </label>
          <label className="label">
            <span>
              Fat, g <span className="muted">optional</span>
            </span>
            <NumField value={fat} onCommit={setFat} />
          </label>
        </div>
        <button className="btn primary" type="submit" disabled={!ready}>
          {meal ? 'Save changes' : 'Add food'}
        </button>
        {onDelete && (
          <button className="btn danger" type="button" onClick={onDelete}>
            Delete this food
          </button>
        )}
      </form>
    </Sheet>
  )
}

function StapleForm({ food, onClose, onSave }) {
  const [amount, setAmount] = useState(food.amount)
  const result = amount ? portion(food, amount) : null

  return (
    <Sheet title={food.name} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          if (result) onSave(result)
        }}
      >
        <label className="label">
          {food.unit === 'g' ? 'Weight, g' : `How many ${food.plural}`}
          <NumField value={amount} onCommit={setAmount} decimals={food.unit !== 'g'} />
        </label>
        <p className="readout" aria-live="polite">
          {result ? (
            <>
              <b>{fmt(result.calories)}</b> kcal, <b>{result.protein}</b> g protein
            </>
          ) : (
            'Enter an amount'
          )}
        </p>
        <button className="btn primary" type="submit" disabled={!result}>
          Add food
        </button>
      </form>
    </Sheet>
  )
}

// An ingredient uses the weight the user typed, or the photo's estimate until
// they do. Estimated weights are saved with a "~" so they stay recognisable.
function scaled(item, dish = '') {
  const weighed = item.weight_grams != null
  const grams = weighed ? item.weight_grams : item.estimated_grams
  const k = grams / 100
  const prefix = dish.trim() ? `${dish.trim()}: ` : ''
  return {
    name: `${prefix}${item.name.trim()} (${weighed ? '' : '~'}${grams} g)`,
    calories: item.per_100g.calories * k,
    protein: item.per_100g.protein * k,
    carbs: item.per_100g.carbs * k,
    fat: item.per_100g.fat * k,
    weighed,
  }
}

function PhotoSheet({ sheet, onChange, onRetry, onClose, onSave }) {
  if (sheet.status === 'unavailable') {
    return (
      <Sheet title="Scan a photo" onClose={onClose}>
        <p>Photo analysis runs through your Supabase project. Add your Supabase keys and deploy the analyze-food function to turn it on. The README has the steps.</p>
      </Sheet>
    )
  }

  if (sheet.status === 'working') {
    return (
      <Sheet title="Reading your photo" onClose={onClose}>
        <p className="muted" role="status">
          Estimating what is on the plate. This takes a few seconds.
        </p>
        <div className="working" aria-hidden="true" />
      </Sheet>
    )
  }

  if (sheet.status === 'error') {
    return (
      <Sheet title="Scan a photo" onClose={onClose}>
        <p className="notice error" role="alert">
          {sheet.message}
        </p>
        <button type="button" className="btn primary" onClick={onRetry}>
          Take another photo
        </button>
      </Sheet>
    )
  }

  const update = (id, patch) =>
    onChange({ ...sheet, items: sheet.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
  const chosen = sheet.items.filter((item) => item.on && item.name.trim())
  const total = chosen.reduce((sum, item) => sum + scaled(item).calories, 0)
  const guessed = chosen.filter((item) => item.weight_grams == null).length

  return (
    <Sheet title="Weigh the ingredients" onClose={onClose}>
      <div className="stack">
        <div className="photo-head">
          <img src={sheet.preview} alt="Your meal" />
          <p className="muted small">
            Each ingredient is listed on its own. Type the grams you weighed; a blank field uses the photo&apos;s guess,
            shown in grey. {sheet.note}
          </p>
        </div>

        {sheet.items.length > 0 && (
          <label className="label">
            <span>
              Dish <span className="muted">optional, added before each ingredient</span>
            </span>
            <input
              className="field"
              type="text"
              maxLength={60}
              placeholder="Sinigang na baboy"
              value={sheet.dish}
              onChange={(e) => onChange({ ...sheet, dish: e.target.value })}
            />
          </label>
        )}

        {sheet.items.length === 0 ? (
          <p className="empty">No food was recognised in this photo.</p>
        ) : (
          <ul className="photo-items">
            {sheet.items.map((item) => {
              const now = scaled(item)
              return (
                <li key={item.id} className={item.on ? '' : 'off'}>
                  <input
                    type="checkbox"
                    checked={item.on}
                    aria-label={`Include ${item.name}`}
                    onChange={(e) => update(item.id, { on: e.target.checked })}
                  />
                  <div className="photo-fields">
                    <input
                      className="field"
                      type="text"
                      aria-label="Ingredient name"
                      maxLength={80}
                      value={item.name}
                      onChange={(e) => update(item.id, { name: e.target.value })}
                    />
                    <div className="photo-line">
                      <NumField
                        decimals={false}
                        aria-label={`${item.name} weight in grams`}
                        placeholder={`~${item.estimated_grams}`}
                        value={item.weight_grams}
                        onCommit={(weight_grams) => update(item.id, { weight_grams })}
                      />
                      <span className="unit">g</span>
                      <span className={now.weighed ? 'photo-macros' : 'photo-macros guess'}>
                        <b>{fmt(now.calories)}</b> kcal, <b>{round1(now.protein)}</b> g protein
                      </span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {chosen.length > 0 && (
          <p className="readout" aria-live="polite">
            <b>{fmt(total)}</b> kcal in total
            {guessed > 0 && <span className="muted">, {guessed === 1 ? '1 weight' : `${guessed} weights`} still estimated</span>}
          </p>
        )}

        <button
          type="button"
          className="btn primary"
          disabled={chosen.length === 0}
          onClick={() => onSave(chosen.map((item) => scaled(item, sheet.dish)))}
        >
          {chosen.length === 1 ? 'Add 1 ingredient' : `Add ${chosen.length} ingredients`}
        </button>
        <button type="button" className="btn" onClick={onRetry}>
          Take another photo
        </button>
      </div>
    </Sheet>
  )
}
