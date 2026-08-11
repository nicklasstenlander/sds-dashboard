import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchGoals, createGoal, updateGoal, deleteGoal,
  type Goal, type CreateGoalInput,
} from '../services/goalsService'
import { blockIdToPeriodCode, matchesPeriodCode } from '../utils/periods'
import { bookingMatchesEventBlockId, buildEventIdBlockIdMap, collectKnownEventBlockIds, resolveEventBlockId } from '../utils/eventBlock'
import {
  bookingTicketQuantity, buildCourseMetrics, countBookingsByParticipant,
  isAcceptedBooking, isNewStudentBooking, isStatisticalBooking, isStatisticalEvent, metricsForEvent,
} from '../utils/courseMetrics'
import type { Booking, Event } from '../types/cogwork'

// ---------------------------------------------------------------------------
// Beräkna nuvarande värde från CogWork-data i cachen
// ---------------------------------------------------------------------------

export function computeCurrentValue(goal: Goal, bookings: Booking[], events: Event[]): number {
  const statisticalBookings = bookings.filter(isStatisticalBooking)
  const statisticalEvents = events.filter(isStatisticalEvent)
  const knownEventBlockIds = collectKnownEventBlockIds(events)
  // Bookings' embedded event never carries grouping — resolve via the full
  // events list instead of trying resolveEventBlockId() on the booking itself.
  const eventIdToBlockId = buildEventIdBlockIdMap(events)
  const goalEventBlockId = goal.event_block_id
  const filteredBookings = goalEventBlockId
    ? statisticalBookings.filter(b => bookingMatchesEventBlockId(b.event, goalEventBlockId, eventIdToBlockId, blockIdToPeriodCode(goalEventBlockId)))
    : statisticalBookings

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
      const filteredEvents = goalEventBlockId
        ? statisticalEvents.filter(e => eventMatchesEventBlock(e, goalEventBlockId, knownEventBlockIds))
        : statisticalEvents
      if (filteredEvents.length === 0) return 0
      const total = filteredEvents.reduce((sum, e) => {
        const max      = e.requirements?.maxParticipants ?? 0
        const accepted = metricsForEvent(metricsByEvent, e, false).accepted
        return max > 0 ? sum + (accepted / max) * 100 : sum
      }, 0)
      return Math.round(total / filteredEvents.length)
    }

    case 'new_students': {
      const countByParticipant = countBookingsByParticipant(statisticalBookings)
      return scopedBookings.filter(b => isNewStudentBooking(b, countByParticipant)).length
    }

    default:
      return 0
  }
}

function eventMatchesEventBlock(event: Event, eventBlockId: string | null, knownEventBlockIds: Set<string>): boolean {
  if (!eventBlockId) return true
  if (resolveEventBlockId(event, knownEventBlockIds) === eventBlockId) return true

  const code = blockIdToPeriodCode(eventBlockId)
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
