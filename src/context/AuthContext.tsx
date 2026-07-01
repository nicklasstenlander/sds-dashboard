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
  recoveryLinkError: string | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  setLegacyAuth: (active: boolean) => void
  clearPasswordRecovery: () => void
  clearRecoveryLinkError: () => void
}

function hasRecoveryParams(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('code') || params.get('type') === 'recovery' || params.get('type') === 'invite'
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
  const [recoveryLinkError, setRecoveryLinkError] = useState<string | null>(null)
  const { config, setConfig } = useApiConfig()
  const apiPrepAttempted = useRef(false)
  const recoveryAttemptRef = useRef(false)

  useEffect(() => {
    if (usingLegacyAuth) {
      setLoading(false)
      return
    }

    recoveryAttemptRef.current = hasRecoveryParams()

    // Använder enbart onAuthStateChange (inte en separat getSession()-anrop) så att
    // vi bara har en enda källa till sessionsstate. Supabase väntar internt in sin
    // URL-baserade sessionsdetektering (recovery-/invite-länkar) innan den emittar
    // det första INITIAL_SESSION-eventet, så vi riskerar inte att läsa ett tomt
    // session-state innan länken hunnit bearbetas.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      }
      // INITIAL_SESSION är det första eventet som emitteras, och Supabase har då redan
      // försökt växla in en eventuell ?code=-parameter i URL:en. Om länken innehöll ett
      // återställnings-/inbjudningsförsök men vi fortfarande saknar session, kunde koden
      // inte växlas in — vanligtvis för att den PKCE-verifierare som sparades lokalt när
      // länken begärdes saknas (t.ex. öppnad i en annan webbläsare/enhet, eller för gammal).
      if (event === 'INITIAL_SESSION' && recoveryAttemptRef.current && !session) {
        setRecoveryLinkError(
          'Länken kunde inte användas. Den kan ha öppnats i en annan webbläsare eller enhet än ' +
          'den du begärde återställningen från, redan ha använts, eller ha gått ut. Begär en ny länk.',
        )
      }
      recoveryAttemptRef.current = false
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
    setRecoveryLinkError(null)
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

  function clearRecoveryLinkError() {
    setRecoveryLinkError(null)
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
      recoveryLinkError,
      signIn,
      signOut,
      setLegacyAuth,
      clearPasswordRecovery,
      clearRecoveryLinkError,
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
