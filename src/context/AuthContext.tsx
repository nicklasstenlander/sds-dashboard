import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, type UserProfile } from '../lib/supabase'
import { useApiConfig } from './ApiContext'
import { verifyCogworkPassword } from '../api/cogwork'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  preparingApi: boolean
  usingLegacyAuth: boolean
  isPasswordRecovery: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  setLegacyAuth: (active: boolean) => void
  clearPasswordRecovery: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)
const LEGACY_AUTH_KEY = 'sds_legacy_auth_active'
const COGWORK_CONFIG_KEY = 'sds_api_config'
const SHARED_COGWORK_PW = import.meta.env.VITE_COGWORK_SHARED_PW as string

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
  const [preparingApi, setPreparingApi] = useState(false)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const { config, setConfig } = useApiConfig()
  const apiPrepAttempted = useRef(false)

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      }
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

  // Sätter CogWork-uppkopplingen tyst i bakgrunden efter lyckad Supabase-inloggning,
  // så användaren aldrig behöver se det gamla API-nyckel-steget separat.
  useEffect(() => {
    if (usingLegacyAuth || !session || !profile) return
    if (config.pw || apiPrepAttempted.current) return

    apiPrepAttempted.current = true
    setPreparingApi(true)
    verifyCogworkPassword(SHARED_COGWORK_PW).then((result) => {
      if (result === 'ok') {
        setConfig({ org: 'sollentunadans', pw: SHARED_COGWORK_PW })
      } else {
        console.error(
          `CogWork auto-konfigurering misslyckades (${result}). ` +
          'Kontrollera att GitHub-secreten VITE_COGWORK_SHARED_PW är satt till rätt värde.',
        )
      }
      setPreparingApi(false)
    })
  }, [session, profile, usingLegacyAuth, config.pw, setConfig])

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
    setIsPasswordRecovery(false)
    apiPrepAttempted.current = false
  }

  function setLegacyAuth(active: boolean) {
    if (active) {
      localStorage.setItem(LEGACY_AUTH_KEY, 'true')
    } else {
      localStorage.removeItem(LEGACY_AUTH_KEY)
    }
    setUsingLegacyAuth(active)
  }

  function clearPasswordRecovery() {
    setIsPasswordRecovery(false)
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
      preparingApi,
      usingLegacyAuth,
      isPasswordRecovery,
      signIn,
      signOut,
      setLegacyAuth,
      clearPasswordRecovery,
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
