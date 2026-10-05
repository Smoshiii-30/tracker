import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    const credentials = { email: email.trim(), password }
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials)
    setBusy(false)

    if (error) {
      setMessage({ kind: 'error', text: error.message })
    } else if (mode === 'signup' && !data.session) {
      setMode('signin')
      setMessage({ kind: 'info', text: `Check ${credentials.email} for a confirmation link, then sign in here.` })
    }
    // A successful sign-in is picked up by the auth listener in App.
  }

  return (
    <main className="app auth">
      <h1 className="brand">Hiwa</h1>
      <p className="lede">Your cut, logged in one place: food, weight and lifts.</p>

      <form className="stack" onSubmit={submit}>
        <label className="label">
          Email
          <input
            className="field"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="label">
          Password
          <input
            className="field"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {message && (
          <p className={message.kind === 'error' ? 'notice error' : 'notice'} role="status">
            {message.text}
          </p>
        )}

        <button className="btn primary" type="submit" disabled={busy}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        className="btn link"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setMessage(null)
        }}
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </main>
  )
}
