import { supabase } from '../lib/supabase'

export type FormStatus = 'draft' | 'published' | 'closed'

export type FormFieldType =
  | 'short_text'
  | 'long_text'
  | 'email'
  | 'phone'
  | 'date'
  | 'checkboxes'
  | 'radio'
  | 'select'
  | 'course_choice'

export interface DynamicForm {
  id: string
  title: string
  slug: string
  description: string | null
  status: FormStatus
  created_at: string
  updated_at: string
}

export interface FormField {
  id: string
  form_id: string
  key: string
  type: FormFieldType
  label: string
  help_text: string | null
  required: boolean
  sort_order: number
  config: Record<string, unknown>
}

export interface FormOption {
  id: string
  form_id: string
  field_id: string
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

export interface FormSubmission {
  id: string
  form_id: string
  submitted_at: string
  respondent_name: string | null
  respondent_email: string | null
  respondent_phone: string | null
  answers: Record<string, unknown>
  selected_option_keys: string[]
}

export interface FormBundle {
  form: DynamicForm
  fields: FormField[]
  options: FormOption[]
}

export interface FormEditorInput {
  form: Pick<DynamicForm, 'title' | 'slug' | 'description' | 'status'>
  fields: Array<Omit<FormField, 'id' | 'form_id'> & { id?: string; options?: Array<Omit<FormOption, 'id' | 'form_id' | 'field_id'> & { id?: string }> }>
}

export async function fetchForms(): Promise<DynamicForm[]> {
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as DynamicForm[]
}

export async function fetchFormBundle(formId: string): Promise<FormBundle> {
  const [{ data: form, error: formError }, { data: fields, error: fieldsError }, { data: options, error: optionsError }] = await Promise.all([
    supabase.from('forms').select('*').eq('id', formId).single(),
    supabase.from('form_fields').select('*').eq('form_id', formId).order('sort_order'),
    supabase.from('form_options').select('*').eq('form_id', formId).order('sort_order'),
  ])

  if (formError) throw formError
  if (fieldsError) throw fieldsError
  if (optionsError) throw optionsError

  return {
    form: form as DynamicForm,
    fields: (fields ?? []) as FormField[],
    options: (options ?? []) as FormOption[],
  }
}

export async function fetchPublicForm(slug: string): Promise<FormBundle> {
  const { data: form, error: formError } = await supabase
    .from('forms')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (formError) throw formError

  const [{ data: fields, error: fieldsError }, { data: options, error: optionsError }] = await Promise.all([
    supabase.from('form_fields').select('*').eq('form_id', form.id).order('sort_order'),
    supabase.from('form_options').select('*').eq('form_id', form.id).eq('active', true).order('sort_order'),
  ])

  if (fieldsError) throw fieldsError
  if (optionsError) throw optionsError

  return {
    form: form as DynamicForm,
    fields: (fields ?? []) as FormField[],
    options: (options ?? []) as FormOption[],
  }
}

export async function saveForm(input: FormEditorInput, formId?: string): Promise<DynamicForm> {
  const normalizedSlug = slugify(input.form.slug || input.form.title)
  const payload = {
    title: input.form.title.trim(),
    slug: normalizedSlug,
    description: input.form.description?.trim() || null,
    status: input.form.status,
  }

  const { data: form, error: formError } = formId
    ? await supabase.from('forms').update(payload).eq('id', formId).select('*').single()
    : await supabase.from('forms').insert(payload).select('*').single()

  if (formError) throw formError
  const savedForm = form as DynamicForm

  const { error: deleteOptionsError } = await supabase.from('form_options').delete().eq('form_id', savedForm.id)
  if (deleteOptionsError) throw deleteOptionsError

  const { error: deleteFieldsError } = await supabase.from('form_fields').delete().eq('form_id', savedForm.id)
  if (deleteFieldsError) throw deleteFieldsError

  if (input.fields.length === 0) return savedForm

  const fieldRows = input.fields.map((field, index) => ({
    form_id: savedForm.id,
    key: field.key,
    type: field.type,
    label: field.label.trim(),
    help_text: field.help_text?.trim() || null,
    required: field.required,
    sort_order: index,
    config: field.config ?? {},
  }))

  const { data: savedFields, error: fieldsError } = await supabase
    .from('form_fields')
    .insert(fieldRows)
    .select('*')

  if (fieldsError) throw fieldsError

  const fieldIdByKey = new Map((savedFields ?? []).map((field) => [field.key as string, field.id as string]))
  const optionRows = input.fields.flatMap((field) =>
    (field.options ?? []).map((option, index) => ({
      form_id: savedForm.id,
      field_id: fieldIdByKey.get(field.key),
      key: option.key,
      label: option.label.trim(),
      description: option.description?.trim() || null,
      day_time: option.day_time?.trim() || null,
      location: option.location?.trim() || null,
      level: option.level?.trim() || null,
      capacity: option.capacity || null,
      active: option.active,
      sort_order: index,
    })),
  ).filter((option) => option.field_id)

  if (optionRows.length > 0) {
    const { error: optionsError } = await supabase.from('form_options').insert(optionRows)
    if (optionsError) throw optionsError
  }

  return savedForm
}

export async function fetchFormSubmissions(formId: string): Promise<FormSubmission[]> {
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*')
    .eq('form_id', formId)
    .order('submitted_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as FormSubmission[]
}

export async function submitForm(formId: string, answers: Record<string, unknown>, fields: FormField[]): Promise<void> {
  const optionFieldKeys = new Set(
    fields
      .filter((field) => ['checkboxes', 'radio', 'select', 'course_choice'].includes(field.type))
      .map((field) => field.key),
  )
  const selectedOptionKeys = Object.entries(answers)
    .filter(([key]) => optionFieldKeys.has(key))
    .flatMap(([, value]) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === 'string')

  const respondentName = findAnswerValue(answers, fields, ['name', 'namn']) ?? null
  const respondentEmail = findTypedAnswerValue(answers, fields, 'email') ?? null
  const respondentPhone = findTypedAnswerValue(answers, fields, 'phone') ?? null

  const { error } = await supabase.from('form_submissions').insert({
    form_id: formId,
    respondent_name: respondentName,
    respondent_email: respondentEmail,
    respondent_phone: respondentPhone,
    answers,
    selected_option_keys: selectedOptionKeys,
  })

  if (error) throw error
}

function findTypedAnswerValue(answers: Record<string, unknown>, fields: FormField[], type: FormFieldType): string | undefined {
  const field = fields.find((candidate) => candidate.type === type)
  const value = field ? answers[field.key] : undefined
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function findAnswerValue(answers: Record<string, unknown>, fields: FormField[], keys: string[]): string | undefined {
  const field = fields.find((candidate) =>
    keys.some((key) => candidate.key.toLowerCase().includes(key) || candidate.label.toLowerCase().includes(key)),
  )
  const value = field ? answers[field.key] : undefined
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
