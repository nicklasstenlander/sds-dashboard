import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { AuthBrandPanel } from '../components/AuthBrandPanel'

const MIN_PASSWORD_LENGTH = 8

export function SetPasswordPage() {
  const { clearPasswordRecovery } = useAuth()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Lösenorden matchar inte.')
      return
    }

    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError('Kunde inte spara lösenordet. Försök igen.')
      return
    }

    clearPasswordRecovery()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <AuthBrandPanel />

      <div className="flex-1 flex items-center justify-center bg-white px-8 py-16 md:py-0">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-brand-dark tracking-tight">Sätt nytt lösenord</h2>
            <p className="text-slate-400 text-sm mt-1.5 font-light">
              Välj ett lösenord för att komma vidare till CORE.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Nytt lösenord
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••••"
                  autoFocus
                  autoComplete="new-password"
                  className={`w-full border rounded-xl px-4 py-3 pr-11 text-sm text-brand-dark bg-white focus:outline-none focus:ring-2 transition-colors ${
                    error
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-slate-200 focus:ring-brand-mint focus:border-brand-forest'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Bekräfta lösenord
              </label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
                placeholder="••••••••••"
                autoComplete="new-password"
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
              disabled={loading || !password || !confirmPassword}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #009399 0%, #45aba5 100%)' }}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Spara lösenord
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
