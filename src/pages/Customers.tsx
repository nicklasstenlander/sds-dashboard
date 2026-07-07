import { useState, useEffect, useMemo } from 'react'
import { Search, Mail, Phone, MapPin, Calendar, Hash, User, BookOpen, MessageSquare } from 'lucide-react'
import { useUsers } from '../hooks/useUsers'
import { useUserBookings } from '../hooks/useUserBookings'
import { useAllTermsBookings } from '../hooks/useAllTermsBookings'
import { useApiConfig } from '../context/ApiContext'
import { AgentDial } from '../components/AgentDial'
import { ParticipantPanel } from '../components/ParticipantPanel'
import { SmsModal } from '../components/SmsModal'
import { EVENT_BLOCK_IDS_BY_CODE, getDefaultEventBlockId } from '../config/cogwork'
import { formatBookingStatus } from '../lib/status'
import { blockNameToCode, dateToPeriodCode } from '../utils/periods'
import { isStatisticalBooking } from '../utils/courseMetrics'
import type { Booking, User as UserType } from '../types/cogwork'

interface MissingBookingCustomer {
  key: string
  name: string
  course: string
  date: string
  time: string
  term: string
  sortValue: string
}

export function Customers() {
  const { config } = useApiConfig()
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<UserType | null>(null)
  const [selectedFollowUpName, setSelectedFollowUpName] = useState<string | null>(null)

  // Debounce: fire search 400 ms after user stops typing
  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 400)
    return () => clearTimeout(t)
  }, [input])

  const { data: users = [], isLoading, isFetching } = useUsers(query)
  const { bookings: allTermBookings, isLoading: followUpLoading } = useAllTermsBookings()
  const currentPeriodCode = useMemo(() => {
    const defaultBlockId = getDefaultEventBlockId()
    return Object.entries(EVENT_BLOCK_IDS_BY_CODE)
      .find(([, id]) => id === defaultBlockId)?.[0] ?? ''
  }, [])
  const missingBookingCustomers = useMemo(
    () => buildMissingBookingCustomers(allTermBookings, currentPeriodCode),
    [allTermBookings, currentPeriodCode],
  )

  if (!config.pw) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-pinkLight flex items-center justify-center mb-4 text-2xl">
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
                        className={`group w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${selected?.key === u.key ? 'bg-brand-mint' : 'bg-white hover:bg-brand-mint'}`}
                      >
                        <Avatar user={u} size="sm" active={selected?.key === u.key} />
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

      <MissingBookingCustomersCard
        customers={missingBookingCustomers}
        currentPeriodCode={currentPeriodCode}
        loading={followUpLoading}
        onSelectName={setSelectedFollowUpName}
      />

      <ParticipantPanel
        name={selectedFollowUpName}
        onClose={() => setSelectedFollowUpName(null)}
      />
    </div>
  )
}

