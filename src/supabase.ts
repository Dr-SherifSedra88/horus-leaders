import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const hasSupabaseConfig = Boolean(url && key && !url.includes('YOUR_PROJECT'))

// Keep sessions in localStorage only when the user selects "Remember me".
// Otherwise, use sessionStorage so the login ends with the browser session.
const authStorage = {
  getItem: (key: string) => {
    const storage = localStorage.getItem('horus_remember_me') === 'false' ? sessionStorage : localStorage
    return storage.getItem(key)
  },
  setItem: (key: string, value: string) => {
    const storage = localStorage.getItem('horus_remember_me') === 'false' ? sessionStorage : localStorage
    storage.setItem(key, value)
  },
  removeItem: (key: string) => {
    const storage = localStorage.getItem('horus_remember_me') === 'false' ? sessionStorage : localStorage
    storage.removeItem(key)
  }
}

export const supabase = hasSupabaseConfig
  ? createClient(url!, key!, { auth: { storage: authStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null
