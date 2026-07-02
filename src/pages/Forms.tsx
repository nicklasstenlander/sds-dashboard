import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import {
  Check,
  Copy,
  ExternalLink,
  FileDown,
  ListChecks,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useFormBundle, useForms, useFormSubmissions, useSaveForm } from '../hooks/useForms'
import { downloadCsv } from '../utils/csv'
import { slugify, type FormField, type FormFieldType, type FormOption, type FormStatus } from '../services/formsService'

type ActiveTab = 'responses' | 'builder'

interface EditorOption {
  id?: string
  key: string
  label: string
  description: string | null
  day_time: string | null
  location: string | null
  level: string | null
  capacity: number | null
  active: boolean
  sort_order: number
}

interface EditorField {
  id?: string
  key: string
  type: FormFieldType
  label: string
  help_text: string | null
  required: boolean
  sort_order: number
  config: Record<string, unknown>
  options: EditorOption[]
}

const FIELD_TYPES: Array<{ type: FormFieldType; label: string }> = [
  { type: 'short_text', label: 'Kort text' },
  { type: 'long_text', label: 'Lång text' },
  { type: 'email', label: 'E-post' },
  { type: 'phone', label: 'Telefon' },
  { type: 'date', label: 'Datum' },
  { type: 'checkboxes', label: 'Checkboxar' },
  { type: 'radio', label: 'Radioval' },
  { type: 'select', label: 'Dropdown' },
  { type: 'course_choice', label: 'Kursval' },
]

const STATUS_LABELS: Record<FormStatus, string> = {
  draft: 'Utkast',
  published: 'Publicerad',
  closed: 'Stängd',
}

