import { supabase } from './supabase'

/** Marker stored instead of a CogWork password. The browser never holds the org key. */
export const VIA_PROXY = 'via-proxy'

export async function staffAuthHeaders(extra?: HeadersInit): Promise<Headers> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    throw new Error('Ingen CORE-session. Logga in igen.')
  }
  const headers = new Headers(extra)
  headers.set('Authorization', `Bearer ${token}`)
  return headers
}
