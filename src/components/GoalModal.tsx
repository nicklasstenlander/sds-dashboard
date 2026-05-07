import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import { useCreateGoal, useUpdateGoal, useDeleteGoal } from '../hooks/useGoals'
import type { Goal, GoalMetric, CreateGoalInput } from '../services/goalsService'

const METRIC_OPTIONS: { value: GoalMetric; label: string }[] = [
  { value: 'bookings_count', label: 'Antal anmälningar' },
  { value: 'accepted_count', label: 'Antal antagna'     },
  { value: 'revenue',        label: 'Intäkt (kr)'       },
  { value: 'occupancy',      label: 'Medelbeläggning (%)' },
  { value: 'new_students',   label: 'Nya elever'         },
]

const TERM_OPTIONS = [
  { value: '',      label: 'Hela skolan'       },
  { value: '18402', label: 'Vårterminen 2026'  },
  { value: '19459', label: 'Höstterminen 2026' },
]

const today = () => new Date().toISOString().slice(0, 10)

interface GoalModalProps {
  isOpen:  boolean
  onClose: () => void
  goal?:   Goal         // undefined = skapa nytt
}

export function GoalModal({ isOpen, onClose, goal }: GoalModalProps) {
  const isEditing = Boolean(goal)

  const [title,          setTitle]          = useState('')
  const [description,    setDescription]    = useState('')
  const [metric,         setMetric]         = useState<GoalMetric>('bookings_count')
  const [target,         setTarget]         = useState('')
  const [eventBlockId,   setEventBlockId]   = useState('')
  const [deadline,       setDeadline]       = useState('')
  const [errors,         setErrors]         = useState<Record<string, string>>({})

  const create = useCreateGoal()
  const update = useUpdateGoal()
  const remove = useDeleteGoal()

  // Populate form when editing
  useEffect(() => {
    if (goal) {
      setTitle(goal.title)
      setDescription(goal.description ?? '')
      setMetric(goal.metric)
      setTarget(String(goal.target))
      setEventBlockId(goal.event_block_id ?? '')
      setDeadline(goal.deadline.slice(0, 10))
    } else {
      setTitle('')
      setDescription('')
      setMetric('bookings_count')
      setTarget('')
      setEventBlockId('')
      setDeadline('')
    }
    setErrors({})
  }, [goal, isOpen])

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!title.trim())         e.title    = 'Titel krävs'
    if (!target || Number(target) <= 0) e.target = 'Målvärde måste vara > 0'
    if (!deadline)             e.deadline = 'Slutdatum krävs'
    if (!isEditing && deadline && deadline < today()) e.deadline = 'Slutdatum får inte vara i det förflutna'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    const input: CreateGoalInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      metric,
      target: Number(target),
      event_block_id: eventBlockId || undefined,
      deadline,
    }
    try {
      if (isEditing && goal) {
        await update.mutateAsync({ id: goal.id, input })
      } else {
        await create.mutateAsync(input)
      }
      onClose()
    } catch { /* error handled by mutation */ }
  }

  async function handleDelete() {
    if (!goal) return
    if (!confirm(`Ta bort målet "${goal.title}"?`)) return
    await remove.mutateAsync(goal.id)
    onClose()
  }

  if (!isOpen) return null

  const saving = create.isPending || update.isPending

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-brand-dark">
            {isEditing ? 'Redigera mål' : 'Nytt mål'}
          </h2>
          <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Titel */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Titel *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="t.ex. Fyll HT26-klasserna"
              className={`w-full text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-mint ${errors.title ? 'border-red-400' : 'border-slate-200'}`}
            />
            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
          </div>

          {/* Beskrivning */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Beskrivning</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-mint resize-none"
            />
          </div>

          {/* Mätvärde + Målvärde */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Mätvärde *</label>
              <select
                value={metric}
                onChange={e => setMetric(e.target.value as GoalMetric)}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-mint"
              >
                {METRIC_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Målvärde *</label>
              <input
                type="number"
                value={target}
                onChange={e => setTarget(e.target.value)}
                min="1"
                className={`w-full text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-mint ${errors.target ? 'border-red-400' : 'border-slate-200'}`}
              />
              {errors.target && <p className="text-xs text-red-500 mt-1">{errors.target}</p>}
            </div>
          </div>

          {/* Termin */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Termin</label>
            <select
              value={eventBlockId}
              onChange={e => setEventBlockId(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-mint"
            >
              {TERM_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Slutdatum */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Slutdatum *</label>
            <input
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className={`w-full text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-mint ${errors.deadline ? 'border-red-400' : 'border-slate-200'}`}
            />
            {errors.deadline && <p className="text-xs text-red-500 mt-1">{errors.deadline}</p>}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-1">
            {isEditing && (
              <button
                onClick={handleDelete}
                disabled={remove.isPending}
                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Ta bort
              </button>
            )}
            <div className="flex gap-2 ml-auto">
              <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors">
                Avbryt
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-sm px-5 py-2 rounded-lg bg-brand-dark text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Sparar…' : isEditing ? 'Spara' : 'Skapa mål'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
