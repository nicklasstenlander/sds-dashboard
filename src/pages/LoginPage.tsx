import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2, ChevronDown } from 'lucide-react'
import { useApiConfig } from '../context/ApiContext'
import { useAuth } from '../context/AuthContext'
import { verifyCogworkPassword } from '../api/cogwork'

export function LoginPage() {
  const { setConfig } = useApiConfig()
  const { signIn, setLegacyAuth } = useAuth()

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
    <div className="core-login fixed inset-0 w-dvw overflow-y-auto overflow-x-hidden bg-[#fff] text-black">
      <img
        src="/core-dancer.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 right-0 z-0 hidden w-[38vw] min-w-[260px] max-w-[760px] object-contain md:block"
      />

      <main className="relative z-10 flex min-h-dvh w-dvw max-w-none items-center justify-center overflow-hidden px-4 py-10 sm:px-10">
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

          {/* ── Supabase-formulär (primärt) ── */}
          <form onSubmit={handleSupabaseSubmit} className="mx-auto w-full max-w-[280px] space-y-2 text-left sm:max-w-none">

            {/* E-post */}
            <div>
              <label htmlFor="login-email" className="mb-1 block text-sm font-normal text-black">
                E-post
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setSbError('') }}
                placeholder="namn@sollentunadansochscenskola.se"
                autoComplete="email"
                className={`h-11 w-full rounded-full border bg-[#fff] px-4 text-sm text-black placeholder:text-[#6b7280] outline-none transition-colors focus:ring-2 ${
                  sbError
                    ? 'border-red-400 focus:ring-red-100'
                    : 'border-black focus:border-brand-accent focus:ring-brand-accent/40'
                }`}
              />
            </div>

            {/* Lösenord */}
            <div>
              <label htmlFor="login-password" className="mb-1 block text-sm font-normal text-black">
                Lösenord
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={sbShowPw ? 'text' : 'password'}
                  value={sbPw}
                  onChange={(e) => { setSbPw(e.target.value); setSbError('') }}
                  placeholder="••••••••••"
                  autoComplete="current-password"
                  className={`h-11 w-full rounded-full border bg-[#fff] px-4 pr-12 text-sm text-black placeholder:text-[#6b7280] outline-none transition-colors focus:ring-2 ${
                    sbError
                      ? 'border-red-400 focus:ring-red-100'
                      : 'border-black focus:border-brand-accent focus:ring-brand-accent/40'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setSbShowPw(s => !s)}
                  className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[#4b5563] transition-colors hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
                  aria-label={sbShowPw ? 'Dölj lösenord' : 'Visa lösenord'}
                >
                  {sbShowPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Glömt lösenord */}
              <div className="mt-2 flex items-center justify-between">
                {sbError && (
                  <p className="flex items-center gap-1.5 text-sm text-red-700" role="alert">
                    <span className="inline-block w-1 h-1 rounded-full bg-red-700 shrink-0" />
                    {sbError}
                  </p>
                )}
                {!sbError && <span />}
                <Link
                  to="/forgot-password"
                  className="-my-2 inline-flex min-h-[44px] items-center px-1 text-sm text-[#4b5563] underline-offset-2 transition-colors hover:text-black hover:underline"
                >
                  Glömt lösenord?
                </Link>
              </div>
            </div>

            {/* Logga in-knapp */}
            <button
              type="submit"
              disabled={sbLoading || !email.trim() || !sbPw}
              className="mt-7 flex h-[68px] w-full items-center justify-center rounded-xl bg-brand-accentDark px-6 text-[22px] font-bold text-white transition-colors hover:bg-[#a82d5c] disabled:cursor-not-allowed disabled:bg-[#4b5563] disabled:opacity-100"
            >
              {sbLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                'Logga in'
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-black sm:text-base">
            © {new Date().getFullYear()} Sollentuna Dans & Scenskola
          </p>

          {/* ── Legacy-fallback (dold som standard) ── */}
          <div className="mx-auto mt-5 w-full max-w-[280px] border-t border-slate-100 pt-4 text-left sm:max-w-none">
            <button
              type="button"
              onClick={() => setShowLegacy(s => !s)}
              aria-expanded={showLegacy}
              className="flex min-h-[44px] items-center gap-1 text-sm text-[#4b5563] transition-colors hover:text-black"
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
                maxHeight: showLegacy ? '240px' : '0',
                transition: 'max-height 0.3s ease',
              }}
            >
              <form onSubmit={handleLegacySubmit} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="legacy-password" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[#4b5563]">
                    Tillfälligt lösenord
                  </label>
                  <div className="relative">
                    <input
                      id="legacy-password"
                      type={show ? 'text' : 'password'}
                      autoComplete="off"
                      value={pw}
                      onChange={(e) => { setPw(e.target.value); setError('') }}
                      placeholder="••••••••••"
                      className={`w-full rounded-xl border bg-white px-4 py-3 pr-12 text-sm text-brand-dark placeholder:text-[#6b7280] transition-colors focus:outline-none focus:ring-2 ${
                        error
                          ? 'border-red-300 focus:ring-red-200'
                          : 'border-slate-200 focus:ring-brand-accent/40 focus:border-brand-accent'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShow(s => !s)}
                      className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[#4b5563] transition-colors hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
                      aria-label={show ? 'Dölj tillfälligt lösenord' : 'Visa tillfälligt lösenord'}
                    >
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {error && (
                    <p className="mt-2 text-sm text-red-700 flex items-center gap-1.5" role="alert">
                      <span className="inline-block w-1 h-1 rounded-full bg-red-700 shrink-0" />
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
