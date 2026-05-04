import { useState, useEffect, useRef, useCallback } from 'react'
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

interface ToastState {
  message: string
  error:   boolean
  key:     number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NARVARO_URL = (import.meta.env.VITE_NARVARO_URL as string | undefined)
  ?? 'https://script.google.com/macros/s/AKfycbx-euNjfAQaEfgA2xpkmhYUgpxUOI29cw0GF3-aLRkLowr4-U40HGdXyKgQPyFOCtyo/exec'

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

const REFRESH_MS = 60 * 1000

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null
  return (
    <div
      key={toast.key}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full text-sm font-medium shadow-lg whitespace-nowrap
        ${toast.error
          ? 'bg-red-700 text-white border-l-4 border-red-400'
          : 'bg-[#1e4025] text-white border-l-4 border-[#dd5c86]'
        }`}
      style={{ animation: 'toast-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
    >
      {toast.message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ParticipantRow
// ---------------------------------------------------------------------------

function ParticipantRow({
  participant,
  checkinTime,
  rowId,
  onCheckin,
}: {
  participant:  Participant
  checkinTime:  string | undefined
  rowId:        string
  onCheckin:    () => void
}) {
  const checked = Boolean(checkinTime)
  return (
    <div
      id={rowId}
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
      {participant.phone && (
        <span className="text-xs text-slate-400 hidden sm:inline">{participant.phone}</span>
      )}
      <span className={`text-xs tabular-nums shrink-0 ${checked ? 'text-[#1e4025] font-semibold' : 'text-slate-400'}`}>
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
  scanError,
  onScanChange,
  onCheckin,
  onScan,
}: {
  event:        CourseEvent
  checkins:     Record<string, string>
  scanInput:    string
  scanError:    boolean
  onScanChange: (v: string) => void
  onCheckin:    (p: Participant) => void
  onScan:       (eventId: string, query: string) => void
}) {
  const presentCount = Object.keys(checkins).length
  const absentCount  = event.participants.length - presentCount

  const sorted = [...event.participants].sort((a, b) => {
    const aIn = Boolean(checkins[a.userKey])
    const bIn = Boolean(checkins[b.userKey])
    if (aIn !== bIn) return aIn ? 1 : -1
    return 0
  })

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

      {/* Scan */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Namn / personnr / telefon… (Enter för att checka in)"
            value={scanInput}
            onChange={e => onScanChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onScan(event.eventId, scanInput)}
            className={`w-full text-sm border rounded-full pl-9 pr-4 py-2 focus:outline-none focus:ring-2 transition-colors
              ${scanError
                ? 'border-red-400 focus:ring-red-200'
                : 'border-slate-200 focus:ring-brand-mint'
              }`}
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
            rowId={`row-${event.eventId}-${p.userKey}`}
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
  const [scanErrors, setScanErrors]       = useState<Record<string, boolean>>({})
  const [toast, setToast]                 = useState<ToastState | null>(null)
  const toastTimer                        = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---------------------------------------------------------------------------
  // Toast helper
  // ---------------------------------------------------------------------------
  function showToast(message: string, error = false) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ message, error, key: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }

  // ---------------------------------------------------------------------------
  // Load events (preserves existing checkins)
  // ---------------------------------------------------------------------------
  const loadEvents = useCallback(async (date: string) => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`${NARVARO_URL}?action=events_by_date&date=${date}`)
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
  }, [])

  // Initial load + day change
  useEffect(() => {
    loadEvents(selectedDay)
  }, [selectedDay, loadEvents])

  // Auto-refresh every 60 s (preserves checkins, just refreshes event/participant list)
  useEffect(() => {
    const id = setInterval(() => loadEvents(selectedDay), REFRESH_MS)
    return () => clearInterval(id)
  }, [selectedDay, loadEvents])

  // ---------------------------------------------------------------------------
  // Check-in / undo
  // ---------------------------------------------------------------------------
  async function handleCheckin(eventId: string, participant: Participant) {
    const name    = `${participant.firstName} ${participant.lastName}`
    const already = checkins[eventId]?.[participant.userKey]

    if (already) {
      setCheckins(prev => {
        const next = { ...prev, [eventId]: { ...prev[eventId] } }
        delete next[eventId][participant.userKey]
        return next
      })
      showToast(`${name} – borttagen`)
      return
    }

    try {
      const url  = `${NARVARO_URL}?action=checkin&eventId=${encodeURIComponent(eventId)}&checkinString=${encodeURIComponent(participant.userKey)}`
      const res  = await fetch(url)
      const data = await res.json()

      if (!data.ok) {
        showToast(data.error ?? 'Incheckning misslyckades', true)
        return
      }
    } catch {
      showToast('Nätverksfel – incheckning misslyckades', true)
      return
    }

    const time = new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
    setCheckins(prev => ({
      ...prev,
      [eventId]: { ...(prev[eventId] ?? {}), [participant.userKey]: time },
    }))
    showToast(`✓ ${name} incheckad ${time}`)
  }

  // ---------------------------------------------------------------------------
  // Scan / quick search
  // ---------------------------------------------------------------------------
  function handleScan(eventId: string, query: string) {
    const evt = events.find(e => e.eventId === eventId)
    if (!evt) return

    const q = query.toLowerCase().replace(/[-\s]/g, '')
    if (!q) return

    const found = evt.participants.find(p => {
      const name  = `${p.firstName} ${p.lastName}`.toLowerCase()
      const phone = p.phone.replace(/[-\s]/g, '')
      const pnr   = p.personnummer.replace(/[-\s]/g, '')
      return name.includes(q) || phone.includes(q) || pnr.includes(q)
    })

    if (found) {
      setScanInputs(prev => ({ ...prev, [eventId]: '' }))
      handleCheckin(eventId, found).then(() => {
        // Scroll to the participant row
        const el = document.getElementById(`row-${eventId}-${found.userKey}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    } else {
      // Red border feedback, clears after 1 s
      setScanErrors(prev => ({ ...prev, [eventId]: true }))
      showToast('Ingen matchande deltagare', true)
      setTimeout(() => setScanErrors(prev => ({ ...prev, [eventId]: false })), 1000)
    }
  }

  const filteredEvents = teacherFilter && teacherFilter !== '__all__'
    ? events.filter(evt =>
        evt.instructors?.toLowerCase().includes(teacherFilter.toLowerCase())
      )
    : events

  return (
    <>
      {/* Toast animation keyframe */}
      <style>{`@keyframes toast-in { from { opacity:0; transform: translate(-50%,1rem) } to { opacity:1; transform: translate(-50%,0) } }`}</style>

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
              <option value="__all__">Visa alla klasser</option>
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
                {short} <span className={`text-xs ${active ? 'opacity-75' : 'text-slate-400'}`}>{date}</span>
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
              {events.length === 0
                ? 'Inga klasser för detta datum.'
                : 'Inga klasser för vald lärare.'}
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
                scanError={scanErrors[evt.eventId] ?? false}
                onScanChange={v => setScanInputs(prev => ({ ...prev, [evt.eventId]: v }))}
                onCheckin={p => handleCheckin(evt.eventId, p)}
                onScan={handleScan}
              />
            ))}
          </div>
        )}
      </div>

      <Toast toast={toast} />
    </>
  )
}
