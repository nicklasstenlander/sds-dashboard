import { useState, useEffect } from 'react'
import { X, CheckCircle, XCircle } from 'lucide-react'
import { sendSms } from '../services/telavoxService'
import { fetchUser } from '../api/cogwork'
import { useApiConfig } from '../context/ApiContext'
import type { Booking } from '../types/cogwork'

const SMS_TEMPLATES = [
  'Hej! Vi har en ledig plats på kursen. Hör av dig!',
  'Påminnelse: Betalning förfaller snart.',
  'Välkommen! Din plats är bekräftad.',
]

const MAX_CHARS = 160

interface Participant {
  name:  string
  phone: string
}

interface SendResult {
  sent:   number
  failed: number
}

interface GroupSmsModalProps {
  isOpen:     boolean
  onClose:    () => void
  courseName: string
  bookings:   Booking[]  // accepted bookings for this course
}

export function GroupSmsModal({ isOpen, onClose, courseName, bookings }: GroupSmsModalProps) {
  const { config }  = useApiConfig()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading]     = useState(false)
  const [message, setMessage]     = useState('')
  const [sending, setSending]     = useState(false)
  const [result, setResult]       = useState<SendResult | null>(null)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setResult(null)
      setMessage('')
      setError(null)
      return
    }

    const accepted = bookings.filter(b => b.status?.code?.toUpperCase() === 'ACCEPTED')
    if (!accepted.length) return

    setLoading(true)
    Promise.all(
      accepted.map(async b => {
        const name = b.participant?.name
        const id   = b.participant?.id
        if (!name) return null
        try {
          const res  = await fetchUser(config, name)
          const user = res.users.find(u => u.id === id) ?? res.users[0]
          const phone = user?.telephoneNumbers?.[0]?.telephoneNumber
          if (!phone) return null
          return { name: user?.name ?? name, phone } as Participant
        } catch {
          return null
        }
      })
    ).then(results => {
      setParticipants(results.filter((p): p is Participant => p !== null))
      setLoading(false)
    })
  }, [isOpen])

  async function handleSend() {
    if (!message.trim() || !participants.length) return
    setSending(true)
    setError(null)
    const results = await Promise.allSettled(
      participants.map(p => sendSms(p.phone, message.trim()))
    )
    const sent   = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    setResult({ sent, failed })
    setSending(false)
  }

  function handleClose() {
    setMessage('')
    setResult(null)
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  const accepted = bookings.filter(b => b.status?.code?.toUpperCase() === 'ACCEPTED')

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0">
      <div className="absolute inset-0 bg-black/30" onClick={handleClose} />

      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-brand-dark">Skicka SMS till gruppen</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {courseName} · {accepted.length} deltagare
            </p>
          </div>
          <button onClick={handleClose} className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Result */}
          {result && (
            <div className={`rounded-xl p-4 flex items-start gap-3 ${result.failed === 0 ? 'bg-brand-mint' : 'bg-amber-50'}`}>
              {result.failed === 0
                ? <CheckCircle className="w-5 h-5 text-brand-forest shrink-0 mt-0.5" />
                : <XCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
              <div>
                <p className="text-sm font-medium text-brand-dark">
                  {result.sent} skickade{result.failed > 0 ? `, ${result.failed} misslyckades` : ''}
                </p>
                {result.failed > 0 && (
                  <p className="text-xs text-slate-500 mt-0.5">Vissa nummer kanske är ogiltiga.</p>
                )}
              </div>
            </div>
          )}

          {/* Participant list */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Mottagare
            </p>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-8 bg-slate-50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : participants.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">Inga telefonnummer hittades för antagna deltagare.</p>
            ) : (
              <ul className="divide-y divide-slate-50 rounded-xl border border-slate-100 max-h-40 overflow-y-auto">
                {participants.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="font-medium text-brand-dark">{p.name}</span>
                    <span className="text-slate-400 tabular-nums">{p.phone}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Templates */}
          <div className="flex flex-wrap gap-2">
            {SMS_TEMPLATES.map(t => (
              <button
                key={t}
                onClick={() => setMessage(t)}
                className="text-xs px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:border-brand-forest hover:text-brand-forest transition-colors text-left"
              >
                {t.length > 40 ? t.slice(0, 40) + '…' : t}
              </button>
            ))}
          </div>

          {/* Textarea */}
          <div className="relative">
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value.slice(0, MAX_CHARS))}
              placeholder="Skriv ditt meddelande…"
              rows={4}
              className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-mint resize-none"
            />
            <span className={`absolute bottom-2 right-3 text-xs ${message.length >= MAX_CHARS ? 'text-red-500' : 'text-slate-400'}`}>
              {message.length}/{MAX_CHARS}
            </span>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button onClick={handleClose} className="text-sm px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors">
              {result ? 'Stäng' : 'Avbryt'}
            </button>
            {!result && (
              <button
                onClick={handleSend}
                disabled={sending || !message.trim() || participants.length === 0 || loading}
                className="text-sm px-5 py-2 rounded-lg bg-brand-dark text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {sending ? 'Skickar…' : `Skicka till ${participants.length}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
