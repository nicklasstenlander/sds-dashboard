import { useState, useMemo } from 'react'
import { ShoppingBag, TrendingUp, Receipt, RefreshCw, Clock } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  format, parseISO, startOfDay, startOfWeek, startOfMonth, getISOWeek,
} from 'date-fns'
import { sv } from 'date-fns/locale'
import { useShopify } from '../hooks/useShopify'
import type { ShopifyOrder } from '../hooks/useShopify'
import { KPICard } from '../components/KPICard'

type Granularity = 'day' | 'week' | 'month'

export function Shop() {
  const [gran, setGran] = useState<Granularity>('month')
  const { data, isLoading, isError, refetch, isFetching } = useShopify()

  const orders = data?.orders ?? []
  const products = data?.products ?? []

  const kpi = useMemo(() => computeKPI(orders), [orders])
  const chartData = useMemo(() => buildChartData(orders, gran), [orders, gran])
  const productStats = useMemo(() => computeProductStats(orders, products), [orders, products])

  if (isLoading) return <ShopSkeleton />

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-brand-dark">Shop</h1>
        <div className="card p-10 flex flex-col items-center justify-center text-center gap-3">
          <ShoppingBag className="w-10 h-10 text-slate-200" />
          <p className="font-semibold text-slate-500">Ingen Shopify-data tillgänglig</p>
          <p className="text-sm text-slate-400 max-w-xs">
            Data hämtas via GitHub Actions vid varje deploy. Lägg till{' '}
            <code className="bg-slate-100 px-1 rounded text-xs">SHOPIFY_CLIENT_ID</code> och{' '}
            <code className="bg-slate-100 px-1 rounded text-xs">SHOPIFY_SECRET</code> som repository secrets.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-brand-dark">Shop</h1>
        <div className="flex items-center gap-3">
          {data.updatedAt && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              Uppdaterad {format(parseISO(data.updatedAt), 'd MMM HH:mm', { locale: sv })}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-dark px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Uppdatera</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Totalt ordrar"
          value={kpi.totalOrders.toLocaleString('sv-SE')}
          subtitle="alla betalda"
          icon={<Receipt className="w-6 h-6" />}
          color="violet"
        />
        <KPICard
          title="Total omsättning"
          value={kpi.totalRevenue >= 1000
            ? `${(kpi.totalRevenue / 1000).toFixed(0)} tkr`
            : `${kpi.totalRevenue.toLocaleString('sv-SE')} kr`}
          subtitle={`${kpi.totalRevenue.toLocaleString('sv-SE')} kr`}
          icon={<TrendingUp className="w-6 h-6" />}
          color="emerald"
        />
        <KPICard
          title="Snittordervärde"
          value={`${Math.round(kpi.avgOrder).toLocaleString('sv-SE')} kr`}
          subtitle="per order"
          icon={<ShoppingBag className="w-6 h-6" />}
          color="sky"
        />
        <KPICard
          title="Senaste 30 dagarna"
          value={kpi.last30.toLocaleString('sv-SE')}
          subtitle={`${kpi.last30Revenue.toLocaleString('sv-SE')} kr`}
          icon={<Receipt className="w-6 h-6" />}
          color="amber"
        />
      </div>

      {/* Chart */}
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-slate-700">
            Försäljning {gran === 'day' ? 'per dag' : gran === 'week' ? 'per vecka' : 'per månad'}
          </h2>
          <div className="flex gap-1">
            {(['day', 'week', 'month'] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGran(g)}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                  gran === g
                    ? 'bg-brand-mint text-brand-dark'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                }`}
              >
                {g === 'month' ? 'Månad' : g === 'week' ? 'Vecka' : 'Dag'}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ border: 'none', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
              formatter={(v: number) => [`${v.toLocaleString('sv-SE')} kr`, 'Omsättning']}
            />
            <Bar dataKey="revenue" fill="#dd5c86" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Products table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Produkter</h2>
          <p className="text-xs text-slate-400 mt-0.5">{productStats.length} produkter</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Produkt</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Sålda</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Omsättning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {productStats.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-400 text-sm">Inga produkter hittades</td>
                </tr>
              ) : (
                productStats.map((p) => (
                  <tr key={p.title} className="hover:bg-brand-mint/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-brand-dark">{p.title}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">{p.qty}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                      {p.revenue.toLocaleString('sv-SE')} kr
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function computeKPI(orders: ShopifyOrder[]) {
  const paid = orders.filter((o) => o.financial_status === 'paid')
  const totalRevenue = paid.reduce((s, o) => s + parseFloat(o.total_price), 0)
  const totalOrders = paid.length
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const recent = paid.filter((o) => new Date(o.created_at) >= cutoff)
  const last30 = recent.length
  const last30Revenue = recent.reduce((s, o) => s + parseFloat(o.total_price), 0)

  return { totalRevenue, totalOrders, avgOrder, last30, last30Revenue }
}

function buildChartData(orders: ShopifyOrder[], gran: Granularity) {
  const paid = orders.filter((o) => o.financial_status === 'paid')
  const buckets: Record<string, number> = {}
  for (const o of paid) {
    const d = parseISO(o.created_at)
    let key: string
    if (gran === 'month')     key = format(startOfMonth(d), 'yyyy-MM')
    else if (gran === 'week') key = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    else                      key = format(startOfDay(d), 'yyyy-MM-dd')
    buckets[key] = (buckets[key] ?? 0) + parseFloat(o.total_price)
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, revenue]) => {
      let label: string
      if (gran === 'month')     label = format(parseISO(`${key}-01`), 'MMM yy', { locale: sv })
      else if (gran === 'week') label = `v${getISOWeek(parseISO(key))}`
      else                      label = format(parseISO(key), 'd/M', { locale: sv })
      return { label, revenue: Math.round(revenue) }
    })
}

function computeProductStats(
  orders: ShopifyOrder[],
  _products: import('../hooks/useShopify').ShopifyProduct[],
) {
  const stats: Record<string, { qty: number; revenue: number }> = {}
  for (const o of orders) {
    if (o.financial_status !== 'paid') continue
    for (const li of o.line_items) {
      if (!stats[li.title]) stats[li.title] = { qty: 0, revenue: 0 }
      stats[li.title].qty += li.quantity
      stats[li.title].revenue += parseFloat(li.price) * li.quantity
    }
  }
  return Object.entries(stats)
    .map(([title, s]) => ({ title, ...s }))
    .sort((a, b) => b.revenue - a.revenue)
}

function ShopSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-24 bg-slate-100 rounded animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 h-28 bg-slate-50 animate-pulse" />
        ))}
      </div>
      <div className="card p-5 h-64 bg-slate-50 animate-pulse" />
      <div className="card h-48 bg-slate-50 animate-pulse" />
    </div>
  )
}
