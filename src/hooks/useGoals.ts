import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchGoals, createGoal, updateGoal, deleteGoal,
  type Goal, type CreateGoalInput,
} from '../services/goalsService'
import type { Booking, Event } from '../types/cogwork'

// ---------------------------------------------------------------------------
// Beräkna nuvarande värde från CogWork-data i cachen
// ---------------------------------------------------------------------------

export function computeCurrentValue(goal: Goal, bookings: Booking[], events: Event[]): number {
  const filteredBookings = goal.event_block_id
    ? bookings.filter(b => b.event?.grouping?.eventBlock?.id === Number(goal.event_block_id))
    : bookings

  const scopedBookings = goal.event_key
    ? filteredBookings.filter(b => b.event?.key === goal.event_key)
    : filteredBookings

  switch (goal.metric) {
    case 'bookings_count':
      return scopedBookings.length

    case 'accepted_count':
      return scopedBookings.filter(b => b.status?.code?.toUpperCase() === 'ACCEPTED').length

    case 'revenue':
      return scopedBookings
        .filter(b => b.status?.code?.toUpperCase() === 'ACCEPTED')
        .reduce((sum, b) => sum + (b.payment?.priceAgreed ?? 0), 0)

    case 'occupancy': {
      const filteredEvents = goal.event_block_id
        ? events.filter(e => e.grouping?.eventBlock?.id === Number(goal.event_block_id))
        : events
      if (filteredEvents.length === 0) return 0
      const total = filteredEvents.reduce((sum, e) => {
        const max      = e.requirements?.maxParticipants ?? 0
        const accepted = e.statistics?.accepted ?? 0
        return max > 0 ? sum + (accepted / max) * 100 : sum
      }, 0)
      return Math.round(total / filteredEvents.length)
    }

    case 'new_students': {
      const countByParticipant = new Map<string, number>()
      bookings.forEach(b => {
        const key = b.participant?.key
        if (key) countByParticipant.set(key, (countByParticipant.get(key) ?? 0) + 1)
      })
      return scopedBookings.filter(b =>
        (countByParticipant.get(b.participant?.key ?? '') ?? 0) === 1
      ).length
    }

    default:
      return 0
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useGoals() {
  return useQuery({
    queryKey: ['goals'],
    queryFn:  fetchGoals,
    staleTime: 60 * 1000,
  })
}

export function useCreateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createGoal,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['goals'] }),
  })
}

export function useUpdateGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<CreateGoalInput> }) =>
      updateGoal(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  })
}

export function useDeleteGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteGoal,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['goals'] }),
  })
}
