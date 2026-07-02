import { FormEvent, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { usePublicForm, useSubmitForm } from '../hooks/useForms'
import type { FormField, FormOption } from '../services/formsService'

export function PublicForm() {
  const { slug } = useParams()
  const { data, isLoading, isError } = usePublicForm(slug)
  const submit = useSubmitForm()
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const optionsByField = useMemo(() => {
    const map = new Map<string, FormOption[]>()
    ;(data?.options ?? []).forEach((option) => {
      map.set(option.field_id, [...(map.get(option.field_id) ?? []), option])
    })
    return map
  }, [data?.options])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!data) return

    const nextErrors = validate(data.fields, answers)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    await submit.mutateAsync({ formId: data.form.id, answers, fields: data.fields })
    setSubmitted(true)
  }

  if (isLoading) {
    return (
      <PublicShell>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-brand-forest" />
        </div>
      </PublicShell>
    )
  }

  if (isError || !data) {
    return (
      <PublicShell>
        <div className="card p-8 text-center">
          <p className="text-lg font-bold text-brand-dark">Formuläret kunde inte hittas</p>
          <p className="mt-2 text-sm text-slate-500">Det kan vara stängt eller länken kan vara fel.</p>
        </div>
      </PublicShell>
    )
  }

  if (submitted) {
    return (
      <PublicShell>
        <div className="card p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-brand-forest" />
          <p className="text-xl font-bold text-brand-dark">Tack, vi har tagit emot ditt svar.</p>
          <p className="mt-2 text-sm text-slate-500">Din anmälan är nu registrerad.</p>
        </div>
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <img src="logo.png" alt="SDS" className="h-10 w-10 object-contain" />
          <h1 className="text-3xl font-bold text-brand-dark">{data.form.title}</h1>
          {data.form.description && (
            <p className="max-w-2xl text-sm leading-6 text-slate-600 whitespace-pre-line">{data.form.description}</p>
          )}
        </div>

        <div className="card divide-y divide-slate-100 overflow-hidden">
          {data.fields.map((field) => (
            <PublicField
              key={field.key}
              field={field}
              options={optionsByField.get(field.id) ?? []}
              value={answers[field.key]}
              error={errors[field.key]}
              onChange={(value) => setAnswers((current) => ({ ...current, [field.key]: value }))}
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={submit.isLoading}
          className="inline-flex items-center gap-2 rounded-full bg-brand-dark px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-forest disabled:opacity-60"
        >
          {submit.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Skicka svar
        </button>
      </form>
    </PublicShell>
  )
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <main className="mx-auto max-w-3xl">
        {children}
      </main>
    </div>
  )
}

function PublicField({
  field,
  options,
  value,
  error,
  onChange,
}: {
  field: FormField
  options: FormOption[]
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}) {
  const commonInput = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-mint'

  return (
    <div className="p-5">
      <label className="block text-sm font-bold text-brand-dark">
        {field.label}
        {field.required && <span className="text-brand-pinkDark"> *</span>}
      </label>
      {field.help_text && <p className="mt-1 text-xs text-slate-500">{field.help_text}</p>}

      <div className="mt-3">
        {field.type === 'long_text' ? (
          <textarea
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            rows={4}
            className={commonInput}
          />
        ) : field.type === 'checkboxes' || field.type === 'course_choice' ? (
          <div className="grid gap-2">
            {options.map((option) => {
              const selected = Array.isArray(value) && value.includes(option.key)
              return (
                <label key={option.key} className={`rounded-xl border p-3 transition-colors ${selected ? 'border-brand-forest bg-brand-mint' : 'border-slate-200 bg-white'}`}>
                  <span className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => {
                        const current = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
                        onChange(event.target.checked ? [...current, option.key] : current.filter((item) => item !== option.key))
                      }}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-forest focus:ring-brand-mint"
                    />
                    <OptionText option={option} />
                  </span>
                </label>
              )
            })}
          </div>
        ) : field.type === 'radio' ? (
          <div className="grid gap-2">
            {options.map((option) => (
              <label key={option.key} className={`rounded-xl border p-3 transition-colors ${value === option.key ? 'border-brand-forest bg-brand-mint' : 'border-slate-200 bg-white'}`}>
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name={field.key}
                    checked={value === option.key}
                    onChange={() => onChange(option.key)}
                    className="mt-1 h-4 w-4 border-slate-300 text-brand-forest focus:ring-brand-mint"
                  />
                  <OptionText option={option} />
                </span>
              </label>
            ))}
          </div>
        ) : field.type === 'select' ? (
          <select
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            className={commonInput}
          >
            <option value="">Välj...</option>
            {options.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        ) : (
          <input
            type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'date' ? 'date' : 'text'}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            className={commonInput}
          />
        )}
      </div>

      {error && <p className="mt-2 text-xs font-medium text-status-critical">{error}</p>}
    </div>
  )
}

function OptionText({ option }: { option: FormOption }) {
  const details = [option.day_time, option.location, option.level].filter(Boolean)
  return (
    <span className="min-w-0">
      <span className="block text-sm font-semibold text-brand-dark">{option.label}</span>
      {option.description && <span className="mt-0.5 block text-xs leading-5 text-slate-600">{option.description}</span>}
      {details.length > 0 && <span className="mt-1 block text-xs text-slate-500">{details.join(' · ')}</span>}
    </span>
  )
}

function validate(fields: FormField[], answers: Record<string, unknown>) {
  const errors: Record<string, string> = {}
  fields.forEach((field) => {
    if (!field.required) return
    const value = answers[field.key]
    const empty = Array.isArray(value) ? value.length === 0 : !String(value ?? '').trim()
    if (empty) errors[field.key] = 'Fältet är obligatoriskt'
  })
  return errors
}
