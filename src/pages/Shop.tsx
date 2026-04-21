import { useState, useMemo } from 'react'
import { ShoppingBag, TrendingUp, Receipt, RefreshCw, Clock, Zap, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  format, formatDistanceToNow, parseISO, subDays, subMonths, subYears,
  startOfDay, startOfWeek, startOfMonth, getISOWeek,
} from 'date-fns'
import { sv } from 'date-fns/locale'
import { useShopify } from '../hooks/useShopify'
import type { ShopifyOrder } from '../hooks/useShopify'
import { KPICard } from '../components/KPICard'

type Period = 'day' | 'week' | 'month' | 'year'

const PERIOD_LABELS: Record<Period, string> = { day: 'Dag', week: 'Vecka', month: 'Månad', year: 'År' }
const PAGE_SIZE = 10

function periodCutoff(p: Period): Date {
  const now = new Date()
  if (p === 'day')   return subDays(now, 1)
  if (p === 'week')  return subDays(now, 7)
  if (p === 'month') return subMonths(now, 1)
  return subYears(now, 1)
}

// Auto chart granularity based on period
function autoGran(p: Period) {
  if (p === 'day')   return 'hour'
  if (p === 'week')  return 'day'
  if (p === 'month') return 'week'
  return 'month'
}

export function Shop() {
  const [period, setPeriod] = useState<Period>('month')
  const [page, setPage] = useState(0)
  const { data, isLoading, isError, refetch, isFetching } = useShopify()

  const allOrders = data?.orders ?? []
  const products  = data?.products ?? []

  const orders = useMemo(() => {
    const cutoff = periodCutoff(period)
    return allOrders.filter((o) => new Date(o.created_at) >= cutoff)
  }, [allOrders, period])

  const kpi          = useMemo(() => computeKPI(orders), [orders])
  const chartData    = useMemo(() => buildChartData(orders, autoGran(period)), [orders, period])
  const productStats = useMemo(() => computeProductStats(orders, products), [orders, products])
  const allSales     = useMemo(() => buildRecentSales(orders), [orders])
  const totalPages   = Math.ceil(allSales.length / PAGE_SIZE)
  const pageSales    = allSales.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset page when period changes
  const handlePeriod = (p: Period) => { setPeriod(p); setPage(0) }

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
            <code className="bg-slate-100 px-1 rounded text-xs">SHOPIFY_ACCESS_TOKEN</code> som repository secret.
          </p>
        </div>
      </div>
    )
  }

  const chartTitle: Record<string, string> = {
    hour: 'Försäljning per timme', day: 'Försäljning per dag',
    week: 'Försäljning per vecka', month: 'Försäljning per månad',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-dark">Shop</h1>
        <div className="flex items-center gap-3">
          {data.updatedAt && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              {format(parseISO(data.updatedAt), 'd MMM HH:mm', { locale: sv })}
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

      {/* Global period filter */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => handlePeriod(p)}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              period === p
                ? 'bg-white text-brand-dark shadow-sm'
                : 'text-slate-500 hover:text-brand-dark'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Ordrar"
          value={kpi.totalOrders.toLocaleString('sv-SE')}
          subtitle={PERIOD_LABELS[period].toLowerCase()}
          icon={<Receipt className="w-6 h-6" />}
          color="violet"
        />
        <KPICard
          title="Omsättning"
          value={kpi.totalRevenue >= 1000
            ? `${(kpi.totalRevenue / 1000).toFixed(1)} tkr`
            : `${Math.round(kpi.totalRevenue).toLocaleString('sv-SE')} kr`}
          subtitle={`${Math.round(kpi.totalRevenue).toLocaleString('sv-SE')} kr`}
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
          title="Sålda varor"
          value={kpi.totalItems.toLocaleString('sv-SE')}
          subtitle="antal artiklar"
          icon={<Receipt className="w-6 h-6" />}
          color="amber"
        />
      </div>

      {/* Live sales feed */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-brand-pinkDark" />
            <h2 className="text-sm font-semibold text-slate-700">Senaste försäljningar</h2>
            <span className="text-xs text-slate-400">{allSales.length} varor</span>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <ul className="divide-y divide-slate-50">
          {pageSales.length === 0 ? (
            <li className="px-5 py-8 text-center text-sm text-slate-400">Inga försäljningar under perioden</li>
          ) : (
            pageSales.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-brand-mint/30 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-dark truncate">{s.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatDistanceToNow(parseISO(s.createdAt), { addSuffix: true, locale: sv })}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {s.quantity > 1 && <p className="text-xs text-slate-400">{s.quantity} st</p>}
                  <p className="text-sm font-semibold text-brand-dark tabular-nums">
                    {(parseFloat(s.price) * s.quantity).toLocaleString('sv-SE')} kr
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Chart */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">{chartTitle[autoGran(period)]}</h2>
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
                <tr><td colSpan={3} className="px-5 py-8 text-center text-slate-400 text-sm">Inga produkter under perioden</td></tr>
              ) : (
                productStats.map((p) => (
                  <tr key={p.title} className="hover:bg-brand-mint/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-brand-dark">{p.title}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">{p.qty}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">{p.revenue.toLocaleString('sv-SE')} kr</td>
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
  const totalOrders  = paid.length
  const avgOrder     = totalOrders > 0 ? totalRevenue / totalOrders : 0
  const totalItems   = paid.reduce((s, o) => s + o.line_items.reduce((n, li) => n + li.quantity, 0), 0)
  return { totalRevenue, totalOrders, avgOrder, totalItems }
}

function buildChartData(orders: ShopifyOrder[], gran: string) {
  const paid = orders.filter((o) => o.financial_status === 'paid')
  const buckets: Record<string, number> = {}
  for (const o of paid) {
    const d = parseISO(o.created_at)
    let key: string
    if (gran === 'hour')       key = format(d, 'yyyy-MM-dd HH')
    else if (gran === 'day')   key = format(startOfDay(d), 'yyyy-MM-dd')
    else if (gran === 'week')  key = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    else                       key = format(startOfMonth(d), 'yyyy-MM')
    buckets[key] = (buckets[key] ?? 0) + parseFloat(o.total_price)
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, revenue]) => {
      let label: string
      if (gran === 'hour')      label = key.slice(11) + 'h'
      else if (gran === 'day')  label = format(parseISO(key), 'd/M', { locale: sv })
      else if (gran === 'week') label = `v${getISOWeek(parseISO(key))}`
      else                      label = format(parseISO(`${key}-01`), 'MMM yy', { locale: sv })
      return { label, revenue: Math.round(revenue) }
    })
}

function buildRecentSales(orders: ShopifyOrder[]) {
  const items: { title: string; quantity: number; price: string; createdAt: string }[] = []
  for (const o of orders) {
    if (o.financial_status !== 'paid') continue
    for (const li of o.line_items) {
      items.push({ title: li.title, quantity: li.quantity, price: li.price, createdAt: o.created_at })
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function computeProductStats(orders: ShopifyOrder[], _products: import('../hooks/useShopify').ShopifyProduct[]) {
  const stats: Record<string, { qty: number; revenue: number }> = {}
  for (const o of orders) {
    if (o.financial_status !== 'paid') continue
    for (const li of o.line_items) {
      if (!stats[li.title]) stats[li.title] = { qty: 0, revenue: 0 }
      stats[li.title].qty += li.quantity
      stats[li.title].revenue += parseFloat(li.price) * li.quantity
    }
  }
  return Object.entries(stats).map(([title, s]) => ({ title, ...s })).sort((a, b) => b.revenue - a.revenue)
}

function ShopSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-24 bg-slate-100 rounded animate-pulse" />
      <div className="h-9 w-64 bg-slate-100 rounded-xl animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 h-28 bg-slate-50 animate-pulse" />
        ))}
      </div>
      <div className="card h-48 bg-slate-50 animate-pulse" />
      <div className="card p-5 h-64 bg-slate-50 animate-pulse" />
    </div>
  )
}
