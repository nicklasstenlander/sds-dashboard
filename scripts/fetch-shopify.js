import { writeFileSync, mkdirSync } from 'fs'

const SHOP = 'sollentuna-dans-scenskola.myshopify.com'
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SHOPIFY_SECRET

function writeEmpty(reason) {
  mkdirSync('public/data', { recursive: true })
  writeFileSync('public/data/shopify.json', JSON.stringify({ updatedAt: null, orders: [], products: [] }, null, 2))
  console.warn(`⚠ Shopify-data hoppades över: ${reason}`)
}

async function shopifyFetch(endpoint) {
  const token = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
  const res = await fetch(`https://${SHOP}/admin/api/2026-04/${endpoint}`, {
    headers: { 'Authorization': `Basic ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`)
  return res.json()
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    writeEmpty('SHOPIFY_CLIENT_ID eller SHOPIFY_SECRET saknas')
    return
  }

  try {
    const [{ orders = [] }, { products = [] }] = await Promise.all([
      shopifyFetch('orders.json?status=any&limit=250'),
      shopifyFetch('products.json?limit=250'),
    ])

    mkdirSync('public/data', { recursive: true })
    writeFileSync('public/data/shopify.json', JSON.stringify({ updatedAt: new Date().toISOString(), orders, products }, null, 2))
    console.log(`✓ Hämtade ${orders.length} ordrar och ${products.length} produkter`)
  } catch (e) {
    writeEmpty(e.message)
  }
}

main()
