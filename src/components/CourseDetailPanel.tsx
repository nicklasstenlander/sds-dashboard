import { useState, useMemo } from 'react'
import { X, Users, Clock, MapPin, User, Banknote } from 'lucide-react'
import { useEventBookings } from '../hooks/useEventBookings'
import { ParticipantPanel } from './ParticipantPanel'
import { bookingTicketQuantity, buildCourseMetrics, isAcceptedBooking } from '../utils/courseMetrics'
import type { Event, Booking, BookingPayment } from '../types/cogwork'

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

interface CourseDetailPanelProps {
  event: Event | null
  onClose: () => void
}

function BookingSection({ bookings, onSelectParticipant }: { bookings: Booking[]; onSelectParticipant: (name: string) => void }) {
  const antagna    = bookings.filter(isAcceptedBooking)
  const ejAntagna  = bookings.filter((b) => !isAcceptedBooking(b))
  const antagnaCount = antagna.reduce((sum, booking) => sum + bookingTicketQuantity(booking), 0)
  const ejAntagnaCount = ejAntagna.reduce((sum, booking) => sum + bookingTicketQuantity(booking), 0)

  return (
    <div>
      <SectionHeader label="Antagna" count={antagnaCount} color="text-brand-forest" />
      {antagna.length === 0 ? (
        <p className="px-5 py-3 text-sm text-slate-400">Inga antagna ännu</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {antagna.map((b) => <BookingRow key={b.key} b={b} onSelect={onSelectParticipant} />)}
        </ul>
      )}

      <SectionHeader label="Anmälda — ej antagna" count={ejAntagnaCount} color="text-amber-600" />
      {ejAntagna.length === 0 ? (
        <p className="px-5 py-3 text-sm text-slate-400">Alla anmälda är antagna</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {ejAntagna.map((b) => <BookingRow key={b.key} b={b} onSelect={onSelectParticipant} />)}
        </ul>
      )}
    </div>
  )
}

function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`px-5 py-2.5 flex items-center justify-between sticky top-0 bg-white border-b border-slate-100`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</p>
      <span className="text-xs text-slate-400">{count} st</span>
    </div>
  )
}

function BookingRow({ b, onSelect }: { b: Booking; onSelect: (name: string) => void }) {
  const name = b.participant?.name ?? ''
  const parts = name.trim().split(' ')
  const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
  const ticketQuantity = bookingTicketQuantity(b)
  return (
    <li className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60">
      <div className="w-8 h-8 rounded-full bg-brand-teal flex items-center justify-center text-white text-xs font-semibold shrink-0">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        {name ? (
          <button
            onClick={() => onSelect(name)}
            className="text-sm font-medium text-brand-dark hover:text-brand-forest hover:underline truncate text-left"
          >
            {name}
          </button>
        ) : (
          <p className="text-sm font-medium text-brand-dark truncate">—</p>
        )}
        {b.status?.name && (
          <p className="text-xs text-slate-400">{b.status.name}</p>
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
}

export function CourseDetailPanel({ event, onClose }: CourseDetailPanelProps) {
  const { data: bookings = [], isLoading } = useEventBookings(event?.id ?? null)
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null)
  const metrics = useMemo(() => {
    const [courseMetrics] = buildCourseMetrics(bookings).values()
    return courseMetrics
  }, [bookings])

  const acceptedCount = bookings.length > 0
    ? (metrics?.accepted ?? 0)
    : (event?.statistics?.accepted ?? 0)
  const prelCount = bookings.length > 0
    ? bookings.reduce((sum, booking) => sum + bookingTicketQuantity(booking), 0) - acceptedCount
    : 0

  const revenue = useMemo(() => {
    if (metrics?.revenue) return metrics.revenue
    const accepted = event?.statistics?.accepted ?? 0
    const price = event?.pricing?.basePriceInclVat ?? 0
    return accepted * price
  }, [event, metrics])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-200 ${event ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl transition-transform duration-300 ease-out md:inset-x-auto md:bottom-auto md:right-0 md:top-0 md:h-full md:max-h-none md:max-w-md md:rounded-none ${
          event ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'
        }`}
      >
        <div className="mx-auto mt-3 h-1 w-11 rounded-full bg-slate-200 md:hidden" />
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-xs font-medium text-brand-forest uppercase tracking-wide mb-1">
              {event?.grouping?.primaryEventGroup?.name ?? event?.category?.name ?? 'Kurs'}
            </p>
            <h2 className="text-base font-bold text-brand-dark leading-snug">
              {event?.name ?? ''}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Meta */}
        {event && (
          <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-x-5 gap-y-1.5">
            {event.schedule?.dayAndTimeInfo && (
              <span className="flex items-center gap-1.5 text-sm text-slate-500">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                {event.schedule.dayAndTimeInfo}
              </span>
            )}
            {event.place && (
              <span className="flex items-center gap-1.5 text-sm text-slate-500">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {event.place}
              </span>
            )}
            {event.instructorsName && (
              <span className="flex items-center gap-1.5 text-sm text-slate-500">
                <User className="w-3.5 h-3.5 shrink-0" />
                {event.instructorsName}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-sm text-slate-500">
              <Users className="w-3.5 h-3.5 shrink-0" />
              {acceptedCount} antagna
              {event.requirements?.maxParticipants
                ? ` / ${event.requirements.maxParticipants} platser`
                : ''}
              {prelCount > 0 && ` (${prelCount} prel.bokade)`}
            </span>
            {revenue > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-slate-500">
                <Banknote className="w-3.5 h-3.5 shrink-0" />
                {revenue.toLocaleString('sv-SE')} kr
              </span>
            )}
          </div>
        )}

        {/* Participants */}
        <div className="flex-1 overflow-y-auto pb-6">
          {isLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-4 w-36 bg-slate-100 rounded animate-pulse" />
                  <div className="h-4 w-16 bg-slate-100 rounded animate-pulse ml-auto" />
                </div>
              ))}
            </div>
          ) : bookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-slate-400 font-light">Inga anmälda hittades</p>
            </div>
          ) : (
            <BookingSection
              bookings={bookings}
              onSelectParticipant={setSelectedParticipant}
            />
          )}
        </div>
      </div>

      <ParticipantPanel
        name={selectedParticipant}
        onClose={() => setSelectedParticipant(null)}
        elevated
      />
    </>
  )
}
