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
  recoveryInProgress: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  setLegacyAuth: (active: boolean) => void
  setRecoveryInProgress: (active: boolean) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)
const LEGACY_AUTH_KEY = 'sds_legacy_auth_active'
const SHARED_COGWORK_PW = import.meta.env.VITE_COGWORK_SHARED_PW as string

// usingLegacyAuth får ENDAST bli true via setLegacyAuth(true), dvs. när användaren
// aktivt skickar in formuläret för tillfälligt lösenord i LoginPage. Det fanns
// tidigare en engångsmigrering här som slog på legacy-läge om "sds_api_config" hade
// ett sparat lösenord - men den nyckeln delas även av den automatiska
// CogWork-konfigureringen som körs efter en helt vanlig Supabase-inloggning (se
// useEffect nedan). Det gjorde att VARJE Supabase-användare permanent kapades över
// till legacy-läge så fort auto-konfigureringen lyckats en gång och sidan laddades
// om, oavsett om deras Supabase-session fortfarande var giltig.
function detectLegacyAuth(): boolean {
  return localStorage.getItem(LEGACY_AUTH_KEY) === 'true'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [usingLegacyAuth, setUsingLegacyAuth] = useState<boolean>(detectLegacyAuth)
  const [preparingApi, setPreparingApi] = useState(false)
  const [recoveryInProgress, setRecoveryInProgress] = useState(false)
  const { config, setConfig } = useApiConfig()
  const apiPrepAttempted = useRef(false)

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
    setRecoveryInProgress(false)
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
