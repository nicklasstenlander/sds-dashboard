import { useState } from 'react'
import { PhoneCall, PhoneIncoming, PhoneMissed, MessageSquare, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useCalls } from '../hooks/useCalls'
import { AgentDial } from '../components/AgentDial'
import { SmsModal } from '../components/SmsModal'
import type { TelavoxCall } from '../services/telavoxService'
import type { AllDataResponse } from '../services/proxyService'
import type { Booking } from '../types/cogwork'

// ---------------------------------------------------------------------------
// Participant lookup
// ---------------------------------------------------------------------------

function normalize(n: string) {
  return n.replace(/[\s.\-()+]/g, '').replace(/^46/, '0')
}

interface ParticipantInfo { name: string; courses: string[] }

function lookupParticipant(phoneNumber: string, bookings: Booking[]): ParticipantInfo | null {
  const norm = normalize(phoneNumber)
  const match = bookings.find(b =>
    (b.participant as { telephoneNumbers?: { telephoneNumber: string }[] })
      .telephoneNumbers?.some(t => normalize(t.telephoneNumber) === norm)
  )
  if (!match) return null
  const courses = bookings
    .filter(b => b.participant?.key === match.participant?.key)
    .map(b => b.event?.name ?? '')
    .filter(Boolean)
  return { name: match.participant?.name ?? '', courses: [...new Set(courses)] }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(datetime: string): string {
  return datetime.slice(11, 16) // "HH:mm"
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return 'Missat'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function yesterday() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

// ---------------------------------------------------------------------------
// CallRow
// ---------------------------------------------------------------------------

function CallRow({
  call, participant, onSms,
}: {
  call: TelavoxCall
  participant: ParticipantInfo | null
  onSms: (number: string) => void
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-brand-dark tabular-nums">{formatTime(call.datetime)}</span>
          {participant
            ? <span className="text-sm font-semibold text-brand-dark">{participant.name}</span>
            : <span className="text-sm text-slate-400">Okänt nummer</span>}
          <span className="text-xs text-slate-400">{call.number}</span>
        </div>
        {participant && participant.courses.length > 0 && (
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
            {participant.courses.join(', ')}
          </p>
        )}
        <p className={`text-xs mt-0.5 ${call.duration === 0 ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
          {formatDuration(call.duration)}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <AgentDial number={call.number} />
        <button
          onClick={() => onSms(call.number)}
          title="Skicka SMS"
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-brand-dark hover:bg-slate-100 transition-colors border border-slate-200"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>SMS</span>
        </button>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

function Section({
  title, icon, accent, calls, bookings, onSms, emptyText,
}: {
  title: string
  icon: React.ReactNode
  accent: string
  calls: TelavoxCall[]
  bookings: Booking[]
  onSms: (number: string) => void
  emptyText: string
}) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-2">
        <span className={accent}>{icon}</span>
        <h2 className="text-sm font-bold text-brand-dark">{title}</h2>
        <span className="text-xs text-slate-400 font-normal">({calls.length})</span>
      </div>
      {calls.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-400">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-slate-50">
          {calls.map((c, i) => (
            <CallRow
              key={`${c.datetime}-${i}`}
              call={c}
              participant={lookupParticipant(c.number, bookings)}
              onSms={onSms}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Calls() {
  const [date, setDate] = useState(today())
  const [smsNumber, setSmsNumber] = useState<string | null>(null)

  const { data, isLoading, isError, refetch, isFetching } = useCalls(date, date)

  // Hämta bokningar från cachen för namnuppslag — ingen extra API-request
  const queryClient = useQueryClient()
  const cachedAllData = queryClient.getQueryData<AllDataResponse>(['allData', ''])
  const bookings: Booking[] = cachedAllData?.bookings.bookings ?? []

  const missed   = data?.missed   ?? []
  const incoming = data?.incoming ?? []
  const outgoing = data?.outgoing ?? []

  function setPreset(preset: 'today' | 'yesterday') {
    setDate(preset === 'today' ? today() : yesterday())
  }

  const todayStr     = today()
  const yesterdayStr = yesterday()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-brand-dark">Samtal</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-dark px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Uppdatera</span>
        </button>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setPreset('today')}
          className={`text-sm px-4 py-1.5 rounded-full border transition-colors font-medium ${
            date === todayStr
              ? 'bg-brand-dark text-white border-brand-dark'
              : 'border-slate-200 text-slate-500 hover:border-brand-dark hover:text-brand-dark'
          }`}
        >
          Idag
        </button>
        <button
          onClick={() => setPreset('yesterday')}
          className={`text-sm px-4 py-1.5 rounded-full border transition-colors font-medium ${
            date === yesterdayStr
              ? 'bg-brand-dark text-white border-brand-dark'
              : 'border-slate-200 text-slate-500 hover:border-brand-dark hover:text-brand-dark'
          }`}
        >
          Igår
        </button>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="text-sm border border-slate-200 rounded-full px-4 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-mint"
        />
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-center justify-between">
          <span>Kunde inte hämta samtal från Telavox.</span>
          <button onClick={() => refetch()} className="text-xs underline">Försök igen</button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-5 space-y-3">
              <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
              {[1, 2, 3].map(j => (
                <div key={j} className="h-10 bg-slate-50 rounded animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Section title="Missade"    icon={<PhoneMissed className="w-4 h-4" />}   accent="text-red-500"       calls={missed}   bookings={bookings} onSms={setSmsNumber} emptyText="Inga missade samtal"    />
          <Section title="Inkommande" icon={<PhoneIncoming className="w-4 h-4" />} accent="text-brand-forest" calls={incoming} bookings={bookings} onSms={setSmsNumber} emptyText="Inga inkommande samtal" />
          <Section title="Utgående"   icon={<PhoneCall className="w-4 h-4" />}     accent="text-slate-400"    calls={outgoing} bookings={bookings} onSms={setSmsNumber} emptyText="Inga utgående samtal"   />
        </div>
      )}

      <SmsModal
        isOpen={Boolean(smsNumber)}
        onClose={() => setSmsNumber(null)}
        recipientName={smsNumber ?? ''}
        recipientNumber={smsNumber ?? ''}
      />
    </div>
  )
}
