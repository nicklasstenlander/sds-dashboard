import { useState, useEffect } from 'react'
import { Search, Mail, Phone, MapPin, Calendar, Hash, User, BookOpen } from 'lucide-react'
import { useUsers } from '../hooks/useUsers'
import { useUserBookings } from '../hooks/useUserBookings'
import { useApiConfig } from '../context/ApiContext'
import type { User as UserType } from '../types/cogwork'

export function Customers() {
  const { config } = useApiConfig()
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<UserType | null>(null)

  // Debounce: fire search 400 ms after user stops typing
  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 400)
    return () => clearTimeout(t)
  }, [input])

  const { data: users = [], isLoading, isFetching } = useUsers(query)

  if (!config.pw) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-mintLight flex items-center justify-center mb-4 text-2xl">
          🔒
        </div>
        <p className="font-bold text-brand-dark text-lg">API-nyckel krävs</p>
        <p className="text-sm text-slate-500 mt-1 font-light max-w-xs">
          Kunddata kräver autentisering. Lägg till din API-nyckel i inställningarna.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-dark">Kunder</h1>

      <div className="flex gap-4 items-start flex-col lg:flex-row">
        {/* Left — search + results */}
        <div className="w-full lg:w-80 shrink-0 space-y-3">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              placeholder="Sök namn, e-post, adress…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-full pl-9 pr-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-mint"
            />
            {isFetching && (
              <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-brand-mint border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {/* Results list */}
          {query.trim().length >= 2 && (
            <div className="card overflow-hidden">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-3 items-center">
                      <div className="w-8 h-8 rounded-full bg-slate-100 animate-pulse shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
                        <div className="h-3 w-24 bg-slate-100 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : users.length === 0 ? (
                <p className="p-4 text-sm text-slate-400 text-center">Inga kunder hittades</p>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {users.map((u) => (
                    <li key={u.key}>
                      <button
                        onClick={() => setSelected(u)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-mint transition-colors ${selected?.key === u.key ? 'bg-brand-mint' : ''}`}
                      >
                        <Avatar user={u} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-brand-dark truncate">{u.name}</p>
                          {u.emails?.[0] && (
                            <p className="text-xs text-slate-400 truncate">{u.emails[0].email}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {query.trim().length < 2 && input.length === 0 && (
            <p className="text-xs text-slate-400 pl-1">Skriv minst 2 tecken för att söka.</p>
          )}
        </div>

        {/* Right — detail card */}
        <div className="flex-1 min-w-0">
          {selected ? (
            <UserCard user={selected} />
          ) : (
            <div className="card flex flex-col items-center justify-center py-20 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <User className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm text-slate-400">Välj en kund i listan för att se detaljer</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Avatar({ user, size = 'md' }: { user: UserType; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'w-16 h-16 text-xl' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  if (user.thumb?.url) {
    return <img src={user.thumb.url} alt={user.name} className={`${cls} rounded-full object-cover border border-slate-100 shrink-0`} />
  }
  const initials = (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '') || user.name[0]
  return (
    <div className={`${cls} rounded-full bg-brand-mintLight flex items-center justify-center font-semibold text-brand-forest shrink-0`}>
      {initials.toUpperCase()}
    </div>
  )
}

function UserCard({ user }: { user: UserType }) {
  const { data: bookings = [], isLoading: bookingsLoading } = useUserBookings(user.id)

  // Deduplicate by event name (a person can have multiple bookings for the same course)
  const courses = bookings.reduce<{ name: string; period: string; status: string }[]>((acc, b) => {
    const name = b.event?.name
    if (!name || acc.some((c) => c.name === name)) return acc
    acc.push({
      name,
      period: b.event?.grouping?.eventBlock?.name ?? '',
      status: b.status?.name ?? '',
    })
    return acc
  }, [])

  return (
    <div className="card divide-y divide-slate-100">
      {/* Header */}
      <div className="p-6 flex items-center gap-4">
        <Avatar user={user} size="lg" />
        <div>
          <h2 className="text-lg font-bold text-brand-dark">{user.name}</h2>
          {user.isMember && (
            <span className="inline-block text-xs font-medium bg-brand-mint text-brand-forest px-2 py-0.5 rounded-full mt-1">
              Medlem
            </span>
          )}
        </div>
      </div>

      {/* Contact details */}
      <div className="p-6">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {user.dateOfBirth && (
            <DetailRow icon={<Calendar className="w-4 h-4" />} label="Födelsedag">
              {formatDate(user.dateOfBirth)}
            </DetailRow>
          )}
          {user.membershipNumber && (
            <DetailRow icon={<Hash className="w-4 h-4" />} label="Medlemsnr">
              {user.membershipNumber}
            </DetailRow>
          )}
          {user.emails?.map((e, i) => (
            <DetailRow key={i} icon={<Mail className="w-4 h-4" />} label="E-post">
              <a href={`mailto:${e.email}`} className="text-brand-forest hover:underline break-all">
                {e.email}
              </a>
            </DetailRow>
          ))}
          {user.telephoneNumbers?.map((t, i) => (
            <DetailRow key={i} icon={<Phone className="w-4 h-4" />} label={t.type ?? 'Telefon'}>
              <a href={`tel:${t.telephoneNumber}`} className="text-brand-forest hover:underline">
                {t.telephoneNumber}
              </a>
            </DetailRow>
          ))}
          {user.addresses?.map((a, i) => (
            <DetailRow key={i} icon={<MapPin className="w-4 h-4" />} label="Adress">
              <span className="whitespace-pre-line">
                {[a.careOf, a.streetAddress, `${a.postalCode ?? ''} ${a.city ?? ''}`.trim(), a.country !== 'SE' ? a.country : '']
                  .filter(Boolean)
                  .join('\n')}
              </span>
            </DetailRow>
          ))}
        </dl>
      </div>

      {/* Courses */}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-slate-400" />
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Anmälda kurser
          </p>
          {!bookingsLoading && (
            <span className="text-xs text-slate-400">{courses.length} st</span>
          )}
        </div>

        {bookingsLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <p className="text-sm text-slate-400">Inga kursanmälningar hittades.</p>
        ) : (
          <ul className="space-y-2">
            {courses.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-3 bg-slate-50/60 rounded-lg px-3 py-2.5">
                <p className="text-sm font-medium text-brand-dark leading-snug">{c.name}</p>
                <div className="shrink-0 text-right space-y-0.5">
                  {c.period && <p className="text-xs text-slate-400">{c.period}</p>}
                  {c.status && <p className="text-xs text-slate-500">{c.status}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
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
  const [y, m, d] = iso.split('-')
  return `${d}/${m} ${y}`
}