export function Forms() {
  const { session, usingLegacyAuth } = useAuth()
  const formsQuery = useForms()
  const forms = formsQuery.data ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('responses')
  const activeFormId = isCreatingNew ? null : selectedId
  const bundleQuery = useFormBundle(activeFormId)
  const submissionsQuery = useFormSubmissions(activeFormId)
  const saveForm = useSaveForm()
  const [copied, setCopied] = useState(false)
  const [search, setSearch] = useState('')
  const [courseFilter, setCourseFilter] = useState('')
  const [formDraft, setFormDraft] = useState(() => newFormDraft())
  const [fields, setFields] = useState<EditorField[]>(() => defaultOpenHouseFields())
  const canManageForms = Boolean(session) && !usingLegacyAuth

  useEffect(() => {
    if (!isCreatingNew && !selectedId && forms.length > 0) setSelectedId(forms[0].id)
  }, [forms, isCreatingNew, selectedId])

  useEffect(() => {
    if (isCreatingNew) return
    if (!bundleQuery.data) return
    setFormDraft({
      title: bundleQuery.data.form.title,
      slug: bundleQuery.data.form.slug,
      description: bundleQuery.data.form.description ?? '',
      status: bundleQuery.data.form.status,
    })
    setFields(toEditorFields(bundleQuery.data.fields, bundleQuery.data.options))
  }, [bundleQuery.data, isCreatingNew])

  const selectedForm = isCreatingNew ? null : bundleQuery.data?.form ?? forms.find((form) => form.id === selectedId) ?? null
  const publicUrl = selectedForm ? `${window.location.origin}${window.location.pathname}#/f/${selectedForm.slug}` : ''

  const optionsByKey = useMemo(() => {
    const map = new Map<string, FormOption | EditorOption>()
    ;(bundleQuery.data?.options ?? fields.flatMap((field) => field.options)).forEach((option) => map.set(option.key, option))
    return map
  }, [bundleQuery.data?.options, fields])

  const courseOptions = useMemo(() => {
    const courseFieldIds = new Set((bundleQuery.data?.fields ?? []).filter((field) => field.type === 'course_choice').map((field) => field.id))
    return (bundleQuery.data?.options ?? []).filter((option) => courseFieldIds.has(option.field_id))
  }, [bundleQuery.data?.fields, bundleQuery.data?.options])

  const submissions = submissionsQuery.data ?? []
  const filteredSubmissions = useMemo(() => {
    const q = search.trim().toLowerCase()
    return submissions.filter((submission) => {
      if (courseFilter && !submission.selected_option_keys.includes(courseFilter)) return false
      if (!q) return true
      return [
        submission.respondent_name,
        submission.respondent_email,
        submission.respondent_phone,
        ...Object.values(submission.answers).flatMap((value) => Array.isArray(value) ? value : [value]),
      ].some((value) => String(value ?? '').toLowerCase().includes(q))
    })
  }, [courseFilter, search, submissions])

  function startNewForm() {
    setIsCreatingNew(true)
    setSelectedId(null)
    setActiveTab('builder')
    setSearch('')
    setCourseFilter('')
    setFormDraft(newFormDraft())
    setFields(defaultOpenHouseFields())
  }

  async function handleSave() {
    if (!canManageForms) return

    try {
      const saved = await saveForm.mutateAsync({
        formId: isCreatingNew ? undefined : selectedId ?? undefined,
        input: {
          form: { ...formDraft, slug: slugify(formDraft.slug || formDraft.title) },
          fields,
        },
      })
      setIsCreatingNew(false)
      setSelectedId(saved.id)
      setActiveTab('responses')
    } catch (error) {
      console.error('Kunde inte spara formulär:', error)
    }
  }

  function handleExport() {
    const rows = filteredSubmissions.map((submission) => {
      const row: Record<string, string> = {
        Inskickad: formatDateTime(submission.submitted_at),
        Namn: submission.respondent_name ?? '',
        'E-post': submission.respondent_email ?? '',
        Telefon: submission.respondent_phone ?? '',
        'Valda kurser': submission.selected_option_keys
          .map((key) => optionsByKey.get(key)?.label ?? key)
          .filter(Boolean)
          .join(', '),
      }

      ;(bundleQuery.data?.fields ?? []).forEach((field) => {
        row[field.label] = answerLabel(field, submission.answers[field.key], optionsByKey)
      })

      courseOptions.forEach((option) => {
        row[option.label] = submission.selected_option_keys.includes(option.key) ? 'Ja' : 'Nej'
      })

      return row
    })

    downloadCsv(`${selectedForm?.slug ?? 'formular'}-svar.csv`, rows)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-dark">Formulär</h1>
          <p className="mt-1 text-sm text-slate-500">Skapa formulär, manuella kursval och följ upp inkomna svar.</p>
        </div>
        <button
          onClick={startNewForm}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-forest"
        >
          <Plus className="h-4 w-4" />
          Nytt formulär
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Formulär</p>
          </div>
          {formsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-brand-forest" />
            </div>
          ) : forms.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-500">Inga formulär ännu.</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {forms.map((form) => (
                <button
                  key={form.id}
                  onClick={() => {
                    setIsCreatingNew(false)
                    setSelectedId(form.id)
                    setActiveTab('responses')
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors ${!isCreatingNew && selectedId === form.id ? 'bg-brand-mint' : 'hover:bg-slate-50'}`}
                >
                  <span className="block truncate text-sm font-bold text-brand-dark">{form.title}</span>
                  <span className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>/{form.slug}</span>
                    <StatusBadge status={form.status} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="card overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-bold text-brand-dark">{selectedForm?.title ?? formDraft.title}</h2>
                  <StatusBadge status={formDraft.status} />
                </div>
                {selectedForm && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="truncate">{publicUrl}</span>
                    <button onClick={() => copyUrl(publicUrl, setCopied)} className="inline-flex items-center gap-1 text-brand-forest hover:underline">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? 'Kopierad' : 'Kopiera'}
                    </button>
                    <a href={`#/f/${selectedForm.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-forest hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Öppna
                    </a>
                  </div>
                )}
              </div>
              <div className="flex rounded-full border border-slate-200 bg-white p-1">
                <TabButton active={activeTab === 'responses'} onClick={() => setActiveTab('responses')}>Svar</TabButton>
                <TabButton active={activeTab === 'builder'} onClick={() => setActiveTab('builder')}>Creator</TabButton>
              </div>
            </div>

            {activeTab === 'builder' ? (
              <Builder
                formDraft={formDraft}
                fields={fields}
                saving={saveForm.isLoading}
                error={errorMessage(saveForm.error)}
                canManageForms={canManageForms}
                onFormChange={setFormDraft}
                onFieldsChange={setFields}
                onSave={handleSave}
              />
            ) : (
              <Responses
                loading={submissionsQuery.isLoading || bundleQuery.isLoading}
                fields={bundleQuery.data?.fields ?? []}
                submissions={filteredSubmissions}
                optionsByKey={optionsByKey}
                search={search}
                courseFilter={courseFilter}
                courseOptions={courseOptions}
                onSearchChange={setSearch}
                onCourseFilterChange={setCourseFilter}
                onExport={handleExport}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function Builder({
  formDraft,
  fields,
  saving,
  error,
  canManageForms,
  onFormChange,
  onFieldsChange,
  onSave,
}: {
  formDraft: { title: string; slug: string; description: string; status: FormStatus }
  fields: EditorField[]
  saving: boolean
  error: string | null
  canManageForms: boolean
  onFormChange: (value: { title: string; slug: string; description: string; status: FormStatus }) => void
  onFieldsChange: (value: EditorField[]) => void
  onSave: () => void
}) {
  return (
    <div className="space-y-6 p-5">
      {!canManageForms && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Formulär kan bara sparas när du är inloggad med en CORE-användare. Logga ut från tillfälligt läge och logga in med e-post/lösenord.
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-status-critical">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Input label="Namn" value={formDraft.title} onChange={(title) => onFormChange({ ...formDraft, title, slug: formDraft.slug || slugify(title) })} />
        <Input label="Slug" value={formDraft.slug} onChange={(slug) => onFormChange({ ...formDraft, slug })} />
        <label className="block lg:col-span-2">
          <span className="text-xs font-semibold text-slate-600">Beskrivning</span>
          <textarea
            value={formDraft.description}
            onChange={(event) => onFormChange({ ...formDraft, description: event.target.value })}
            rows={3}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">Status</span>
          <select
            value={formDraft.status}
            onChange={(event) => onFormChange({ ...formDraft, status: event.target.value as FormStatus })}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
          >
            <option value="draft">Utkast</option>
            <option value="published">Publicerad</option>
            <option value="closed">Stängd</option>
          </select>
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-brand-dark">Fält</h3>
          <div className="flex flex-wrap gap-2">
            {FIELD_TYPES.map((fieldType) => (
              <button
                key={fieldType.type}
                onClick={() => onFieldsChange([...fields, createField(fieldType.type)])}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-forest hover:text-brand-dark"
              >
                {fieldType.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
          {fields.map((field, index) => (
            <FieldEditor
              key={field.key}
              field={field}
              index={index}
              canMoveUp={index > 0}
              canMoveDown={index < fields.length - 1}
              onChange={(next) => onFieldsChange(fields.map((candidate) => candidate.key === field.key ? next : candidate))}
              onDelete={() => onFieldsChange(fields.filter((candidate) => candidate.key !== field.key))}
              onMove={(direction) => onFieldsChange(moveField(fields, index, direction))}
            />
          ))}
        </div>
      </div>

      <button
        onClick={onSave}
        disabled={!canManageForms || saving || !formDraft.title.trim() || fields.length === 0}
        className="inline-flex items-center gap-2 rounded-full bg-brand-dark px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-forest disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Spara formulär
      </button>
    </div>
  )
}

function FieldEditor({
  field,
  index,
  canMoveUp,
  canMoveDown,
  onChange,
  onDelete,
  onMove,
}: {
  field: EditorField
  index: number
  canMoveUp: boolean
  canMoveDown: boolean
  onChange: (field: EditorField) => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const hasOptions = ['checkboxes', 'radio', 'select', 'course_choice'].includes(field.type)
  return (
    <div className="space-y-4 p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px_auto] lg:items-end">
        <Input label={`Fält ${index + 1}`} value={field.label} onChange={(label) => onChange({ ...field, label })} />
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">Typ</span>
          <select
            value={field.type}
            onChange={(event) => onChange({ ...field, type: event.target.value as FormFieldType })}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
          >
            {FIELD_TYPES.map((fieldType) => <option key={fieldType.type} value={fieldType.type}>{fieldType.label}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button disabled={!canMoveUp} onClick={() => onMove(-1)} className="rounded-lg px-2 py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-30">Upp</button>
          <button disabled={!canMoveDown} onClick={() => onMove(1)} className="rounded-lg px-2 py-2 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-30">Ner</button>
          <button onClick={onDelete} className="rounded-lg px-2 py-2 text-status-critical hover:bg-red-50" aria-label="Ta bort fält">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px]">
        <Input label="Hjälptext" value={field.help_text ?? ''} onChange={(help_text) => onChange({ ...field, help_text })} />
        <label className="mt-6 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(event) => onChange({ ...field, required: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-brand-forest focus:ring-brand-mint"
          />
          Obligatoriskt
        </label>
      </div>

      {hasOptions && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-600">{field.type === 'course_choice' ? 'Valbara kurser' : 'Alternativ'}</p>
            <button
              onClick={() => onChange({ ...field, options: [...field.options, createOption(field.type === 'course_choice' ? 'Ny kurs' : 'Nytt alternativ')] })}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-forest hover:text-brand-dark"
            >
              <Plus className="h-3.5 w-3.5" />
              Lägg till
            </button>
          </div>
          <div className="grid gap-2">
            {field.options.map((option) => (
              <OptionEditor
                key={option.key}
                option={option}
                courseMode={field.type === 'course_choice'}
                onChange={(next) => onChange({ ...field, options: field.options.map((candidate) => candidate.key === option.key ? next : candidate) })}
                onDelete={() => onChange({ ...field, options: field.options.filter((candidate) => candidate.key !== option.key) })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OptionEditor({
  option,
  courseMode,
  onChange,
  onDelete,
}: {
  option: EditorOption
  courseMode: boolean
  onChange: (option: EditorOption) => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Input label={courseMode ? 'Kursnamn' : 'Text'} value={option.label} onChange={(label) => onChange({ ...option, label })} />
        <button onClick={onDelete} className="mt-6 rounded-lg px-2 py-2 text-status-critical hover:bg-red-50" aria-label="Ta bort alternativ">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {courseMode && (
        <div className="mt-3 grid gap-2 lg:grid-cols-4">
          <Input label="Dag/tid" value={option.day_time ?? ''} onChange={(day_time) => onChange({ ...option, day_time })} />
          <Input label="Plats" value={option.location ?? ''} onChange={(location) => onChange({ ...option, location })} />
          <Input label="Nivå/ålder" value={option.level ?? ''} onChange={(level) => onChange({ ...option, level })} />
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Max platser</span>
            <input
              type="number"
              min="0"
              value={option.capacity ?? ''}
              onChange={(event) => onChange({ ...option, capacity: event.target.value ? Number(event.target.value) : null })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
            />
          </label>
          <label className="block lg:col-span-4">
            <span className="text-xs font-semibold text-slate-600">Beskrivning</span>
            <input
              value={option.description ?? ''}
              onChange={(event) => onChange({ ...option, description: event.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
            />
          </label>
        </div>
      )}
      <label className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600">
        <input
          type="checkbox"
          checked={option.active}
          onChange={(event) => onChange({ ...option, active: event.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-brand-forest focus:ring-brand-mint"
        />
        Aktiv
      </label>
    </div>
  )
}

function Responses({
  loading,
  fields,
  submissions,
  optionsByKey,
  search,
  courseFilter,
  courseOptions,
  onSearchChange,
  onCourseFilterChange,
  onExport,
}: {
  loading: boolean
  fields: FormField[]
  submissions: ReturnType<typeof useFormSubmissions>['data']
  optionsByKey: Map<string, FormOption | EditorOption>
  search: string
  courseFilter: string
  courseOptions: FormOption[]
  onSearchChange: (value: string) => void
  onCourseFilterChange: (value: string) => void
  onExport: () => void
}) {
  const rows = submissions ?? []
  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="search"
              placeholder="Sök svar..."
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="w-full rounded-full border border-slate-200 py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
            />
          </div>
          <select
            value={courseFilter}
            onChange={(event) => onCourseFilterChange(event.target.value)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
          >
            <option value="">Alla kurser</option>
            {courseOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </div>
        <button
          onClick={onExport}
          disabled={rows.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-brand-forest hover:text-brand-dark disabled:opacity-50"
        >
          <FileDown className="h-4 w-4" />
          Exportera CSV
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-brand-forest" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ListChecks className="mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">Inga svar hittades</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <Th>Inskickad</Th>
                <Th>Namn</Th>
                <Th>Kontakt</Th>
                <Th>Valda kurser</Th>
                {fields.filter((field) => !['course_choice', 'email', 'phone'].includes(field.type)).map((field) => <Th key={field.key}>{field.label}</Th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((submission) => (
                <tr key={submission.id} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-5 py-3 text-sm text-slate-600">{formatDateTime(submission.submitted_at)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-sm font-medium text-brand-dark">{submission.respondent_name || '—'}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-sm text-slate-600">
                    <div>{submission.respondent_email || '—'}</div>
                    {submission.respondent_phone && <div className="text-xs text-slate-500">{submission.respondent_phone}</div>}
                  </td>
                  <td className="min-w-[220px] px-5 py-3 text-sm text-slate-700">
                    {submission.selected_option_keys.length > 0
                      ? submission.selected_option_keys.map((key) => optionsByKey.get(key)?.label ?? key).join(', ')
                      : '—'}
                  </td>
                  {fields.filter((field) => !['course_choice', 'email', 'phone'].includes(field.type)).map((field) => (
                    <td key={field.key} className="max-w-[260px] px-5 py-3 text-sm text-slate-600">
                      <span className="line-clamp-2">{answerLabel(field, submission.answers[field.key], optionsByKey) || '—'}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-brand-mint text-brand-dark' : 'text-slate-500 hover:text-brand-dark'}`}
    >
      {children}
    </button>
  )
}

function StatusBadge({ status }: { status: FormStatus }) {
  const cls = status === 'published'
    ? 'bg-status-okSoft text-brand-forest'
    : status === 'closed'
      ? 'bg-slate-100 text-slate-600'
      : 'bg-status-warningSoft text-[#5f4700]'

  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{STATUS_LABELS[status]}</span>
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold text-slate-600">{children}</th>
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-mint"
      />
    </label>
  )
}

function createField(type: FormFieldType): EditorField {
  const key = makeKey(type)
  return {
    key,
    type,
    label: type === 'course_choice' ? 'Vilka kurser vill du gå?' : FIELD_TYPES.find((fieldType) => fieldType.type === type)?.label ?? 'Fält',
    help_text: null,
    required: ['short_text', 'email', 'phone', 'course_choice'].includes(type),
    sort_order: 0,
    config: {},
    options: ['checkboxes', 'radio', 'select', 'course_choice'].includes(type) ? [createOption(type === 'course_choice' ? 'Ny kurs' : 'Alternativ 1')] : [],
  }
}

function createOption(label: string): EditorOption {
  return {
    key: makeKey('option'),
    label,
    description: null,
    day_time: null,
    location: null,
    level: null,
    capacity: null,
    active: true,
    sort_order: 0,
  }
}

function defaultOpenHouseFields(): EditorField[] {
  return [
    { ...createField('short_text'), key: 'student_name', label: 'Elevens namn', required: true },
    { ...createField('email'), key: 'guardian_email', label: 'E-post', required: true },
    { ...createField('phone'), key: 'phone', label: 'Telefonnummer', required: true },
    {
      ...createField('course_choice'),
      key: 'courses',
      label: 'Vilka kurser vill du gå?',
      help_text: 'Välj en eller flera kurser.',
      options: [createOption('Jazz'), createOption('Hiphop'), createOption('Balett')],
    },
    { ...createField('long_text'), key: 'notes', label: 'Övrigt', required: false },
  ]
}

function newFormDraft() {
  const suffix = Math.random().toString(36).slice(2, 7)
  return {
    title: 'Nytt formulär',
    slug: `nytt-formular-${suffix}`,
    description: '',
    status: 'draft' as FormStatus,
  }
}

function toEditorFields(fields: FormField[], options: FormOption[]): EditorField[] {
  return fields.map((field) => ({
    ...field,
    options: options
      .filter((option) => option.field_id === field.id)
      .map((option) => ({ ...option })),
  }))
}

function moveField(fields: EditorField[], index: number, direction: -1 | 1) {
  const next = [...fields]
  const target = index + direction
  if (target < 0 || target >= next.length) return fields
  const [field] = next.splice(index, 1)
  next.splice(target, 0, field)
  return next
}

function answerLabel(field: FormField, value: unknown, optionsByKey: Map<string, FormOption | EditorOption>): string {
  if (Array.isArray(value)) {
    return value.map((key) => optionsByKey.get(String(key))?.label ?? String(key)).join(', ')
  }
  if (['radio', 'select'].includes(field.type) && typeof value === 'string') {
    return optionsByKey.get(value)?.label ?? value
  }
  return typeof value === 'string' ? value : ''
}

function formatDateTime(value: string): string {
  try {
    return format(parseISO(value), 'd MMM yyyy HH:mm', { locale: sv })
  } catch {
    return value
  }
}

function makeKey(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

async function copyUrl(url: string, setCopied: (value: boolean) => void) {
  await navigator.clipboard.writeText(url)
  setCopied(true)
  window.setTimeout(() => setCopied(false), 1800)
}

function errorMessage(error: unknown): string | null {
  if (!error) return null
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return 'Kunde inte spara formuläret. Kontrollera Supabase-behörigheter och försök igen.'
}
