import { useState } from 'react'
import { X } from 'lucide-react'
import { sendSms } from '../services/telavoxService'

const SMS_TEMPLATES = [
  'Hej! Vi har en ledig plats på kursen. Hör av dig!',
  'Påminnelse: Betalning förfaller snart.',
  'Välkommen! Din plats är bekräftad.',
]

const MAX_CHARS = 160

interface SmsModalProps {
  isOpen:           boolean
  onClose:          () => void
  recipientName:    string
  recipientNumber:  string
}

export function SmsModal({ isOpen, onClose, recipientName, recipientNumber }: SmsModalProps) {
  const [message, setMessage]   = useState('')
  const [sending, setSending]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSend() {
    if (!message.trim()) return
    setSending(true)
    setError(null)
    try {
      await sendSms(recipientNumber, message.trim())
      setMessage('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte skicka SMS')
    } finally {
      setSending(false)
    }
  }

  function handleClose() {
    setMessage('')
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-brand-dark">Skicka SMS</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Till {recipientName} · {recipientNumber}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Templates */}
          <div className="flex flex-wrap gap-2">
            {SMS_TEMPLATES.map((t) => (
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

          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleClose}
              className="text-sm px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Avbryt
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="text-sm px-5 py-2 rounded-lg bg-brand-dark text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {sending ? 'Skickar…' : 'Skicka SMS'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
