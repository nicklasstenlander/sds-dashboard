import { useState, useEffect, useRef, useCallback } from 'react'
import { CheckCircle, Circle, LogOut, RefreshCw, Search } from 'lucide-react'
import { fetchProxyEvents } from '../services/proxyService'
import type { Event as CogworkEvent } from '../types/cogwork'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Participant {
  userKey:       string
  userId?:       string
  attendanceId?: string
  firstName:     string
  lastName:      string
  phone:         string
  personnummer:  string
  age:           number | null
  attending?:    'yes' | 'no' | 'unknown'
}

interface CourseEvent {
  eventId:      string
  occasionId?:  string
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
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

function parseEventsPayload(raw: unknown): CourseEvent[] {
  if (Array.isArray(raw)) return raw as CourseEvent[]
  if (raw && typeof raw === 'object') {
    const obj = raw as { events?: unknown; data?: unknown }
    if (Array.isArray(obj.events)) return obj.events as CourseEvent[]
    if (Array.isArray(obj.data)) return obj.data as CourseEvent[]
  }
  return []
}

function normalizeAttending(value?: string): Participant['attending'] {
  const normalized = value?.toLowerCase()
  if (normalized === 'yes' || normalized === 'true' || normalized === '96') return 'yes'
  if (normalized === 'no' || normalized === 'false' || normalized === '32') return 'no'
  if (normalized === 'unknown' || normalized === '64') return 'unknown'
  return undefined
}

function normalizeCourseEvents(events: CourseEvent[]): CourseEvent[] {
  return events.map(evt => ({
    ...evt,
    participants: (evt.participants ?? []).map(participant => ({
      ...participant,
      attending: normalizeAttending(participant.attending),
    })),
  }))
}

function eventMatchesDate(evt: CourseEvent, date: string): boolean {
  if (!evt.dayStr) return true
  return evt.dayStr.slice(0, 10) === date
}

function eventMatchesKnownSchedule(evt: CourseEvent, date: string, eventMeta: Map<string, CogworkEvent>): boolean {
  const meta = eventMeta.get(evt.eventId)
  if (!meta) return true

  const occasions = meta.schedule?.occasions
  if (occasions?.length) {
    return occasions.some(occasion => occasion.startDateTime?.slice(0, 10) === date)
  }

  const start = meta.schedule?.start?.date
  const end = meta.schedule?.end?.date || start
  if (!start || !end) return true

  return date >= start && date <= end
}

function collectTeachers(events: CourseEvent[]): string[] {
  const names = new Set<string>()
  events.forEach(evt => {
    evt.instructors?.split(',').forEach(n => {
      const t = n.trim()
      if (t) names.add(t)
    })
  })
  return [...names].sort((a, b) => a.localeCompare(b, 'sv'))
}

function sortEvents(events: CourseEvent[]): CourseEvent[] {
  return [...events].sort((a, b) => (a.time || '').localeCompare(b.time || '', 'sv'))
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
}

function buildEventMetaMap(events: CogworkEvent[]): Map<string, CogworkEvent> {
  return new Map(events.map(evt => [evt.key, evt]))
}

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
  const [teacherChoice, setTeacherChoice] = useState<string>('')
  const [teachers, setTeachers]           = useState<string[]>([])
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [loginError, setLoginError]       = useState<string | null>(null)
  const [lastFetched, setLastFetched]     = useState<Date | null>(null)
  const [scanInputs, setScanInputs]       = useState<Record<string, string>>({})
  const [scanErrors, setScanErrors]       = useState<Record<string, boolean>>({})
  const [toast, setToast]                 = useState<ToastState | null>(null)
  const toastTimer                        = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setCheckins(prev => {
      let changed = false
      const next: Checkins = { ...prev }

      events.forEach(evt => {
        evt.participants.forEach(participant => {
          if (participant.attending !== 'yes' || next[evt.eventId]?.[participant.userKey]) return
          changed = true
          next[evt.eventId] = { ...(next[evt.eventId] ?? {}), [participant.userKey]: '✓' }
        })
      })

      return changed ? next : prev
    })
  }, [events])

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
      const [res, eventMetaResponse] = await Promise.all([
        fetch(`${NARVARO_URL}?action=events_by_date&date=${date}`),
        fetchProxyEvents(),
      ])
      const raw = await res.json()
      const data = normalizeCourseEvents(parseEventsPayload(raw))
      const eventMeta = buildEventMetaMap(eventMetaResponse.events)

      // Backend kan ibland skicka alla kurser för samma veckodag. Behåll bara
      // poster där payloadens datum och CogWorks verkliga kursperiod matchar.
      const dateEvents = data.filter(evt =>
        eventMatchesDate(evt, date) && eventMatchesKnownSchedule(evt, date, eventMeta)
      )
      setEvents(sortEvents(dateEvents))
      setTeachers(collectTeachers(dateEvents))
      setLastFetched(new Date())
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

  function handleLogin() {
    setLoginError(null)
    if (!teacherChoice) {
      setLoginError('Välj ditt namn i listan.')
      return
    }
    setTeacherFilter(teacherChoice)
  }

  function handleLogout() {
    setTeacherFilter('')
    setTeacherChoice('')
    setLoginError(null)
    setSelectedDay(toDateStr(new Date()))
  }

  const filteredEvents = teacherFilter && teacherFilter !== '__all__'
    ? events.filter(evt =>
        evt.instructors?.toLowerCase().includes(teacherFilter.toLowerCase())
      )
    : events

  const teacherName = teacherFilter === '__all__' ? 'Alla dagens kurser' : teacherFilter

  if (!teacherFilter) {
    return (
      <>
        <style>{`@keyframes toast-in { from { opacity:0; transform: translate(-50%,1rem) } to { opacity:1; transform: translate(-50%,0) } }`}</style>
        <div className="min-h-[70vh] flex items-center justify-center">
          <div className="card w-full max-w-md p-8 text-center space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-brand-dark">Närvaro</h1>
              <p className="text-sm text-slate-400 mt-2">Välj lärare för att se dagens klasser.</p>
            </div>

            <div className="text-left space-y-2">
              <label className="block text-xs uppercase tracking-wider font-semibold text-slate-500">
                Vem är du?
              </label>
              <select
                value={teacherChoice}
                onChange={e => {
                  setTeacherChoice(e.target.value)
                  setLoginError(null)
                }}
                className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-brand-mint"
                disabled={loading && teachers.length === 0}
              >
                <option value="">
                  {loading && teachers.length === 0 ? 'Hämtar lärare...' : 'Välj ditt namn'}
                </option>
                {teachers.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value="__all__">Alla dagens kurser</option>
              </select>
              {loginError && <p className="text-sm text-red-600">{loginError}</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <button
              onClick={handleLogin}
              disabled={loading && teachers.length === 0}
              className="w-full rounded-xl bg-brand-dark text-white text-sm font-semibold py-3 hover:bg-[#2a5735] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Fortsätt
            </button>

            <button
              onClick={() => loadEvents(selectedDay)}
              className="inline-flex items-center justify-center gap-2 text-sm text-slate-400 hover:text-brand-dark transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Uppdatera lärarlistan
            </button>
          </div>
        </div>
        <Toast toast={toast} />
      </>
    )
  }

  return (
    <>
      {/* Toast animation keyframe */}
      <style>{`@keyframes toast-in { from { opacity:0; transform: translate(-50%,1rem) } to { opacity:1; transform: translate(-50%,0) } }`}</style>

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-brand-dark">Närvaro</h1>
            <p className="text-sm text-slate-400 mt-1">
              {lastFetched
                ? `Uppdaterad ${lastFetched.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`
                : 'Dagens checkin'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-brand-dark text-white rounded-full pl-1.5 pr-3 py-1.5">
              <span className="w-7 h-7 rounded-full bg-[#dd5c86] flex items-center justify-center text-xs font-bold">
                {teacherFilter === '__all__' ? 'A' : initials(teacherName).toUpperCase()}
              </span>
              <span className="text-sm font-medium">{teacherName}</span>
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:text-brand-dark hover:border-brand-mint transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Byt lärare</span>
            </button>
          </div>
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
          <div className="card flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
            <p className="text-sm text-slate-400">
              {events.length === 0
                ? 'Inga klasser för detta datum.'
                : 'Inga klasser för vald lärare.'}
            </p>
            {teacherFilter !== '__all__' && events.length > 0 && (
              <button
                onClick={() => setTeacherFilter('__all__')}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:text-brand-dark hover:border-brand-mint transition-colors"
              >
                Visa alla dagens kurser
              </button>
            )}
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
