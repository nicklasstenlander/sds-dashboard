import { useState } from 'react'
import { X } from 'lucide-react'
import { ParticipantPanel } from './ParticipantPanel'
import { bookingTicketQuantity } from '../utils/courseMetrics'
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
  const ticketCount = bookings.reduce((sum, booking) => sum + bookingTicketQuantity(booking), 0)

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl transition-transform duration-300 ease-out md:inset-x-auto md:bottom-auto md:right-0 md:top-0 md:h-full md:max-h-none md:max-w-md md:rounded-none ${
          open ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'
        }`}
      >
        <div className="mx-auto mt-3 h-1 w-11 rounded-full bg-slate-200 md:hidden" />
        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-brand-dark">{title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {ticketCount === bookings.length
                ? `${bookings.length} personer`
                : `${ticketCount} biljetter · ${bookings.length} köp`}
            </p>
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
                const ticketQuantity = bookingTicketQuantity(b)
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
                    {ticketQuantity > 1 && (
                      <span className="shrink-0 text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap">
                        {ticketQuantity} biljetter
                      </span>
                    )}
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
