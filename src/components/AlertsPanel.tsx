import { useState } from 'react'
import { X } from 'lucide-react'
import { ParticipantPanel } from './ParticipantPanel'
import type { Alert, AlertType } from '../hooks/useAlerts'

function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      <div className="flex-1 h-px bg-slate-100" />
      <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">{label} ({count})</span>
      <div className="flex-1 h-px bg-slate-100" />
    </li>
  )
}

function AlertBadge({ type }: { type: AlertType }) {
  if (type === 'pending') {
    return (
      <span className="shrink-0 text-xs font-semibold px-3 py-1 rounded-full bg-sky-100 text-sky-700 whitespace-nowrap">
        Manuell check
      </span>
    )
  }
  return (
    <span className="shrink-0 text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
      Dubbelanmäld
    </span>
  )
}

function AlertRow({
  alert,
  onSelectName,
}: {
  alert: Alert
  onSelectName: (name: string) => void
}) {
  const { booking, type, count } = alert
  const name     = booking.participant?.name ?? ''
  const parts    = name.trim().split(' ')
  const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'

  return (
    <li>
      <button
        onClick={() => name && onSelectName(name)}
        className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors w-full text-left"
      >
        <div className="w-8 h-8 rounded-full bg-brand-teal flex items-center justify-center text-white text-xs font-semibold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-brand-dark">{name || '—'}</p>
          {booking.event?.name && (
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{booking.event.name}</p>
          )}
          {type === 'duplicate' && (
            <p className="text-xs text-slate-400 mt-0.5">
              Anmäld till {count} {count === 1 ? 'kurs' : 'kurser'}
            </p>
          )}
          {booking.participant?.id && (
            <a
              href={`https://dans.se/admin/addressbook/person/?personId=${booking.participant.id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs text-brand-forest hover:underline mt-0.5 inline-block"
            >
              Gå till anmälan på Dans.se →
            </a>
          )}
        </div>
        <AlertBadge type={type} />
      </button>
    </li>
  )
}

interface AlertsPanelProps {
  open: boolean
  alerts: Alert[]
  onClose: () => void
}

export function AlertsPanel({ open, alerts, onClose }: AlertsPanelProps) {
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const pending    = alerts.filter(a => a.type === 'pending')
  const duplicates = alerts.filter(a => a.type === 'duplicate')

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl transition-transform duration-300 ease-out md:inset-x-auto md:bottom-auto md:right-0 md:top-0 md:h-full md:max-h-none md:max-w-md md:rounded-none ${
          open ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'
        }`}
      >
        <div className="mx-auto mt-3 h-1 w-11 rounded-full bg-slate-200 md:hidden" />
        <div className="flex items-center justify-between gap-4 p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-brand-dark">Väntar återkoppling</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {alerts.length > 0 ? `${alerts.length} ${alerts.length === 1 ? 'ärende' : 'ärenden'} kräver åtgärd` : 'Inga ärenden'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-6">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <span className="text-3xl">🎉</span>
              <p className="text-sm font-medium text-brand-forest dark:text-[var(--dark-positive)]">Inga ärenden just nu</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {pending.length > 0 && (
                <>
                  <SectionDivider label="Behöver manuell check" count={pending.length} />
                  {pending.map(a => (
                    <AlertRow key={a.booking.key} alert={a} onSelectName={setSelectedName} />
                  ))}
                </>
              )}
              {duplicates.length > 0 && (
                <>
                  <SectionDivider label="Dubbelanmälda" count={duplicates.length} />
                  {duplicates.map(a => (
                    <AlertRow key={a.booking.key} alert={a} onSelectName={setSelectedName} />
                  ))}
                </>
              )}
            </ul>
          )}
        </div>
      </div>

      <ParticipantPanel name={selectedName} onClose={() => setSelectedName(null)} elevated />
    </>
  )
}
