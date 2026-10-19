import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, type UserProfile } from '../lib/supabase'
import { useApiConfig } from './ApiContext'
import { VIA_PROXY } from '../lib/proxyAuth'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  preparingApi: boolean
  usingLegacyAuth: boolean
  recoveryInProgress: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  setLegacyAuth: (active: boolean) => void
  setRecoveryInProgress: (active: boolean) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)
const LEGACY_AUTH_KEY = 'sds_legacy_auth_active'

// Tillfällig CogWork-inloggning är avstängd. Den delade org-nyckeln låg tidigare
// i webbpaketet och i localStorage. Befintliga flaggor rensas vid sidladdning.
function detectLegacyAuth(): boolean {
  localStorage.removeItem(LEGACY_AUTH_KEY)
  return false
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [usingLegacyAuth, setUsingLegacyAuth] = useState<boolean>(detectLegacyAuth)
  const [preparingApi, setPreparingApi] = useState(false)
  const [recoveryInProgress, setRecoveryInProgress] = useState(false)
  const { config, setConfig } = useApiConfig()

  useEffect(() => {
    if (usingLegacyAuth) {
      setLoading(false)
      return
    }

    // Använder enbart onAuthStateChange (inte en separat getSession()-anrop) så att
    // vi bara har en enda källa till sessionsstate. Lösenordsåterställning sker via
    // verifyOtp med en 8-siffrig kod (ForgotPasswordPage) som sätter sessionen direkt
    // i samma anrop - inget separat auth-state-event från en klickad länk behöver
    // hanteras här, det räcker att reagera på session/profile som vanligt.
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

  // CogWork nås via den inloggade sessionen. Webbläsaren sparar ingen org-nyckel.
  useEffect(() => {
    if (!session || !profile) {
      setPreparingApi(false)
      return
    }
    if (config.pw === VIA_PROXY) {
      setPreparingApi(false)
      return
    }
    setPreparingApi(true)
    setConfig({ org: config.org || 'sollentunadans', pw: VIA_PROXY })
  }, [session, profile, config.org, config.pw, setConfig])

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
    setRecoveryInProgress(false)
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
      preparingApi,
      usingLegacyAuth,
      recoveryInProgress,
      signIn,
      signOut,
      setLegacyAuth,
      setRecoveryInProgress,
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
