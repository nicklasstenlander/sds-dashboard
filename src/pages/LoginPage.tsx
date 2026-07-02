import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2, ChevronDown } from 'lucide-react'
import { useApiConfig } from '../context/ApiContext'
import { useAuth } from '../context/AuthContext'
import { verifyCogworkPassword } from '../api/cogwork'

export function LoginPage() {
  const { setConfig } = useApiConfig()
  const { signIn, setLegacyAuth, recoveryLinkError, clearRecoveryLinkError, pkceDiagnostics } = useAuth()

  // Supabase-läge
  const [email, setEmail] = useState('')
  const [sbPw, setSbPw] = useState('')
  const [sbShowPw, setSbShowPw] = useState(false)
  const [sbLoading, setSbLoading] = useState(false)
  const [sbError, setSbError] = useState('')

  // Legacy-läge
  const [showLegacy, setShowLegacy] = useState(false)
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSupabaseSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !sbPw) return
    setSbLoading(true)
    setSbError('')
    const { error } = await signIn(email.trim(), sbPw)
    if (error) {
      setSbError('Felaktig e-post eller lösenord. Försök igen.')
    }
    setSbLoading(false)
  }

  async function handleLegacySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pw.trim()) return
    setLoading(true)
    setError('')
    const result = await verifyCogworkPassword(pw.trim())
    if (result === 'ok') {
      setLegacyAuth(true)
      setConfig({ org: 'sollentunadans', pw: pw.trim() })
    } else if (result === 'rejected') {
      setError('Felaktigt lösenord. Försök igen.')
    } else {
      setError('Kunde inte nå servern. Försök igen om en stund.')
    }
    setLoading(false)
  }

  return (
    <div className="core-login fixed inset-0 overflow-y-auto overflow-x-hidden bg-[#fff] text-black">
      <img
        src="/core-dancer.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 right-0 z-0 w-[42vw] min-w-[150px] max-w-[760px] object-contain sm:w-[38vw] sm:min-w-[260px]"
      />

      <main className="relative z-10 flex min-h-screen w-full max-w-[100vw] items-center justify-center overflow-hidden px-6 py-10 sm:px-10">
        <div className="core-login-panel flex w-full max-w-[330px] flex-col items-center text-center sm:max-w-[360px]">
          <img
            src="/core-circle-logo.png"
            alt="Sollentuna Dans & Scenskola"
            className="mb-10 h-[138px] w-[138px] object-contain sm:h-[164px] sm:w-[164px]"
          />

          <h1 className="text-[52px] font-light leading-none tracking-normal text-black sm:text-[68px]">
            CORE
          </h1>
          <p className="mt-5 text-[25px] font-normal leading-tight text-black sm:text-[30px]">
            Kärnan i varje steg.
          </p>

          <div className="mt-9 w-full">
            <div className="mb-8">
              <h2 className="text-base font-bold text-black">Välkommen tillbaka</h2>
              <p className="mt-3 text-[15px] font-normal leading-snug text-black sm:text-base">
                Logga in med din e-post och ditt lösenord.
              </p>
            </div>

          {recoveryLinkError && (
            <div className="mb-6 flex flex-col gap-3 rounded-lg border border-red-100 bg-red-50 p-4 text-left text-sm text-red-700">
              <div className="flex items-start justify-between gap-3">
                <p>{recoveryLinkError}</p>
                <button
                  type="button"
                  onClick={clearRecoveryLinkError}
                  className="text-red-400 hover:text-red-600 transition-colors shrink-0"
                  aria-label="Stäng"
                >
                  ×
                </button>
              </div>

              {/* TILLFÄLLIG DIAGNOSTIK — ta bort efter felsökning */}
              {/* TODO: Ta bort efter PKCE-felsökning */}
              {/* pkceDiagnostics är en ögonblicksbild från sidladdningen (se supabase.ts) -
                  Supabase hinner rensa code-verifier och ?code= ur URL:en innan detta
                  felmeddelande hinner renderas, så en live-avläsning här skulle alltid
                  visa codeVerifierPresent: false oavsett vad som faktiskt hände. */}
              <details className="text-xs opacity-70">
                <summary>Teknisk information (tillfällig)</summary>
                <pre className="whitespace-pre-wrap break-all mt-1">
                  {JSON.stringify(
                    {
                      ...pkceDiagnostics,
                      userAgent: navigator.userAgent,
                      referrer: document.referrer,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          )}

          {/* ── Supabase-formulär (primärt) ── */}
          <form onSubmit={handleSupabaseSubmit} className="space-y-2 text-left">

            {/* E-post */}
            <div>
              <label className="mb-1 block text-sm font-normal text-black">
                E-mailadress
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setSbError('') }}
                placeholder="namn@sollentunadans.se"
                autoComplete="email"
                className={`h-7 w-full rounded-full border bg-[#fff] px-4 text-sm text-black outline-none transition-colors focus:ring-2 ${
                  sbError
                    ? 'border-red-400 focus:ring-red-100'
                    : 'border-black focus:border-brand-forest focus:ring-brand-mint'
                }`}
              />
            </div>

            {/* Lösenord */}
            <div>
              <label className="mb-1 block text-sm font-normal text-black">
                Lösenord
              </label>
              <div className="relative">
                <input
                  type={sbShowPw ? 'text' : 'password'}
                  value={sbPw}
                  onChange={(e) => { setSbPw(e.target.value); setSbError('') }}
                  placeholder="••••••••••"
                  autoComplete="current-password"
                  className={`h-7 w-full rounded-full border bg-[#fff] px-4 pr-10 text-sm text-black outline-none transition-colors focus:ring-2 ${
                    sbError
                      ? 'border-red-400 focus:ring-red-100'
                      : 'border-black focus:border-brand-forest focus:ring-brand-mint'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setSbShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-black"
                  tabIndex={-1}
                  aria-label={sbShowPw ? 'Dölj lösenord' : 'Visa lösenord'}
                >
                  {sbShowPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Glömt lösenord */}
              <div className="mt-2 flex items-center justify-between">
                {sbError && (
                  <p className="flex items-center gap-1.5 text-xs text-red-500">
                    <span className="inline-block w-1 h-1 rounded-full bg-red-500 shrink-0" />
                    {sbError}
                  </p>
                )}
                {!sbError && <span />}
                <Link
                  to="/forgot-password"
                  className="text-xs text-slate-400 transition-colors hover:text-brand-forest"
                >
                  Glömt lösenord?
                </Link>
              </div>
            </div>

            {/* Logga in-knapp */}
            <button
              type="submit"
              disabled={sbLoading || !email.trim() || !sbPw}
              className="mt-7 flex h-[68px] w-full items-center justify-center rounded-xl bg-brand-forest px-6 text-[22px] font-bold text-white transition-colors hover:bg-[#008489] disabled:cursor-not-allowed disabled:bg-brand-forest disabled:opacity-100"
            >
              {sbLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                'Login'
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-black sm:text-base">
            © {new Date().getFullYear()} Sollentuna Dans & Scenskola
          </p>

          {/* ── Legacy-fallback (dold som standard) ── */}
          <div className="mt-5 border-t border-slate-100 pt-4 text-left">
            <button
              type="button"
              onClick={() => setShowLegacy(s => !s)}
              className="flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-500"
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${showLegacy ? 'rotate-180' : ''}`}
              />
              Problem att logga in? Använd tillfälligt lösenord
            </button>

            {/* Expanderbar legacy-sektion */}
            <div
              style={{
                overflow: 'hidden',
                maxHeight: showLegacy ? '220px' : '0',
                transition: 'max-height 0.3s ease',
              }}
            >
              <form onSubmit={handleLegacySubmit} className="mt-4 space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Tillfälligt lösenord
                  </label>
                  <div className="relative">
                    <input
                      type={show ? 'text' : 'password'}
                      value={pw}
                      onChange={(e) => { setPw(e.target.value); setError('') }}
                      placeholder="••••••••••"
                      className={`w-full rounded-xl border bg-white px-4 py-3 pr-11 text-sm text-brand-dark transition-colors focus:outline-none focus:ring-2 ${
                        error
                          ? 'border-red-300 focus:ring-red-200'
                          : 'border-slate-200 focus:ring-brand-mint focus:border-brand-forest'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShow(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                      tabIndex={-1}
                      aria-label={show ? 'Dölj tillfälligt lösenord' : 'Visa tillfälligt lösenord'}
                    >
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {error && (
                    <p className="mt-2 text-xs text-red-500 flex items-center gap-1.5">
                      <span className="inline-block w-1 h-1 rounded-full bg-red-500 shrink-0" />
                      {error}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !pw.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-6 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Logga in tillfälligt'
                  )}
                </button>
              </form>
            </div>
          </div>

        </div>
        </div>
      </main>
    </div>
  )
}
