import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchGoals, createGoal, updateGoal, deleteGoal,
  type Goal, type CreateGoalInput,
} from '../services/goalsService'
import { EVENT_BLOCK_IDS_BY_CODE } from '../config/cogwork'
import { matchesPeriodCode } from '../utils/periods'
import { bookingTicketQuantity, buildCourseMetrics, isAcceptedBooking, metricsForEvent } from '../utils/courseMetrics'
import type { Booking, Event } from '../types/cogwork'

// ---------------------------------------------------------------------------
// Beräkna nuvarande värde från CogWork-data i cachen
// ---------------------------------------------------------------------------

export function computeCurrentValue(goal: Goal, bookings: Booking[], events: Event[]): number {
  const filteredBookings = goal.event_block_id
    ? bookings.filter(b => bookingMatchesEventBlock(b, goal.event_block_id))
    : bookings

  const scopedBookings = goal.event_key
    ? filteredBookings.filter(b => b.event?.key === goal.event_key)
    : filteredBookings

  switch (goal.metric) {
    case 'bookings_count':
      return scopedBookings.reduce((sum, booking) => sum + bookingTicketQuantity(booking), 0)

    case 'accepted_count':
      return scopedBookings
        .filter(isAcceptedBooking)
        .reduce((sum, booking) => sum + bookingTicketQuantity(booking), 0)

    case 'revenue':
      return scopedBookings
        .filter(isAcceptedBooking)
        .reduce((sum, b) => sum + (b.payment?.priceAgreed ?? 0), 0)

    case 'occupancy': {
      const metricsByEvent = buildCourseMetrics(scopedBookings)
      const filteredEvents = goal.event_block_id
        ? events.filter(e => eventMatchesEventBlock(e, goal.event_block_id))
        : events
      if (filteredEvents.length === 0) return 0
      const total = filteredEvents.reduce((sum, e) => {
        const max      = e.requirements?.maxParticipants ?? 0
        const accepted = metricsForEvent(metricsByEvent, e, false).accepted
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

function eventBlockCode(eventBlockId: string | null): string {
  if (!eventBlockId) return ''
  return Object.entries(EVENT_BLOCK_IDS_BY_CODE)
    .find(([, id]) => id === eventBlockId)?.[0] ?? ''
}

function bookingMatchesEventBlock(booking: Booking, eventBlockId: string | null): boolean {
  if (!eventBlockId) return true
  if (String(booking.event?.grouping?.eventBlock?.id ?? '') === eventBlockId) return true

  const code = eventBlockCode(eventBlockId)
  return Boolean(code && matchesPeriodCode(code, [
    booking.event?.code,
    booking.event?.startDate,
    booking.event?.startDateTime,
    booking.event?.grouping?.eventBlock?.name,
  ]))
}

function eventMatchesEventBlock(event: Event, eventBlockId: string | null): boolean {
  if (!eventBlockId) return true
  if (String(event.grouping?.eventBlock?.id ?? '') === eventBlockId) return true

  const code = eventBlockCode(eventBlockId)
  return Boolean(code && matchesPeriodCode(code, [
    event.code,
    event.schedule?.start?.date,
    event.schedule?.start?.date && `${event.schedule.start.date} ${event.schedule.start.time ?? ''}`,
    event.grouping?.eventBlock?.name,
  ]))
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
