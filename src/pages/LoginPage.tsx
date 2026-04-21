import { useState } from 'react'
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import { useApiConfig } from '../context/ApiContext'

const BASE = 'https://dans.se/api/public'

async function verifyPassword(pw: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/events/?org=sollentunadans&pw=${encodeURIComponent(pw)}&maxRows=1`)
    return res.ok
  } catch {
    return false
  }
}

export function LoginPage() {
  const { setConfig } = useApiConfig()
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pw.trim()) return
    setLoading(true)
    setError('')
    const ok = await verifyPassword(pw.trim())
    if (ok) {
      setConfig({ org: 'sollentunadans', pw: pw.trim() })
    } else {
      setError('Felaktigt lösenord. Försök igen.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">

      {/* ── Left brand panel ── */}
      <div
        className="relative md:w-[45%] flex flex-col justify-between overflow-hidden px-10 py-12 md:px-14 md:py-16"
        style={{ background: 'linear-gradient(145deg, #007a80 0%, #009399 40%, #45aba5 100%)' }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-10"
          style={{ background: '#cfded2' }} />
        <div className="absolute bottom-10 -left-20 w-64 h-64 rounded-full opacity-10"
          style={{ background: '#dd5c86' }} />
        <div className="absolute top-1/2 right-0 w-40 h-40 rounded-full opacity-[0.07]"
          style={{ background: '#fff' }} />

        {/* Logo + wordmark */}
        <div className="relative z-10 flex items-center gap-4">
          <img src="logo.png" alt="SDS" className="w-10 h-10 object-contain brightness-0 invert opacity-90" />
          <div>
            <p className="text-white/60 text-xs font-medium tracking-[0.2em] uppercase">Sollentuna Dans & Scenskola</p>
          </div>
        </div>

        {/* Center copy */}
        <div className="relative z-10 flex-1 flex flex-col justify-center py-12 md:py-0">
          <h1
            className="text-white font-bold tracking-[0.25em] leading-none"
            style={{ fontSize: 'clamp(4rem, 8vw, 6.5rem)' }}
          >
            CORE
          </h1>
          <p className="mt-4 text-white/70 text-lg md:text-xl font-light leading-snug max-w-xs">
            Kärnan i din<br />verksamhet.
          </p>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-white/40 text-xs tracking-wide">© {new Date().getFullYear()} Sollentuna Dans & Scenskola</p>
        </div>
      </div>

      {/* ── Right login panel ── */}
      <div className="flex-1 flex items-center justify-center bg-white px-8 py-16 md:py-0">
        <div className="w-full max-w-sm">

          {/* Heading */}
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-brand-dark tracking-tight">Välkommen tillbaka</h2>
            <p className="text-slate-400 text-sm mt-1.5 font-light">Logga in med ditt lösenord för att fortsätta.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Password field */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Lösenord
              </label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={pw}
                  onChange={(e) => { setPw(e.target.value); setError('') }}
                  placeholder="••••••••••"
                  autoFocus
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

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !pw.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #009399 0%, #45aba5 100%)' }}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Logga in
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
