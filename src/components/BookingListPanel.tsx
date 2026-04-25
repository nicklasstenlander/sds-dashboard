import { useState } from 'react'
import { X } from 'lucide-react'
import { ParticipantPanel } from './ParticipantPanel'
import type { Booking, BookingPayment } from '../types/cogwork'

function PayBadge({ payment }: { payment?: BookingPayment }) {
  if (!payment) return null
  if (payment.paid === true) {
    const amount = payment.priceAgreed ?? payment.amountPaid
    return (
      <span className="shrink-0 text-xs font-semibold px-3 py-1 rounded-full bg-brand-mint text-brand-forest whitespace-nowrap">
        Betald{amount != null ? ` · ${amount.toLocaleString('sv-SE')} kr` : ''}
      </span>
    )
  }
  if (payment.paid === false) {
    return (
      <span className="shrink-0 text-xs font-semibold px-3 py-1 rounded-full bg-red-50 text-red-600 whitespace-nowrap">
        Obetald{payment.paymentDue ? ` · ${payment.paymentDue.slice(0, 10)}` : ''}
      </span>
    )
  }
  return null
}

interface BookingListPanelProps {
  title: string
  bookings: Booking[]
  onClose: () => void
}

export function BookingListPanel({ title, bookings, onClose }: BookingListPanelProps) {
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const open = Boolean(title)

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={open ? { animation: 'panel-slide-in 0.25s cubic-bezier(0.32, 0.72, 0, 1)' } : undefined}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-brand-dark">{title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{bookings.length} personer</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto pb-6">
          {bookings.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm text-slate-400">Inga poster</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {bookings.map((b) => {
                const name = b.participant?.name ?? ''
                const parts = name.trim().split(' ')
                const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
                return (
                  <li key={b.key} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-brand-teal flex items-center justify-center text-white text-xs font-semibold shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      {name ? (
                        <button
                          onClick={() => setSelectedName(name)}
                          className="text-sm font-medium text-brand-dark hover:text-brand-forest hover:underline text-left"
                        >
                          {name}
                        </button>
                      ) : (
                        <p className="text-sm font-medium text-brand-dark">—</p>
                      )}
                      {b.event?.name && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{b.event.name}</p>
                      )}
                    </div>
                    <PayBadge payment={b.payment} />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <ParticipantPanel name={selectedName} onClose={() => setSelectedName(null)} elevated />
    </>
  )
}
