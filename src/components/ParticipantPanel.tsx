import { X, Mail, Phone, MapPin, Calendar, Hash, BookOpen } from 'lucide-react'
import { useUser } from '../hooks/useUser'
import { useUserBookings } from '../hooks/useUserBookings'

interface ParticipantPanelProps {
  name: string | null
  onClose: () => void
  /** Render at higher z-index when stacked on top of another panel */
  elevated?: boolean
}

export function ParticipantPanel({ name, onClose, elevated }: ParticipantPanelProps) {
  const { data: user, isLoading, isError } = useUser(name)
  const { data: userBookings = [] } = useUserBookings(user?.id ?? null)
  const open = Boolean(name)
  const backdropZ = elevated ? 'z-[60]' : 'z-40'
  const panelZ    = elevated ? 'z-[70]' : 'z-50'

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 ${backdropZ} transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-sm bg-white shadow-xl ${panelZ} flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-xs font-medium text-brand-forest uppercase tracking-wide mb-1">Deltagare</p>
            <h2 className="text-base font-bold text-brand-dark leading-snug">{name ?? ''}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading && (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 items-center">
                  <div className="w-4 h-4 bg-slate-100 rounded animate-pulse shrink-0" />
                  <div className="h-4 bg-slate-100 rounded animate-pulse flex-1" />
                </div>
              ))}
            </div>
          )}

          {isError && (
            <p className="text-sm text-red-600">Kunde inte hämta kontaktuppgifter.</p>
          )}

          {!isLoading && !isError && !user && (
            <p className="text-sm text-slate-400">Ingen användare hittades.</p>
          )}

          {user && (
            <div className="space-y-5">
              {/* Avatar + name */}
              {user.thumb?.url && (
                <div className="flex justify-center">
                  <img
                    src={user.thumb.url}
                    alt={user.name}
                    className="w-20 h-20 rounded-full object-cover border border-slate-100"
                  />
                </div>
              )}

              <dl className="space-y-3">
                {user.dateOfBirth && (
                  <Row icon={<Calendar className="w-4 h-4" />} label="Födelsedag">
                    {formatDate(user.dateOfBirth)}
                  </Row>
                )}

                {user.emails?.map((e, i) => (
                  <Row key={i} icon={<Mail className="w-4 h-4" />} label="E-post">
                    <a href={`mailto:${e.email}`} className="text-brand-forest hover:underline">
                      {e.email}
                    </a>
                  </Row>
                ))}

                {user.telephoneNumbers?.map((t, i) => (
                  <Row key={i} icon={<Phone className="w-4 h-4" />} label={t.type ?? 'Telefon'}>
                    <a href={`tel:${t.telephoneNumber}`} className="text-brand-forest hover:underline">
                      {t.telephoneNumber}
                    </a>
                  </Row>
                ))}

                {user.addresses?.map((a, i) => (
                  <Row key={i} icon={<MapPin className="w-4 h-4" />} label="Adress">
                    <span className="whitespace-pre-line">
                      {[a.careOf, a.streetAddress, `${a.postalCode ?? ''} ${a.city ?? ''}`.trim(), a.country !== 'SE' ? a.country : '']
                        .filter(Boolean)
                        .join('\n')}
                    </span>
                  </Row>
                ))}

                {user.membershipNumber && (
                  <Row icon={<Hash className="w-4 h-4" />} label="Medlemsnr">
                    {user.membershipNumber}
                  </Row>
                )}
              </dl>

              {userBookings.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="w-4 h-4 text-slate-400" />
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Kurser</p>
                  </div>
                  <ul className="space-y-2">
                    {userBookings
                      .sort((a, b) => b.created.localeCompare(a.created))
                      .map((b) => (
                        <li key={b.key} className="rounded-xl bg-slate-50 px-3 py-2">
                          <p className="text-sm font-medium text-brand-dark leading-snug">
                            {b.event?.name ?? '—'}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {b.event?.grouping?.eventBlock?.name && (
                              <span className="text-xs text-brand-forest font-medium">
                                {b.event.grouping.eventBlock.name}
                              </span>
                            )}
                            {b.status?.name && (
                              <span className="text-xs text-slate-400">{b.status.name}</span>
                            )}
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 text-slate-400 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <div className="text-sm text-brand-dark">{children}</div>
      </div>
    </div>
  )
}

function formatDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m} ${y}`
}
