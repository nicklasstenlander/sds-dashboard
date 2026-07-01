import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase-miljövariabler saknas')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})

export type UserRole = 'admin' | 'teacher' | 'receptionist'

export interface UserProfile {
  id: string
  full_name: string
  role: UserRole
  cogwork_instructor_name: string | null
  telavox_agent: string | null
  created_at: string
}
