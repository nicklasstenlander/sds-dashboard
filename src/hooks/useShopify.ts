import { useQuery } from '@tanstack/react-query'

export interface ShopifyLineItem {
  product_id: number
  title: string
  quantity: number
  price: string
}

export interface ShopifyOrder {
  id: number
  created_at: string
  total_price: string
  financial_status: string
  line_items: ShopifyLineItem[]
}

export interface ShopifyProduct {
  id: number
  title: string
  variants: { price: string }[]
  image?: { src: string }
}

export interface ShopifyData {
  updatedAt: string
  orders: ShopifyOrder[]
  products: ShopifyProduct[]
}

async function fetchShopifyData(): Promise<ShopifyData> {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
  const res = await fetch(`${base}data/shopify.json`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useShopify() {
  return useQuery({
    queryKey: ['shopify'],
    queryFn: fetchShopifyData,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000, // polls every 5 min for new deploys
    retry: false,
  })
}
