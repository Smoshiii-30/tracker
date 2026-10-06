// Estimates the food in a photo with Gemini. The API key stays on the server
// as the GEMINI_API_KEY secret and never reaches the browser.
//
// Deploy:  npx supabase functions deploy analyze-food
// Secret:  npx supabase secrets set GEMINI_API_KEY=your-key

// Free-tier models, tried in order. Each has its own rate limit, so when one is
// busy the next usually still has room. GEMINI_MODEL, if set, is tried first.
const MODELS = [
  ...new Set([Deno.env.get('GEMINI_MODEL'), 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'].filter(Boolean)),
] as string[]
// Busy or rate limited (429, 500, 503), or the model is not offered (404): try
// the next one. Anything else, such as a rejected photo, would fail on every model.
const BUSY = [429, 500, 503]
const TRY_NEXT = [404, ...BUSY]
const MAX_BASE64 = 6_000_000 // about 4.5 MB of image; the app sends far less
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PROMPT = `Break the food in this photo into the separate ingredients a home cook would weigh one by one.
Do not log a mixed dish as a single item. For sinigang, list the pork, kangkong, radish, sitaw, taro,
tomato and broth separately; for adobo, the chicken or pork and the sauce; rice is always its own item.
For each ingredient give:
- a short plain name with its cooking method (for example "Pork belly, boiled", "Kangkong, boiled")
- its estimated weight in grams as served, cooked
- calories (kcal), protein, carbs and fat in grams per 100 g of that ingredient as served
When the food is fried or sauteed, list the cooking oil as its own ingredient.
Skip seasonings with almost no calories, such as salt, pepper, garlic or a souring mix.
In "dish", name the dish in a few words (for example "Sinigang na baboy"), or leave it empty for a plate of separate foods.
The photo was taken in the Philippines, so prefer local dishes and ingredients when something is ambiguous.
In "note", say in one short sentence what you were least sure about.
If the photo shows no food, return an empty ingredients list and explain in "note".`

const SCHEMA = {
  type: 'object',
  properties: {
    dish: { type: 'string' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          estimated_grams: { type: 'number' },
          calories_per_100g: { type: 'number' },
          protein_per_100g: { type: 'number' },
          carbs_per_100g: { type: 'number' },
          fat_per_100g: { type: 'number' },
        },
        required: ['name', 'estimated_grams', 'calories_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g'],
      },
    },
    note: { type: 'string' },
  },
  required: ['dish', 'ingredients', 'note'],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const amount = (value: unknown, max: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Send a POST request.' }, 405)

  // Only signed-in users may spend the Gemini quota.
  const who = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: {
      Authorization: req.headers.get('Authorization') ?? '',
      apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    },
  })
  if (!who.ok) return json({ error: 'Sign in again to scan photos.' }, 401)

  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) return json({ error: 'The GEMINI_API_KEY secret is not set on this Supabase project.' }, 500)

  let image: unknown, mime: unknown
  try {
    ;({ image, mime } = await req.json())
  } catch {
    return json({ error: 'The request was not valid JSON.' }, 400)
  }
  if (typeof image !== 'string' || !image || image.length > MAX_BASE64) {
    return json({ error: 'Send one photo under 4 MB.' }, 400)
  }
  if (typeof mime !== 'string' || !MIME_TYPES.includes(mime)) {
    return json({ error: 'The photo must be a JPEG, PNG or WebP.' }, 400)
  }

  const body = (model: string) =>
    JSON.stringify({
      model,
      input: [
        { type: 'text', text: PROMPT },
        { type: 'image', data: image, mime_type: mime },
      ],
      response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
    })

  let gemini: Response | undefined
  let allBusy = true
  for (const model of MODELS) {
    gemini = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: body(model),
    })
    if (gemini.ok) break
    console.error('Gemini error', model, gemini.status, await gemini.text())
    if (!BUSY.includes(gemini.status)) allBusy = false
    if (!TRY_NEXT.includes(gemini.status)) break
  }

  if (!gemini?.ok) {
    if (allBusy) return json({ error: 'Gemini is busy or at its free limit. Wait a minute and try again.' }, 429)
    return json({ error: 'Gemini could not read this photo. Try again, or add the food by hand.' }, 502)
  }

  // The reply is a list of steps; the answer is the text of the model's output.
  const interaction = await gemini.json()
  const text = (interaction.steps ?? [])
    .filter((step: { type: string }) => step.type === 'model_output')
    .flatMap((step: { content?: { type: string; text?: string }[] }) => step.content ?? [])
    .filter((part: { type: string }) => part.type === 'text')
    .map((part: { text?: string }) => part.text ?? '')
    .join('')

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    console.error('Unreadable Gemini reply', text.slice(0, 500))
    return json({ error: 'Gemini sent back something unreadable. Try the photo again.' }, 502)
  }

  // Nutrition comes back per 100 g so the app can rescale it exactly to
  // whatever the user weighs. weight_grams stays empty until they enter it.
  const per100 = (value: unknown, max: number) => Math.round(amount(value, max) * 10) / 10
  const ingredients = (Array.isArray(parsed.ingredients) ? parsed.ingredients : [])
    .slice(0, 20)
    .map((item: Record<string, unknown>) => ({
      name: String(item.name ?? 'Ingredient').slice(0, 80),
      estimated_grams: Math.round(amount(item.estimated_grams, 5000)),
      weight_grams: null,
      per_100g: {
        calories: Math.round(amount(item.calories_per_100g, 900)),
        protein: per100(item.protein_per_100g, 100),
        carbs: per100(item.carbs_per_100g, 100),
        fat: per100(item.fat_per_100g, 100),
      },
    }))

  return json({
    dish: String(parsed.dish ?? '').slice(0, 60),
    ingredients,
    note: String(parsed.note ?? '').slice(0, 300),
  })
})
