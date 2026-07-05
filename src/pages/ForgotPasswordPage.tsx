import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const MIN_PASSWORD_LENGTH = 8
const CODE_LENGTH = 8

type Step = 'email' | 'code'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { setRecoveryInProgress } = useAuth()
  const [step, setStep] = useState<Step>('email')

  const [email, setEmail] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  const [sendError, setSendError] = useState('')
  const [resendNotice, setResendNotice] = useState('')

  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [otpVerified, setOtpVerified] = useState(false)

  async function sendCode() {
    setSendLoading(true)
    setSendError('')
    // Ingen redirectTo längre - koden skrivs in manuellt och skickas aldrig via en
    // klickbar länk, så den kan inte "förhandsbesökas" och förbrukas i förväg.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    setSendLoading(false)
    // Supabase avslöjar aldrig om e-postadressen finns registrerad via detta
    // felfält (det returneras bara för verkliga fel, t.ex. ogiltig e-post eller
    // för många förfrågningar) - därför är det säkert att visa felet direkt.
    if (error) {
      setSendError('Kunde inte skicka koden just nu. Försök igen om en stund.')
      return false
    }
    return true
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    const ok = await sendCode()
    if (ok) {
      setStep('code')
    }
  }

  async function handleResendCode() {
    setResendNotice('')
    const ok = await sendCode()
    if (ok) {
      setResendNotice('Ny kod skickad. Kolla din inkorg.')
    }
  }

  async function handleVerifyAndSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')

    if (!/^\d{8}$/.test(code)) {
      setSubmitError(`Koden måste vara ${CODE_LENGTH} siffror.`)
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setSubmitError(`Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`)
      return
    }
    if (password !== confirmPassword) {
      setSubmitError('Lösenorden matchar inte.')
      return
    }

    setSubmitLoading(true)
    // verifyOtp sätter en giltig Supabase-session direkt, INNAN lösenordet faktiskt
    // är sparat. Utan denna spärr skulle App.tsx tolka den nya sessionen som "fullt
    // inloggad" och byta till huvudappen medan updateUser fortfarande pågår - om det
    // sedan misslyckas syns aldrig felet och användaren hamnar i appen med sitt gamla
    // lösenord kvar. Spärren släpps bara vid lyckat byte (eller om koden var fel och
    // ingen session någonsin sattes).
    setRecoveryInProgress(true)

    // Koden är engångsgiltig - om den redan verifierats en gång (t.ex. vid en
    // omförsök efter att updateUser misslyckats) ska den inte skickas in igen, då
    // skulle den bara avvisas som ogiltig trots att sessionen redan är giltig.
    if (!otpVerified) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code,
        type: 'recovery',
      })
      if (verifyError) {
        setSubmitLoading(false)
        setRecoveryInProgress(false)
        setSubmitError('Fel kod eller koden har gått ut. Kontrollera att du skrivit rätt, eller begär en ny kod.')
        return
      }
      setOtpVerified(true)
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitLoading(false)
    if (updateError) {
      // Sessionen är redan giltig här (verifyOtp lyckades), så vi håller kvar spärren
      // och stannar på den här vyn tills lösenordet faktiskt är satt - annars skulle
      // felet aldrig synas för användaren.
      setSubmitError('Kunde inte spara lösenordet. Försök igen.')
      return
    }

    setRecoveryInProgress(false)
    navigate('/', { replace: true })
  }

  return (
    <div className="core-login fixed inset-0 w-dvw overflow-y-auto overflow-x-hidden bg-[#fff] text-black">
      <img
        src="/core-dancer.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 right-0 z-0 w-[30vw] min-w-[110px] max-w-[180px] object-contain sm:w-[38vw] sm:min-w-[260px] sm:max-w-[760px]"
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
            {step === 'email' ? (
              <>
                <div className="mb-8">
                  <h2 className="text-base font-bold text-black">Glömt lösenord?</h2>
                  <p className="mt-3 text-[15px] font-normal leading-snug text-black sm:text-base">
                    Ange din e-postadress så skickar vi en kod för att återställa ditt lösenord.
                  </p>
                </div>

                <form onSubmit={handleSendCode} className="mx-auto w-full max-w-[280px] space-y-2 text-left sm:max-w-none">
                  <div>
                    <label className="mb-1 block text-sm font-normal text-black">
                      E-mailadress
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setSendError('') }}
                      placeholder="namn@sollentunadans.se"
                      autoFocus
                      autoComplete="email"
                      className={`h-7 w-full rounded-full border bg-[#fff] px-4 text-sm text-black outline-none transition-colors focus:ring-2 ${
                        sendError
                          ? 'border-red-400 focus:ring-red-100'
                          : 'border-black focus:border-brand-forest focus:ring-brand-mint'
                      }`}
                    />
                    {sendError && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
                        <span className="inline-block w-1 h-1 rounded-full bg-red-500 shrink-0" />
                        {sendError}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={sendLoading || !email.trim()}
                    className="mt-7 flex h-[68px] w-full items-center justify-center rounded-xl bg-brand-forest px-6 text-[22px] font-bold text-white transition-colors hover:bg-[#008489] disabled:cursor-not-allowed disabled:bg-brand-forest disabled:opacity-100"
                  >
                    {sendLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : 'Skicka kod'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="mb-8">
                  <h2 className="text-base font-bold text-black">Ange kod och nytt lösenord</h2>
                  <p className="mt-3 text-[15px] font-normal leading-snug text-black sm:text-base">
                    Vi har skickat en 8-siffrig kod till {email.trim()}. Koden är giltig i en timme.
                    Du kan begära en ny kod om en minut har gått.
                  </p>
                </div>

                <form onSubmit={handleVerifyAndSetPassword} className="mx-auto w-full max-w-[280px] space-y-2 text-left sm:max-w-none">
                  <div>
                    <label className="mb-1 block text-sm font-normal text-black">
                      8-siffrig kod
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={CODE_LENGTH}
                      value={code}
                      onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)); setSubmitError('') }}
                      placeholder="00000000"
                      autoFocus
                      className={`h-10 w-full rounded-full border bg-[#fff] px-4 text-center text-lg tracking-[0.5em] text-black outline-none transition-colors focus:ring-2 ${
                        submitError
                          ? 'border-red-400 focus:ring-red-100'
                          : 'border-black focus:border-brand-forest focus:ring-brand-mint'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-normal text-black">
                      Nytt lösenord
                    </label>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setSubmitError('') }}
                        placeholder="••••••••••"
                        autoComplete="new-password"
                        className={`h-7 w-full rounded-full border bg-[#fff] px-4 pr-10 text-sm text-black outline-none transition-colors focus:ring-2 ${
                          submitError
                            ? 'border-red-400 focus:ring-red-100'
                            : 'border-black focus:border-brand-forest focus:ring-brand-mint'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-black"
                        tabIndex={-1}
                        aria-label={showPw ? 'Dölj lösenord' : 'Visa lösenord'}
                      >
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-normal text-black">
                      Bekräfta lösenord
                    </label>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setSubmitError('') }}
                      placeholder="••••••••••"
                      autoComplete="new-password"
                      className={`h-7 w-full rounded-full border bg-[#fff] px-4 text-sm text-black outline-none transition-colors focus:ring-2 ${
                        submitError
                          ? 'border-red-400 focus:ring-red-100'
                          : 'border-black focus:border-brand-forest focus:ring-brand-mint'
                      }`}
                    />
                  </div>

                  {submitError && (
                    <p className="flex items-center gap-1.5 text-xs text-red-500">
                      <span className="inline-block w-1 h-1 rounded-full bg-red-500 shrink-0" />
                      {submitError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitLoading || code.length !== CODE_LENGTH || !password || !confirmPassword}
                    className="mt-7 flex h-[68px] w-full items-center justify-center rounded-xl bg-brand-forest px-6 text-[22px] font-bold text-white transition-colors hover:bg-[#008489] disabled:cursor-not-allowed disabled:bg-brand-forest disabled:opacity-100"
                  >
                    {submitLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : 'Sätt lösenord'}
                  </button>

                  <div className="flex flex-col items-start gap-1 pt-1">
                    <button
                      type="button"
                      onClick={handleResendCode}
                      disabled={sendLoading}
                      className="text-xs text-slate-400 transition-colors hover:text-brand-forest disabled:opacity-50"
                    >
                      {sendLoading ? 'Skickar…' : 'Skicka ny kod'}
                    </button>
                    {resendNotice && <p className="text-xs text-brand-forest">{resendNotice}</p>}
                    {sendError && <p className="text-xs text-red-500">{sendError}</p>}
                  </div>
                </form>
              </>
            )}

            <Link
              to="/"
              className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-brand-forest"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Tillbaka till inloggning
            </Link>

            <p className="mt-8 text-center text-sm text-black sm:text-base">
              © {new Date().getFullYear()} Sollentuna Dans & Scenskola
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
