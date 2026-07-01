import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase-miljövariabler saknas')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})

// TODO: Ta bort efter PKCE-felsökning
// @supabase/auth-js tar bort "<storageKey>-code-verifier" ur localStorage så fort den
// försökt växla in koden - oavsett om utväxlingen lyckas eller misslyckas - och rensar
// bort ?code= ur URL:en vid lyckad utväxling. Läses därför in synkront direkt här, i
// samma JS-turordning som createClient() kör sin (asynkrona) auto-initiering, så att
// diagnostiken i felskärmen visar läget SOM DET VAR när länken landade, inte efter att
// Supabase redan hunnit städa upp.
export interface PkceDiagnosticsSnapshot {
  urlHasCode: boolean
  urlHasToken: boolean
  localStorageKeysAtLoad: string[]
  codeVerifierWasPresent: boolean
}

export const pkceDiagnosticsAtLoad: PkceDiagnosticsSnapshot = {
  urlHasCode: new URLSearchParams(window.location.search).has('code'),
  urlHasToken: new URLSearchParams(window.location.search).has('token'),
  localStorageKeysAtLoad: Object.keys(localStorage).filter((k) => k.includes('supabase') || k.includes('sb-')),
  codeVerifierWasPresent: Object.keys(localStorage).some(
    (k) => k.includes('code-verifier') || k.includes('code_verifier'),
  ),
}

export type UserRole = 'admin' | 'teacher' | 'receptionist'

export interface UserProfile {
  id: string
  full_name: string
  role: UserRole
  cogwork_instructor_name: string | null
  telavox_agent: string | null
  created_at: string
}
