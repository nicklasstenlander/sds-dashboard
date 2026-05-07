const PROXY_URL = import.meta.env.VITE_PROXY_URL ?? 'https://sds-cogwork-proxy.nicklas-stenlander.workers.dev'

export type GoalMetric =
  | 'bookings_count'
  | 'accepted_count'
  | 'revenue'
  | 'occupancy'
  | 'new_students'

export interface Goal {
  id:             number
  title:          string
  description:    string | null
  metric:         GoalMetric
  target:         number
  event_block_id: string | null
  event_key:      string | null
  deadline:       string
  created_at:     string
  updated_at:     string
  archived:       number
}

export interface CreateGoalInput {
  title:           string
  description?:    string
  metric:          GoalMetric
  target:          number
  event_block_id?: string
  event_key?:      string
  deadline:        string
}

export async function fetchGoals(): Promise<Goal[]> {
  const res = await fetch(`${PROXY_URL}/goals`)
  if (!res.ok) throw new Error(`Goals API svarade ${res.status}`)
  return res.json()
}

export async function createGoal(input: CreateGoalInput): Promise<Goal> {
  const res = await fetch(`${PROXY_URL}/goals`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`Kunde inte skapa mål: ${res.status}`)
  return res.json()
}

export async function updateGoal(id: number, input: Partial<CreateGoalInput>): Promise<Goal> {
  const res = await fetch(`${PROXY_URL}/goals/${id}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`Kunde inte uppdatera mål: ${res.status}`)
  return res.json()
}

export async function deleteGoal(id: number): Promise<void> {
  const res = await fetch(`${PROXY_URL}/goals/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Kunde inte ta bort mål: ${res.status}`)
}
