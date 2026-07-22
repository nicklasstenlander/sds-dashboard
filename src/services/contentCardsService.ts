import { supabase } from '../lib/supabase'

export type ContentCardType = 'news' | 'event' | 'featured_course' | 'banner'

export interface ContentCard {
  id: string
  type: ContentCardType
  title: string
  body: string | null
  image_url: string | null
  link_url: string | null
  link_label: string | null
  starts_at: string
  expires_at: string | null
  published: boolean
  sort_order: number
  send_push: boolean
  push_sent_at: string | null
  show_on_web: boolean
  show_on_app: boolean
  created_at: string
}

// push_sent_at utelämnas medvetet - det fältet skrivs ENDAST av Workern
// (service-nyckel) när notisen faktiskt skickats, aldrig av admin-UI:t.
export type ContentCardInput = Omit<ContentCard, 'id' | 'created_at' | 'push_sent_at'>

export async function fetchContentCards(): Promise<ContentCard[]> {
  const { data, error } = await supabase
    .from('content_cards')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as ContentCard[]
}

export async function createContentCard(card: ContentCardInput): Promise<ContentCard> {
  const { data, error } = await supabase
    .from('content_cards')
    .insert(card)
    .select('*')
    .single()

  if (error) throw error
  return data as ContentCard
}

export async function updateContentCard(id: string, card: Partial<ContentCardInput>): Promise<ContentCard> {
  const { data, error } = await supabase
    .from('content_cards')
    .update(card)
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return data as ContentCard
}

export async function deleteContentCard(id: string): Promise<void> {
  const { error } = await supabase.from('content_cards').delete().eq('id', id)
  if (error) throw error
}
