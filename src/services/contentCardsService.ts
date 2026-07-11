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
  created_at: string
}

export type ContentCardInput = Omit<ContentCard, 'id' | 'created_at'>

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
