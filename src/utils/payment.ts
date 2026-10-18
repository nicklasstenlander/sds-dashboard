import { differenceInCalendarDays } from 'date-fns'
import type { Booking } from '../types/cogwork'

export type PaymentState = 'paid' | 'unpaid' | 'partial' | 'unknown'

export function paymentStatus(b: Booking): PaymentState {
  const p = b.payment
  if (!p) return 'unknown'
  if (p.paid === true) return 'paid'
  if (p.paid === false) {
    if (p.amountPaid != null && p.priceAgreed != null && p.amountPaid > 0 && p.amountPaid < p.priceAgreed)
      return 'partial'
    return 'unpaid'
  }
  return 'unknown'
}

// Antal hela dagar sedan förfallodatumet passerat (0 = ej förfallen / ej obetald).
export function daysOverdue(b: Booking): number {
  const due = b.payment?.paymentDue
  if (!due || paymentStatus(b) !== 'unpaid') return 0
  // Datum utan klockslag gäller hela förfallodagen, så de räknas som förfallna först efter dagens slut.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(due.trim())
  const dueDate = new Date(dateOnly ? `${due.trim()}T23:59:59` : due.replace(' ', 'T'))
  if (Number.isNaN(dueDate.getTime())) return 0
  const diff = Date.now() - dueDate.getTime()
  return diff > 0 ? Math.max(1, Math.floor(diff / 86_400_000)) : 0
}

/** Vit text på #b4234f ≈ 6,4:1 (tidigare status.critical ≈ 3,5:1). */
export const OVERDUE_BADGE_CLASS = 'bg-[#b4234f] text-white'

export function overdueLabel(days: number): string {
  return `Förfallen · ${days} ${days === 1 ? 'dag' : 'dagar'}`
}

/**
 * Hela kalenderdagar kvar till förfallodatumet för en obetald bokning (0 = förfaller idag).
 * null när bokningen inte är obetald, saknar datum eller redan är förfallen (se daysOverdue).
 */
export function daysUntilDue(b: Booking): number | null {
  const due = b.payment?.paymentDue
  if (!due || paymentStatus(b) !== 'unpaid' || daysOverdue(b) > 0) return null
  const dueDate = new Date(due.trim().replace(' ', 'T'))
  if (Number.isNaN(dueDate.getTime())) return null
  return Math.max(0, differenceInCalendarDays(dueDate, new Date()))
}

export function daysLeftLabel(days: number): string {
  if (days === 0) return 'förfaller idag'
  return `${days} ${days === 1 ? 'dag' : 'dagar'} kvar`
}
