import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AuthBrandPanel } from '../components/AuthBrandPanel'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')
    // redirectTo måste peka på roten UTAN hash-sökväg, annars hamnar Supabases
    // ?code=...&type=recovery inuti hash-fragmentet istället för i den vanliga
    // query-strängen, och PKCE-detekteringen hittar aldrig koden. SetPasswordPage
    // visas ändå oavsett landningssida via isPasswordRecovery i AuthContext.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    setLoading(false)
    if (error) {
      setError('Kunde inte skicka återställningslänken just nu. Försök igen om en stund.')
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <AuthBrandPanel />

      <div className="flex-1 flex items-center justify-center bg-white px-8 py-16 md:py-0">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-brand-dark tracking-tight">Glömt lösenord?</h2>
            <p className="text-slate-400 text-sm mt-1.5 font-light">
              Ange din e-postadress så skickar vi en länk för att återställa ditt lösenord.
            </p>
          </div>

          {sent ? (
            <p className="text-sm text-brand-dark bg-brand-mint/40 border border-brand-mint rounded-xl px-4 py-3">
              Om adressen finns hos oss har ett mejl skickats. Kolla din inkorg.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  E-postadress
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError('') }}
                  placeholder="namn@sollentunadans.se"
                  autoFocus
                  autoComplete="email"
                  className={`w-full border rounded-xl px-4 py-3 text-sm text-brand-dark bg-white focus:outline-none focus:ring-2 transition-colors ${
                    error
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-slate-200 focus:ring-brand-mint focus:border-brand-forest'
                  }`}
                />
                {error && (
                  <p className="mt-2 text-xs text-red-500 flex items-center gap-1.5">
                    <span className="inline-block w-1 h-1 rounded-full bg-red-500 shrink-0" />
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #009399 0%, #45aba5 100%)' }}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Skicka återställningslänk
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          <Link
            to="/"
            className="mt-6 flex items-center gap-1.5 text-xs text-slate-400 hover:text-brand-forest transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Tillbaka till inloggning
          </Link>
        </div>
      </div>
    </div>
  )
}
