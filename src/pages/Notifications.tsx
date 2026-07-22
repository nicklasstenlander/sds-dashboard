import { useMemo, useState } from 'react'
import { CheckCircle, Loader2, Send, XCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useEvents } from '../hooks/useEvents'
import { sendCustomPush, type PushTarget, type SendPushResult } from '../services/pushService'

const TITLE_MAX = 50
const MESSAGE_MAX = 150

type Audience = 'all' | 'course'

export function Notifications() {
  const { session, usingLegacyAuth } = useAuth()
  const canSend = Boolean(session) && !usingLegacyAuth

  const eventsQuery = useEvents()
  const events = useMemo(
    () => [...(eventsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    [eventsQuery.data],
  )

  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<Audience>('all')
  const [eventId, setEventId] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendPushResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedEvent = events.find((event) => event.id === eventId) ?? null
  const canSubmit =
    canSend &&
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    (audience === 'all' || eventId !== null)

  async function handleSend() {
    if (!session || !canSubmit) return

    const target: PushTarget = audience === 'all' ? { type: 'all' } : { type: 'course', eventId: eventId! }
    const confirmText =
      audience === 'all'
        ? 'Skicka till alla med appen? Detta går inte att ångra.'
        : `Skicka till följare av "${selectedEvent?.name ?? 'vald kurs'}"? Detta går inte att ångra.`
    if (!confirm(confirmText)) return

    setSending(true)
    setError(null)
    setResult(null)
    try {
      const sendResult = await sendCustomPush(session.access_token, title.trim(), message.trim(), target)
      setResult(sendResult)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  function handleReset() {
    setTitle('')
    setMessage('')
    setAudience('all')
    setEventId(null)
    setResult(null)
    setError(null)
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark">Notiser</h1>
        <p className="mt-1 text-sm text-slate-500">Skicka en pushnotis direkt till alla med appen, eller till följare av en specifik kurs.</p>
      </div>

      {!canSend && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Notiser kan bara skickas när du är inloggad med en CORE-användare. Logga ut från tillfälligt läge och logga in med e-post/lösenord.
        </div>
      )}

      <div className="card space-y-4 p-5">
        {result && (
          <div className={`flex items-start gap-3 rounded-xl p-4 ${result.failed === 0 ? 'bg-brand-mint' : 'bg-amber-50'}`}>
            {result.failed === 0 ? (
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-forest" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            )}
            <div>
              <p className="text-sm font-medium text-brand-dark">
                Skickat till {result.sent} {result.sent === 1 ? 'enhet' : 'enheter'} ({result.failed} misslyckade)
              </p>
            </div>
          </div>
        )}

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-status-critical">{error}</p>}

        <div>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Titel *</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, TITLE_MAX))}
              disabled={!canSend}
              placeholder="T.ex. Viktig information"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint disabled:bg-slate-50 disabled:text-slate-400"
            />
          </label>
          <span className={`mt-1 block text-right text-xs ${title.length >= TITLE_MAX ? 'text-red-500' : 'text-slate-400'}`}>
            {title.length}/{TITLE_MAX}
          </span>
        </div>

        <div>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Meddelande *</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, MESSAGE_MAX))}
              disabled={!canSend}
              rows={4}
              placeholder="Skriv ditt meddelande…"
              className="mt-1 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint disabled:bg-slate-50 disabled:text-slate-400"
            />
          </label>
          <span className={`mt-1 block text-right text-xs ${message.length >= MESSAGE_MAX ? 'text-red-500' : 'text-slate-400'}`}>
            {message.length}/{MESSAGE_MAX}
          </span>
        </div>

        <div>
          <span className="text-xs font-semibold text-slate-600">Mottagare</span>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 has-[:checked]:border-brand-forest has-[:checked]:bg-brand-mint/40 has-[:checked]:text-brand-dark">
              <input
                type="radio"
                name="audience"
                checked={audience === 'all'}
                onChange={() => setAudience('all')}
                disabled={!canSend}
                className="h-4 w-4 border-slate-300 text-brand-forest focus:ring-brand-mint"
              />
              Alla med appen
            </label>
            <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 has-[:checked]:border-brand-forest has-[:checked]:bg-brand-mint/40 has-[:checked]:text-brand-dark">
              <input
                type="radio"
                name="audience"
                checked={audience === 'course'}
                onChange={() => setAudience('course')}
                disabled={!canSend}
                className="h-4 w-4 border-slate-300 text-brand-forest focus:ring-brand-mint"
              />
              Följare av en kurs
            </label>
          </div>
        </div>

        {audience === 'course' && (
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Kurs</span>
            <select
              value={eventId ?? ''}
              onChange={(event) => setEventId(event.target.value ? Number(event.target.value) : null)}
              disabled={!canSend || eventsQuery.isLoading}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">{eventsQuery.isLoading ? 'Hämtar kurser…' : 'Välj kurs…'}</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>{event.name}</option>
              ))}
            </select>
          </label>
        )}

        <div className="flex justify-end gap-2">
          {result && (
            <button
              onClick={handleReset}
              className="rounded-lg px-4 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-50"
            >
              Skicka ny
            </button>
          )}
          {!result && (
            <button
              onClick={handleSend}
              disabled={!canSubmit || sending}
              className="inline-flex items-center gap-2 rounded-full bg-brand-dark px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-forest disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Skicka notis
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Kunde inte skicka notisen. Försök igen.'
}
