import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

// Without keys the app still runs, saving to this device only.
export const supabase = url && key ? createClient(url, key) : null
