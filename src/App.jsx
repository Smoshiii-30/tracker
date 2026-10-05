import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { createStore } from './lib/store'
import { StoreContext } from './lib/data'
import { TabBar } from './components/ui'
import Auth from './pages/Auth'
import Today from './pages/Today'
import Weight from './pages/Weight'
import Workout from './pages/Workout'
import Profile from './pages/Profile'

const LAST_USER = 'hiwa:lastUser'
const LOCAL_USER = { id: 'local', email: null }

function readLastUser() {
  try {
    return JSON.parse(localStorage.getItem(LAST_USER))
  } catch {
    return null
  }
}

export default function App() {
  // undefined while the saved session loads, null when signed out.
  const [user, setUser] = useState(supabase ? undefined : LOCAL_USER)

  useEffect(() => {
    if (!supabase) return
    let alive = true

    const accept = (session) => {
      const next = { id: session.user.id, email: session.user.email }
      localStorage.setItem(LAST_USER, JSON.stringify(next))
      setUser((prev) => (prev && prev.id === next.id && prev.email === next.email ? prev : next))
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (data.session) accept(data.session)
      // Opened with no signal and an expired token: the refresh fails, but the
      // person is still signed in. Keep working on local data until it returns.
      else if (error && readLastUser()) setUser(readLastUser())
      else setUser(null)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) accept(session)
      else if (event === 'SIGNED_OUT') {
        localStorage.removeItem(LAST_USER)
        setUser(null)
      }
    })

    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (user === undefined) return <div className="splash" aria-busy="true" />
  if (user === null) return <Auth />
  return <Shell key={user.id} user={user} />
}

function Shell({ user }) {
  const [tab, setTab] = useState('today')

  const store = useMemo(
    () => createStore({ client: user.id === 'local' ? null : supabase, userId: user.id, storage: localStorage }),
    [user.id],
  )

  useEffect(() => {
    store.sync()
    const resync = () => {
      if (document.visibilityState === 'visible') store.sync()
    }
    window.addEventListener('online', resync)
    document.addEventListener('visibilitychange', resync)
    return () => {
      window.removeEventListener('online', resync)
      document.removeEventListener('visibilitychange', resync)
    }
  }, [store])

  return (
    <StoreContext.Provider value={store}>
      <main className="app">
        {tab === 'today' && <Today />}
        {tab === 'weight' && <Weight />}
        {tab === 'workout' && <Workout />}
        {tab === 'profile' && <Profile user={user} />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
    </StoreContext.Provider>
  )
}
