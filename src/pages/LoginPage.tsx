import { useState } from 'react'
import { Eye, EyeOff, ArrowRight, Loader2, ChevronDown } from 'lucide-react'
import { useApiConfig } from '../context/ApiContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const BASE = 'https://dans.se/api/public'

type VerifyResult = 'ok' | 'rejected' | 'error'

async function verifyPassword(pw: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`${BASE}/events/?org=sollentunadans&pw=${encodeURIComponent(pw)}&maxRows=1`)
    if (res.ok) return 'ok'
    if (res.status === 401 || res.status === 403) return 'rejected'
    return 'error'
  } catch {
    return 'error'
  }
}

export function LoginPage() {
  const { setConfig } = useApiConfig()
  const { signIn, setLegacyAuth } = useAuth()

  // Supabase-läge
  const [email, setEmail] = useState('')
  const [sbPw, setSbPw] = useState('')
  const [sbShowPw, setSbShowPw] = useState(false)
  const [sbLoading, setSbLoading] = useState(false)
  const [sbError, setSbError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

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

  async function handleResetPassword() {
    if (!email.trim()) {
      setSbError('Ange din e-postadress ovan för att återställa lösenordet.')
      return
    }
    setResetLoading(true)
    await supabase.auth.resetPasswordForEmail(email.trim())
    setResetLoading(false)
    setResetSent(true)
  }

  async function handleLegacySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pw.trim()) return
    setLoading(true)
    setError('')
    const result = await verifyPassword(pw.trim())
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
    <div className="min-h-screen flex flex-col md:flex-row">

      {/* ── Vänster varumärkespanel ── */}
      <div
        className="relative md:w-[45%] flex flex-col justify-between overflow-hidden px-10 py-12 md:px-14 md:py-16"
        style={{ background: 'linear-gradient(145deg, #007a80 0%, #009399 40%, #45aba5 100%)' }}
      >
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-10"
          style={{ background: '#cfded2' }} />
        <div className="absolute bottom-10 -left-20 w-64 h-64 rounded-full opacity-10"
          style={{ background: '#dd5c86' }} />
        <div className="absolute top-1/2 right-0 w-40 h-40 rounded-full opacity-[0.07]"
          style={{ background: '#fff' }} />

        <div className="relative z-10 flex items-center gap-4">
          <img src="logo.png" alt="SDS" className="w-10 h-10 object-contain brightness-0 invert opacity-90" />
          <div>
            <p className="text-white/60 text-xs font-medium tracking-[0.2em] uppercase">Sollentuna Dans & Scenskola</p>
          </div>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center py-12 md:py-0">
          <h1
            className="text-white font-bold tracking-[0.25em] leading-none"
            style={{ fontSize: 'clamp(4rem, 8vw, 6.5rem)' }}
          >
            CORE
          </h1>
          <p className="mt-4 text-white/70 text-lg md:text-xl font-light leading-snug max-w-xs">
            Kärnan i<br />varje steg.
          </p>
        </div>

        <div className="relative z-10">
          <p className="text-white/40 text-xs tracking-wide">© {new Date().getFullYear()} Sollentuna Dans & Scenskola</p>
        </div>
      </div>

      {/* ── Höger inloggningspanel ── */}
      <div className="flex-1 flex items-center justify-center bg-white px-8 py-16 md:py-0">
        <div className="w-full max-w-sm">

          {/* Rubrik */}
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-brand-dark tracking-tight">Välkommen tillbaka</h2>
            <p className="text-slate-400 text-sm mt-1.5 font-light">Logga in med din e-post och ditt lösenord.</p>
          </div>

          {/* ── Supabase-formulär (primärt) ── */}
          <form onSubmit={handleSupabaseSubmit} className="space-y-5">

            {/* E-post */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                E-postadress
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setSbError(''); setResetSent(false) }}
                placeholder="namn@sollentunadans.se"
                autoFocus
                autoComplete="email"
                className={`w-full border rounded-xl px-4 py-3 text-sm text-brand-dark bg-white focus:outline-none focus:ring-2 transition-colors ${
                  sbError
                    ? 'border-red-300 focus:ring-red-200'
                    : 'border-slate-200 focus:ring-brand-mint focus:border-brand-forest'
                }`}
              />
            </div>

            {/* Lösenord */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Lösenord
              </label>
              <div className="relative">
                <input
                  type={sbShowPw ? 'text' : 'password'}
                  value={sbPw}
                  onChange={(e) => { setSbPw(e.target.value); setSbError('') }}
                  placeholder="••••••••••"
                  autoComplete="current-password"
                  className={`w-full border rounded-xl px-4 py-3 pr-11 text-sm text-brand-dark bg-white focus:outline-none focus:ring-2 transition-colors ${
                    sbError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-slate-200 focus:ring-brand-mint focus:border-brand-forest'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setSbShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {sbShowPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Glömt lösenord */}
              <div className="mt-2 flex items-center justify-between">
                {sbError && (
                  <p className="text-xs text-red-500 flex items-center gap-1.5">
                    <span className="inline-block w-1 h-1 rounded-full bg-red-500 shrink-0" />
                    {sbError}
                  </p>
                )}
                {!sbError && <span />}
                {resetSent ? (
                  <p className="text-xs text-emerald-600 font-medium">Mejl skickat ✓</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={resetLoading}
                    className="text-xs text-slate-400 hover:text-brand-forest transition-colors disabled:opacity-50"
                  >
                    {resetLoading ? 'Skickar…' : 'Glömt lösenord?'}
                  </button>
                )}
              </div>
            </div>

            {/* Logga in-knapp */}
            <button
              type="submit"
              disabled={sbLoading || !email.trim() || !sbPw}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #009399 0%, #45aba5 100%)' }}
            >
              {sbLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Logga in
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* ── Legacy-fallback (dold som standard) ── */}
          <div className="mt-8 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={() => setShowLegacy(s => !s)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-500 transition-colors"
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
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Tillfälligt lösenord
                  </label>
                  <div className="relative">
                    <input
                      type={show ? 'text' : 'password'}
                      value={pw}
                      onChange={(e) => { setPw(e.target.value); setError('') }}
                      placeholder="••••••••••"
                      className={`w-full border rounded-xl px-4 py-3 pr-11 text-sm text-brand-dark bg-white focus:outline-none focus:ring-2 transition-colors ${
                        error
                          ? 'border-red-300 focus:ring-red-200'
                          : 'border-slate-200 focus:ring-brand-mint focus:border-brand-forest'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShow(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      tabIndex={-1}
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
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-6 rounded-xl font-semibold text-sm text-slate-600 border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
    </div>
  )
}
