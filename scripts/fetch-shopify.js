const https = require('https')
const fs = require('fs')

const SHOP = 'sollentuna-dans-scenskola.myshopify.com'
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SHOPIFY_SECRET

function fetchShopify(endpoint) {
  const token = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SHOP,
      path: `/admin/api/2026-04/${endpoint}`,
      headers: {
        'Authorization': `Basic ${token}`,
        'Content-Type': 'application/json',
      },
    }
    https.get(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error(`JSON parse failed: ${data.slice(0, 200)}`)) }
      })
    }).on('error', reject)
  })
}

async function fetchAllOrders() {
  let all = []
  let url = 'orders.json?status=any&limit=250'
  while (url) {
    const data = await fetchShopify(url)
    all = all.concat(data.orders ?? [])
    // Shopify returns Link header for pagination — skip for now, 250 is enough
    url = null
  }
  return all
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Missing SHOPIFY_CLIENT_ID or SHOPIFY_SECRET')
    process.exit(1)
  }

  const [orders, products] = await Promise.all([
    fetchAllOrders(),
    fetchShopify('products.json?limit=250').then((d) => d.products ?? []),
  ])

  const output = {
    updatedAt: new Date().toISOString(),
    orders,
    products,
  }

  fs.mkdirSync('public/data', { recursive: true })
  fs.writeFileSync('public/data/shopify.json', JSON.stringify(output, null, 2))
  console.log(`✓ Hämtade ${orders.length} ordrar och ${products.length} produkter`)
}

main().catch((e) => { console.error(e); process.exit(1) })
