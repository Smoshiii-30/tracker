# Hiwa Cut Tracker

A phone-first PWA for running a cut: log calories and protein, track morning weigh-ins against a 7-day average, and log the upper/lower lifting program. Works offline and syncs through Supabase when there is a connection.

Built with React, Vite and plain CSS. No UI library.

## Run it

```bash
npm install
npm run dev
```

With no Supabase keys the app runs in local mode: everything saves to the browser on that device, with no login. That is enough to try every screen except photo scanning.

## Turn on login and sync

1. Create a project at [supabase.com](https://supabase.com) (Singapore is the closest region to the Philippines).
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](supabase/schema.sql) and run it. It creates four tables and locks each row to its owner.
3. Open **Project Settings → API** and copy the project URL and the publishable (anon) key.
4. Copy `.env.example` to `.env.local` and paste both values in.
5. Restart `npm run dev`, create an account in the app, and confirm the email Supabase sends you.

For a personal app you can skip the confirmation email: **Authentication → Sign In / Providers → Email → turn off "Confirm email"**.

## Turn on photo scanning

The photo goes to a Supabase Edge Function, which calls Gemini with a key that never reaches the browser.

1. Create a free API key at [aistudio.google.com](https://aistudio.google.com) ("Get API key").
2. From this folder:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set GEMINI_API_KEY=your-key
npx supabase functions deploy analyze-food
```

The project ref is the random part of your project URL. The function tries `gemini-3.8-flash`, then `gemini-3.6-flash`, then `gemini-3.5-flash-lite` when a model is busy or at its free limit. Set a `GEMINI_MODEL` secret to put a different model first.

Photo estimates are a starting point. The model names foods well but guesses portions and cannot see cooking oil, so the app always shows the result for you to correct before saving.

## Deploy to Vercel

Import the repo in Vercel, then add `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` under **Settings → Environment Variables** and redeploy. Open the site on your phone and choose **Add to Home Screen** from the browser menu.

In Supabase, add your Vercel URL under **Authentication → URL Configuration → Site URL** so confirmation emails link back to the right place.

## Where things live

| Path | What it is |
| --- | --- |
| `src/pages/` | Today, Weight, Workout and Profile, plus sign-in |
| `src/lib/store.js` | Local-first data store and sync queue |
| `src/lib/program.js` | The workout program: edit exercises, sets and rep ranges here |
| `src/lib/foods.js` | The one-tap staples and their nutrition values |
| `src/styles.css` | All styling, with the grayscale tokens for light and dark at the top |
| `supabase/schema.sql` | Database tables and row-level security |
| `supabase/functions/analyze-food/` | The photo analysis function |
| `tests/store.test.js` | Tests for offline saving and sync (`npm test`) |

## How sync works

Every change is written to the device first and added to a queue. The queue is sent to Supabase whenever the app opens, comes back to the foreground, or regains a connection. After the queue is empty the app reads the last 120 days back from the server, which is how changes from another device arrive. If the same row is edited on two devices, the last one to sync wins.

Daily targets default to 2,150 kcal and 150 g protein. Change them on the Profile tab, along with your name and goal weight.

If you set up Supabase before the Profile tab existed, run [`supabase/schema.sql`](supabase/schema.sql) again. It adds the `display_name`, `goal_kg` and `avatar` columns without touching your data.
