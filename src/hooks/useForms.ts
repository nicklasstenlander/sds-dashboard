import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  checkInSubmission,
  fetchFormBundle,
  fetchForms,
  fetchFormSubmissions,
  fetchPublicForm,
  saveForm,
  submitForm,
  type FormEditorInput,
  type FormField,
} from '../services/formsService'

export function useForms() {
  return useQuery({
    queryKey: ['forms'],
    queryFn: fetchForms,
    staleTime: 60 * 1000,
  })
}

export function useFormBundle(formId: string | null) {
  return useQuery({
    queryKey: ['forms', formId],
    queryFn: () => fetchFormBundle(formId!),
    enabled: Boolean(formId),
  })
}

export function usePublicForm(slug: string | undefined) {
  return useQuery({
    queryKey: ['public-form', slug],
    queryFn: () => fetchPublicForm(slug!),
    enabled: Boolean(slug),
    retry: 0,
  })
}

export function useSaveForm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ formId, input }: { formId?: string; input: FormEditorInput }) => saveForm(input, formId),
    onSuccess: (form) => {
      qc.invalidateQueries({ queryKey: ['forms'] })
      qc.invalidateQueries({ queryKey: ['forms', form.id] })
    },
  })
}

export function useFormSubmissions(formId: string | null) {
  return useQuery({
    queryKey: ['form-submissions', formId],
    queryFn: () => fetchFormSubmissions(formId!),
    enabled: Boolean(formId),
    staleTime: 30 * 1000,
  })
}

export function useSubmitForm() {
  return useMutation({
    mutationFn: ({ formId, answers, fields }: { formId: string; answers: Record<string, unknown>; fields: FormField[] }) =>
      submitForm(formId, answers, fields),
  })
}

export function useCheckInSubmission(formId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ submissionId, checkedIn, checkedInBy }: { submissionId: string; checkedIn: boolean; checkedInBy: string }) =>
      checkInSubmission(submissionId, checkedIn, checkedInBy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['form-submissions', formId] })
    },
  })
}
