import { writeFileSync, mkdirSync } from 'fs'

const SHOP = 'sollentuna-dans-scenskola.myshopify.com'
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN   // shpat_... från Custom App
const CLIENT_ID    = process.env.SHOPIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SHOPIFY_SECRET

function writeEmpty(reason) {
  mkdirSync('public/data', { recursive: true })
  writeFileSync('public/data/shopify.json', JSON.stringify({ updatedAt: null, orders: [], products: [] }, null, 2))
  console.warn(`⚠ Shopify-data hoppades över: ${reason}`)
}

async function shopifyFetch(endpoint) {
  // Custom App: använd access token (shpat_...) via X-Shopify-Access-Token
  // Fallback: Basic Auth för äldre Private Apps
  const headers = ACCESS_TOKEN
    ? { 'X-Shopify-Access-Token': ACCESS_TOKEN, 'Content-Type': 'application/json' }
    : { 'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/json' }

  const res = await fetch(`https://${SHOP}/admin/api/2024-10/${endpoint}`, { headers })
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`)
  return res.json()
}

async function main() {
  if (!ACCESS_TOKEN && (!CLIENT_ID || !CLIENT_SECRET)) {
    writeEmpty('SHOPIFY_ACCESS_TOKEN (eller CLIENT_ID + SECRET) saknas')
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
