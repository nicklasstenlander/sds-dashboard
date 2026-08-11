import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createContentCard,
  deleteContentCard,
  fetchContentCards,
  updateContentCard,
  type ContentCardInput,
} from '../services/contentCardsService'

const CONTENT_CARDS_KEY = ['content-cards']

export function useContentCards() {
  return useQuery({
    queryKey: CONTENT_CARDS_KEY,
    queryFn: fetchContentCards,
    staleTime: 60 * 1000,
  })
}

export function useCreateContentCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (card: ContentCardInput) => createContentCard(card),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONTENT_CARDS_KEY })
    },
  })
}

export function useUpdateContentCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, card }: { id: string; card: Partial<ContentCardInput> }) => updateContentCard(id, card),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONTENT_CARDS_KEY })
    },
  })
}

export function useDeleteContentCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteContentCard(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CONTENT_CARDS_KEY })
    },
  })
}
