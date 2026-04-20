import { X, Users, Clock, MapPin, User } from 'lucide-react'
import { useEventBookings } from '../hooks/useEventBookings'
import type { Event, Booking } from '../types/cogwork'

interface CourseDetailPanelProps {
  event: Event | null
  onClose: () => void
}

function payLabel(b: Booking): { text: string; cls: string } {
  const p = b.payment
  if (!p) return { text: '—', cls: 'text-slate-400' }
  if (p.paid === true)  return { text: 'Betald',  cls: 'text-brand-forest font-medium' }
  if (p.paid === false) return { text: 'Obetald', cls: 'text-red-600 font-medium' }
  return { text: '—', cls: 'text-slate-400' }
}

export function CourseDetailPanel({ event, onClose }: CourseDetailPanelProps) {
  const { data: bookings = [], isLoading } = useEventBookings(event?.id ?? null)

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-200 ${event ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col transition-transform duration-300 ${event ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-xs font-medium text-brand-forest uppercase tracking-wide mb-1">
              {event?.primaryEventGroup?.name ?? event?.category?.name ?? 'Kurs'}
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
              {event.statistics?.accepted ?? 0}
              {event.requirements?.maxParticipants
                ? ` / ${event.requirements.maxParticipants} platser`
                : ' anmälda'}
            </span>
          </div>
        )}

        {/* Participants */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-3 flex items-center justify-between sticky top-0 bg-white border-b border-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Anmälda deltagare
            </p>
            {!isLoading && (
              <span className="text-xs text-slate-400">{bookings.length} st</span>
            )}
          </div>

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
            <ul className="divide-y divide-slate-50">
              {bookings.map((b) => {
                const pay = payLabel(b)
                return (
                  <li key={b.key} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/60">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-dark truncate">
                        {b.participant?.name ?? '—'}
                      </p>
                      {b.status?.name && (
                        <p className="text-xs text-slate-400">{b.status.name}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right ml-4">
                      <p className={`text-xs ${pay.cls}`}>{pay.text}</p>
                      {b.payment?.priceAgreed != null && (
                        <p className="text-xs text-slate-400">
                          {b.payment.priceAgreed.toLocaleString('sv-SE')} {b.payment.currency ?? 'SEK'}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