function MissingBookingCustomersCard({
  customers,
  currentPeriodCode,
  loading,
  onSelectName,
}: {
  customers: MissingBookingCustomer[]
  currentPeriodCode: string
  loading: boolean
  onSelectName: (name: string) => void
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-brand-dark">Kunder utan ny kursbokning</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {currentPeriodCode
              ? `Tidigare kurskunder som saknar bokning ${currentPeriodCode}`
              : 'Tidigare kurskunder som saknar bokning i aktuell termin'}
          </p>
        </div>
        {!loading && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
            {customers.length.toLocaleString('sv-SE')} kunder
          </span>
        )}
      </div>

      {loading ? (
        <div className="divide-y divide-slate-50">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-3 flex gap-4">
              <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
              <div className="h-4 flex-1 bg-slate-100 rounded animate-pulse" />
              <div className="h-4 w-20 bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : customers.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-400 text-center">
          Inga tidigare kurskunder saknar ny kursbokning.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50/60 border-b border-slate-100">
              <tr>
                <CustomerTh>Namn</CustomerTh>
                <CustomerTh>Kurs</CustomerTh>
                <CustomerTh>Datum</CustomerTh>
                <CustomerTh>Tid</CustomerTh>
                <CustomerTh>Termin</CustomerTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {customers.map((customer) => (
                <tr key={customer.key} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 px-5 text-sm font-medium whitespace-nowrap">
                    <button
                      onClick={() => onSelectName(customer.name)}
                      className="text-brand-dark hover:text-brand-forest hover:underline text-left"
                    >
                      {customer.name}
                    </button>
                  </td>
                  <td className="py-3 px-5 text-sm text-slate-700 min-w-[240px]">
                    <span className="line-clamp-1" title={customer.course}>{customer.course}</span>
                  </td>
                  <td className="py-3 px-5 text-sm text-slate-500 whitespace-nowrap">{customer.date || '—'}</td>
                  <td className="py-3 px-5 text-sm text-slate-500 whitespace-nowrap">{customer.time || '—'}</td>
                  <td className="py-3 px-5 text-sm text-slate-500 whitespace-nowrap">{customer.term || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CustomerTh({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-xs font-semibold text-slate-600 py-3 px-5 whitespace-nowrap">
      {children}
    </th>
  )
}

function buildMissingBookingCustomers(bookings: Booking[], currentPeriodCode: string): MissingBookingCustomer[] {
  if (!currentPeriodCode) return []

  const courseBookings = bookings
    .filter(isStatisticalBooking)
    .filter((booking) => booking.participant?.name && booking.event?.name)

  const currentParticipantKeys = new Set<string>()
  for (const booking of courseBookings) {
    if (bookingPeriodCode(booking) !== currentPeriodCode) continue
    participantKeys(booking).forEach((key) => currentParticipantKeys.add(key))
  }

  const latestPreviousByParticipant = new Map<string, MissingBookingCustomer>()
  for (const booking of courseBookings) {
    const periodCode = bookingPeriodCode(booking)
    if (!periodCode || periodCode === currentPeriodCode || periodRank(periodCode) >= periodRank(currentPeriodCode)) continue

    const keys = participantKeys(booking)
    if (keys.some((key) => currentParticipantKeys.has(key))) continue

    const primaryKey = keys[0]
    if (!primaryKey) continue

    const candidate = missingBookingCustomerFromBooking(booking, primaryKey)
    if (!candidate.name || !candidate.course) continue

    const existing = latestPreviousByParticipant.get(primaryKey)
    if (!existing || candidate.sortValue > existing.sortValue) {
      latestPreviousByParticipant.set(primaryKey, candidate)
    }
  }

  return Array.from(latestPreviousByParticipant.values())
    .sort((a, b) => b.sortValue.localeCompare(a.sortValue) || a.name.localeCompare(b.name, 'sv'))
}

function missingBookingCustomerFromBooking(booking: Booking, participantKey: string): MissingBookingCustomer {
  const startDateTime = booking.event?.startDateTime ?? ''
  const startDate = booking.event?.startDate ?? startDateTime.slice(0, 10)
  const startTime = booking.event?.startTime ?? startDateTime.slice(11, 16)
  const periodName = booking.event?.grouping?.eventBlock?.name ?? bookingPeriodCode(booking)

  return {
    key: participantKey,
    name: booking.participant?.name ?? '',
    course: booking.event?.name ?? '',
    date: startDate ? formatCourseDate(startDate) : '',
    time: startTime,
    term: formatTerm(periodName),
    sortValue: startDateTime || startDate || booking.created || '',
  }
}

function participantKeys(booking: Booking): string[] {
  const keys = [
    participantNameAndBirthKey(booking),
    booking.participant?.key,
    booking.participant?.id != null ? `id:${booking.participant.id}` : '',
    participantNameKey(booking),
  ].filter((key): key is string => Boolean(key))
  return Array.from(new Set(keys))
}

function participantNameAndBirthKey(booking: Booking): string {
  const name = booking.participant?.name?.trim().toLowerCase()
  const dateOfBirth = booking.participant?.dateOfBirth
  return name && dateOfBirth ? `name-birth:${name}|${dateOfBirth}` : ''
}

function participantNameKey(booking: Booking): string {
  const name = booking.participant?.name?.trim().toLowerCase()
  return name ? `name:${name}` : ''
}

function bookingPeriodCode(booking: Booking): string {
  const blockName = booking.event?.grouping?.eventBlock?.name
  if (blockName) return blockNameToCode(blockName)
  const eventCode = booking.event?.code
  if (eventCode && /^(HT|VT)\d{2}$/i.test(eventCode)) return eventCode.toUpperCase()
  return dateToPeriodCode(booking.event?.startDate ?? booking.event?.startDateTime)
}

function formatCourseDate(date: string) {
  const [y, m, d] = date.split('-')
  if (!y || !m || !d) return date
  return `${d}/${m} ${y}`
}

function periodRank(periodCode: string): number {
  const match = periodCode.match(/^(HT|VT)(\d{2})$/i)
  if (!match) return 0
  return Number(match[2]) * 2 + (match[1].toUpperCase() === 'HT' ? 1 : 0)
}

function Avatar({ user, size = 'md', active = false }: { user: UserType; size?: 'sm' | 'md' | 'lg'; active?: boolean }) {
  const cls = size === 'lg' ? 'w-16 h-16 text-xl' : size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  if (user.thumb?.url) {
    return <img src={user.thumb.url} alt={user.name} className={`${cls} rounded-full object-cover border border-slate-100 shrink-0`} />
  }
  const initials = (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '') || user.name[0]
  const listItem = size === 'sm'
  return (
    <div className={`${cls} rounded-full flex items-center justify-center font-semibold shrink-0 transition-colors ${
      listItem
        ? active
          ? 'bg-[#45aba5] text-white'
          : 'bg-[#45aba5] text-white group-hover:bg-white group-hover:text-[#45aba5]'
        : 'bg-[#45aba5] text-white'
    }`}>
      {initials.toUpperCase()}
    </div>
  )
}

function UserCard({ user }: { user: UserType }) {
  const { data: bookings = [], isLoading: bookingsLoading } = useUserBookings(user.id)
  const [smsTarget, setSmsTarget] = useState<{ number: string } | null>(null)

  // Deduplicate by event name (a person can have multiple bookings for the same course)
  const courses = bookings.reduce<{ name: string; period: string; status: string }[]>((acc, b) => {
    const name = b.event?.name
    if (!name || acc.some((c) => c.name === name)) return acc
    acc.push({
      name,
      period: b.event?.grouping?.eventBlock?.name ?? '',
      status: formatBookingStatus(b.status?.code, b.status?.name),
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
              {formatDate(user.dateOfBirth)}{' '}
              <span className="text-slate-400">({calcAge(user.dateOfBirth)} år)</span>
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
              <div className="flex items-center gap-2 flex-wrap">
                <a href={`tel:${t.telephoneNumber}`} className="text-brand-forest hover:underline">
                  {t.telephoneNumber}
                </a>
                <AgentDial number={t.telephoneNumber} />
                <button
                  onClick={() => setSmsTarget({ number: t.telephoneNumber })}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-slate-400 hover:text-brand-dark hover:bg-slate-100 transition-colors border border-slate-200"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>SMS</span>
                </button>
              </div>
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
                  {c.period && <p className="text-xs text-slate-400">{formatTerm(c.period)}</p>}
                  {c.status && <p className="text-xs text-slate-500">{c.status}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SmsModal
        isOpen={Boolean(smsTarget)}
        onClose={() => setSmsTarget(null)}
        recipientName={user.name}
        recipientNumber={smsTarget?.number ?? ''}
      />
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

function formatTerm(period: string) {
  const lower = period.toLowerCase()
  const prefix = lower.includes('höst') ? 'HT' : lower.includes('vår') ? 'VT' : null
  const year = period.match(/\d{4}/)?.[0]
  if (prefix && year) return `${prefix}${year.slice(2)}`
  return period
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m} ${y}`
}

function calcAge(iso: string) {
  const today = new Date()
  const birth = new Date(iso)
  let age = today.getFullYear() - birth.getFullYear()
  const hasHadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
  if (!hasHadBirthday) age--
  return age
}
