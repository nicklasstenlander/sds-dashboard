import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, type UserProfile } from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  usingLegacyAuth: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  setLegacyAuth: (active: boolean) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)
const LEGACY_AUTH_KEY = 'sds_legacy_auth_active'
const COGWORK_CONFIG_KEY = 'sds_api_config'

function detectLegacyAuth(): boolean {
  if (localStorage.getItem(LEGACY_AUTH_KEY) === 'true') return true
  // Migrera befintliga användare som redan har ett CogWork-lösenord sparat
  try {
    const raw = localStorage.getItem(COGWORK_CONFIG_KEY)
    if (raw) {
      const c = JSON.parse(raw) as { pw?: string }
      if (c.pw) {
        localStorage.setItem(LEGACY_AUTH_KEY, 'true')
        return true
      }
    }
  } catch {}
  return false
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [usingLegacyAuth, setUsingLegacyAuth] = useState<boolean>(detectLegacyAuth)

  useEffect(() => {
    if (usingLegacyAuth) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [usingLegacyAuth])

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    localStorage.removeItem(LEGACY_AUTH_KEY)
    setUsingLegacyAuth(false)
    setSession(null)
    setProfile(null)
  }

  function setLegacyAuth(active: boolean) {
    if (active) {
      localStorage.setItem(LEGACY_AUTH_KEY, 'true')
    } else {
      localStorage.removeItem(LEGACY_AUTH_KEY)
    }
    setUsingLegacyAuth(active)
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
      usingLegacyAuth,
      signIn,
      signOut,
      setLegacyAuth,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth måste användas inom AuthProvider')
  return ctx
}
