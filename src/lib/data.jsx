import { createContext, useContext, useSyncExternalStore } from 'react'

export const StoreContext = createContext(null)

export const DEFAULT_TARGETS = { calorie_target: 2150, protein_target: 150 }

export function useData() {
  const store = useContext(StoreContext)
  const state = useSyncExternalStore(store.subscribe, store.getState)
  return { state, store }
}

export function useSyncing() {
  const store = useContext(StoreContext)
  return useSyncExternalStore(store.subscribe, store.isSyncing)
}

export function useTargets() {
  const { state } = useData()
  return { ...DEFAULT_TARGETS, ...state.profiles[0] }
}

export const newId = () => crypto.randomUUID()
export const round1 = (n) => Math.round(n * 10) / 10
export const fmt = (n) => Math.round(n).toLocaleString('en-US')
