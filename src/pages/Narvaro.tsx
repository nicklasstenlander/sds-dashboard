import { useState, useEffect } from 'react'
import { CheckCircle, Circle, Search } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Participant {
  userKey:       string
  firstName:     string
  lastName:      string
  phone:         string
  personnummer:  string
  age:           number | null
}

interface CourseEvent {
  eventId:      string
  name:         string
  time:         string
  dayStr:       string
  instructors:  string
  place:        string
  participants: Participant[]
}

type Checkins = Record<string, Record<string, string>>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROXY = import.meta.env.VITE_PROXY_URL as string

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

const DAY_NAMES = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']

function dayLabel(i: number): { short: string; date: string } {
  const d = addDays(new Date(), i)
  return {
    short: i === 0 ? 'Idag' : DAY_NAMES[d.getDay()],
    date:  `${d.getDate()}/${d.getMonth() + 1}`,
  }
}

// ---------------------------------------------------------------------------
// ParticipantRow
// ---------------------------------------------------------------------------

function ParticipantRow({
  participant,
  checkinTime,
  onCheckin,
}: {
  participant:  Participant
  checkinTime:  string | undefined
  onCheckin:    () => void
}) {
  const checked = Boolean(checkinTime)
  return (
    <div
      onClick={onCheckin}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors rounded-xl ${
        checked ? 'bg-[#CDDCD1]' : 'hover:bg-slate-50'
      }`}
    >
      {checked
        ? <CheckCircle className="w-5 h-5 shrink-0 text-[#1e4025]" />
        : <Circle className="w-5 h-5 shrink-0 text-slate-300" />}
      <span className={`text-sm flex-1 font-medium ${checked ? 'text-[#1e4025]' : 'text-brand-dark'}`}>
        {participant.firstName} {participant.lastName}
      </span>
      <span className={`text-xs tabular-nums ${checked ? 'text-[#1e4025] font-semibold' : 'text-slate-400'}`}>
        {checkinTime ?? '–'}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EventCard
// ---------------------------------------------------------------------------

function EventCard({
  event,
  checkins,
  scanInput,
  onScanChange,
  onCheckin,
}: {
  event:        CourseEvent
  checkins:     Record<string, string>
  scanInput:    string
  onScanChange: (v: string) => void
  onCheckin:    (p: Participant) => void
}) {
  const presentCount = Object.keys(checkins).length
  const absentCount  = event.participants.length - presentCount

  // Ej incheckade först, sedan incheckade sorterade på tid
  const sorted = [...event.participants].sort((a, b) => {
    const aIn = Boolean(checkins[a.userKey])
    const bIn = Boolean(checkins[b.userKey])
    if (aIn !== bIn) return aIn ? 1 : -1
    return 0
  })

  function handleScanKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const q = scanInput.toLowerCase().replace(/[-\s]/g, '')
    if (!q) return
    const found = event.participants.find(p => {
      const name  = `${p.firstName} ${p.lastName}`.toLowerCase()
      const phone = p.phone.replace(/[-\s]/g, '')
      const pnr   = p.personnummer.replace(/[-\s]/g, '')
      return name.includes(q) || phone.includes(q) || pnr.includes(q)
    })
    if (found) {
      onCheckin(found)
      onScanChange('')
    }
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-50 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-brand-dark">{event.name}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {event.time}{event.place ? ` · ${event.place}` : ''}{event.instructors ? ` · ${event.instructors}` : ''}
          </p>
        </div>
        {/* Stats */}
        <div className="flex items-center gap-3 text-xs shrink-0">
          <span className="text-slate-400">
            <span className="font-semibold text-brand-dark">{event.participants.length}</span> anmälda
          </span>
          <span className="text-[#1e4025]">
            <span className="font-semibold">{presentCount}</span> incheckade
          </span>
          {absentCount > 0 && (
            <span className="text-slate-400">
              <span className="font-semibold text-slate-500">{absentCount}</span> ej ankomna
            </span>
          )}
        </div>
      </div>

      {/* Scan / quick search */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Namn / personnr / telefon… (Enter för att checka in)"
            value={scanInput}
            onChange={e => onScanChange(e.target.value)}
            onKeyDown={handleScanKey}
            className="w-full text-sm border border-slate-200 rounded-full pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-mint"
          />
        </div>
      </div>

      {/* Participant list */}
      <div className="px-4 pb-4 space-y-1">
        {sorted.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">Inga deltagare</p>
        ) : sorted.map(p => (
          <ParticipantRow
            key={p.userKey}
            participant={p}
            checkinTime={checkins[p.userKey]}
            onCheckin={() => onCheckin(p)}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Narvaro() {
  const [selectedDay, setSelectedDay]     = useState<string>(toDateStr(new Date()))
  const [events, setEvents]               = useState<CourseEvent[]>([])
  const [checkins, setCheckins]           = useState<Checkins>({})
  const [teacherFilter, setTeacherFilter] = useState<string>('')
  const [teachers, setTeachers]           = useState<string[]>([])
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [scanInputs, setScanInputs]       = useState<Record<string, string>>({})

  useEffect(() => {
    loadEvents(selectedDay)
  }, [selectedDay])

  async function loadEvents(date: string) {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`${PROXY}?action=events_by_date&date=${date}`)
      const raw  = await res.json()
      const data: CourseEvent[] = Array.isArray(raw) ? raw : (raw.events ?? raw.data ?? [])
      setEvents(data)

      const names = new Set<string>()
      data.forEach(evt => {
        evt.instructors?.split(',').forEach(n => {
          const t = n.trim()
          if (t) names.add(t)
        })
      })
      setTeachers([...names].sort())
    } catch {
      setError('Kunde inte hämta klasser.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCheckin(eventId: string, participant: Participant) {
    const already = checkins[eventId]?.[participant.userKey]
    if (already) {
      setCheckins(prev => {
        const next = { ...prev, [eventId]: { ...prev[eventId] } }
        delete next[eventId][participant.userKey]
        return next
      })
      return
    }

    try {
      const url  = `${PROXY}?action=checkin&eventId=${encodeURIComponent(eventId)}&checkinString=${encodeURIComponent(participant.userKey)}`
      const res  = await fetch(url)
      const data = await res.json()

      if (data.ok) {
        const time = new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
        setCheckins(prev => ({
          ...prev,
          [eventId]: { ...(prev[eventId] ?? {}), [participant.userKey]: time },
        }))
      }
    } catch {
      // silent — nätverksfel påverkar inte UI
    }
  }

  const filteredEvents = teacherFilter
    ? events.filter(evt =>
        evt.instructors?.toLowerCase().includes(teacherFilter.toLowerCase())
      )
    : events

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-brand-dark">Närvaro</h1>

        {teachers.length > 0 && (
          <select
            value={teacherFilter}
            onChange={e => setTeacherFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-full px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-mint min-w-[180px]"
          >
            <option value="">Alla klasser</option>
            {teachers.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {/* Day navigation */}
      <div className="flex gap-2 flex-wrap">
        {[0, 1, 2, 3, 4, 5, 6].map(i => {
          const dayStr = toDateStr(addDays(new Date(), i))
          const { short, date } = dayLabel(i)
          const active = selectedDay === dayStr
          return (
            <button
              key={i}
              onClick={() => setSelectedDay(dayStr)}
              className={`text-sm px-4 py-1.5 rounded-full border transition-colors font-medium ${
                active
                  ? 'bg-[#1e4025] text-white border-[#1e4025]'
                  : 'border-slate-200 text-slate-500 hover:border-[#1e4025] hover:text-[#1e4025]'
              }`}
            >
              {short} <span className={`text-xs ${active ? 'opacity-80' : 'text-slate-400'}`}>{date}</span>
            </button>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="card p-5 space-y-3">
              <div className="h-5 w-40 bg-slate-100 rounded animate-pulse" />
              {[1, 2, 3, 4].map(j => (
                <div key={j} className="h-10 bg-slate-50 rounded-xl animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="card flex items-center justify-center py-20">
          <p className="text-sm text-slate-400">
            {events.length === 0 ? 'Inga klasser för detta datum.' : 'Inga klasser för vald lärare.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEvents.map(evt => (
            <EventCard
              key={evt.eventId}
              event={evt}
              checkins={checkins[evt.eventId] ?? {}}
              scanInput={scanInputs[evt.eventId] ?? ''}
              onScanChange={v => setScanInputs(prev => ({ ...prev, [evt.eventId]: v }))}
              onCheckin={p => handleCheckin(evt.eventId, p)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
