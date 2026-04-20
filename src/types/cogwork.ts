export interface ApiConfig {
  org: string
  pw: string
}

export interface SearchMeta {
  numRowsFound: number
  shown: {
    numRowsShown: number
    firstShownRowNum: number
    lastShownRowNum: number
  }
  limits: {
    maxRows: number
    maxRowsDefault: number
    maxRowsAllowed: number
  }
}

export interface EventCategory {
  id: number
  name: string
}

export interface EventBlock {
  key: string
  id: number
  name: string
}

export interface Event {
  id: number
  key: string
  name: string
  created: string
  code: string
  category: EventCategory
  place: string
  pricing: {
    currency: string
    basePriceInclVat: number
  }
  registration: {
    status: string
    statusName: string
    statusText: string
    showing: boolean
    open: boolean
  }
  schedule: {
    dayAndTimeInfo: string
    start: { date: string; time: string; dayOfWeek: string }
    end: { date: string; time: string; dayOfWeek: string }
    numberOfPlannedOccasions: number
    numberOfScheduledOccasions: number
  }
  statistics: {
    instructors: number
    staff: number
    accepted: number
  }
  grouping: {
    eventBlock: EventBlock
  }
  requirements: {
    minAge: number
    maxAge: number
    maxParticipants: number
  }
  instructorsName: string
}

export interface BookingPayment {
  paid?: boolean
  amountPaid?: number
  priceAgreed?: number
  currency?: string
  paymentDue?: string
}

export interface Booking {
  key: string
  id: number
  created: string
  event?: {
    id: number
    key: string
    name: string
    code?: string
    startDateTime?: string
    startDate?: string
    startTime?: string
    category?: EventCategory
    pricing?: { currency: string; basePriceInclVat: number }
    grouping?: { eventBlock: EventBlock }
  }
  /** The registered participant (field name from CogWork verbose API) */
  participant?: {
    id?: number
    key?: string
    name?: string
    firstName?: string
    lastName?: string
  }
  status?: {
    name?: string
    code?: string
  }
  payment?: BookingPayment
  /** Legacy field — use payment.paid instead when available */
  finStatus?: string
}

export interface EventsResponse {
  search: SearchMeta
  events: Event[]
}

export interface BookingsResponse {
  search: SearchMeta
  bookings: Booking[]
}
