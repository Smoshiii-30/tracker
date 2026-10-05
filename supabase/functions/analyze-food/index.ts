// Estimates the food in a photo with Gemini. The API key stays on the server
// as the GEMINI_API_KEY secret and never reaches the browser.
//
// Deploy:  npx supabase functions deploy analyze-food
// Secret:  npx supabase secrets set GEMINI_API_KEY=your-key

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
const MAX_BASE64 = 6_000_000 // about 4.5 MB of image; the app sends far less
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PROMPT = `Estimate the nutrition of the food in this photo.
List each distinct food you can see as its own item. For each item give:
- a short plain name (for example "Steamed white rice", "Fried egg")
- its estimated weight in grams as served
- estimated calories (kcal), protein, carbs and fat in grams for that weight
Assume ordinary home cooking, and include cooking oil in the item it was cooked with.
The photo was taken in the Philippines, so prefer local dishes when a dish is ambiguous.
In "note", say in one short sentence what you were least sure about.
If the photo shows no food, return an empty items list and explain in "note".`

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          calories: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fat: { type: 'number' },
        },
        required: ['name', 'grams', 'calories', 'protein', 'carbs', 'fat'],
      },
    },
    note: { type: 'string' },
  },
  required: ['items', 'note'],
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

  const gemini = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { type: 'text', text: PROMPT },
        { type: 'image', data: image, mime_type: mime },
      ],
      response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
    }),
  })

  if (gemini.status === 429) {
    return json({ error: 'The free Gemini limit was reached. Wait a minute and try again.' }, 429)
  }
  if (!gemini.ok) {
    console.error('Gemini error', gemini.status, await gemini.text())
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

  const items = (Array.isArray(parsed.items) ? parsed.items : []).slice(0, 12).map((item: Record<string, unknown>) => ({
    name: String(item.name ?? 'Food').slice(0, 100),
    grams: Math.round(amount(item.grams, 5000)),
    calories: Math.round(amount(item.calories, 5000)),
    protein: Math.round(amount(item.protein, 500) * 10) / 10,
    carbs: Math.round(amount(item.carbs, 1000) * 10) / 10,
    fat: Math.round(amount(item.fat, 500) * 10) / 10,
  }))

  return json({ items, note: String(parsed.note ?? '').slice(0, 300) })
})
