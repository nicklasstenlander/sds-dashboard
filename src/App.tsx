import { useState, useRef, useLayoutEffect } from 'react'
import { LayoutDashboard, ClipboardList, Users, Settings } from 'lucide-react'
import { ApiProvider, useApiConfig } from './context/ApiContext'
import { Dashboard } from './pages/Dashboard'
import { RecentBookings } from './pages/RecentBookings'
import { Customers } from './pages/Customers'
import { SettingsModal } from './components/SettingsModal'

type Tab = 'dashboard' | 'bookings' | 'customers'

const NAV = [
  { id: 'dashboard' as Tab, label: 'Översikt',    Icon: LayoutDashboard },
  { id: 'bookings'  as Tab, label: 'Anmälningar', Icon: ClipboardList   },
  { id: 'customers' as Tab, label: 'Kunder',       Icon: Users           },
]

function AppShell() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { config } = useApiConfig()
  const hasPw = Boolean(config.pw)

  const navRef = useRef<HTMLElement>(null)
  const [pill, setPill] = useState({ top: 0, height: 0 })

  useLayoutEffect(() => {
    const btn = navRef.current?.querySelector<HTMLButtonElement>('[data-active="true"]')
    if (btn) setPill({ top: btn.offsetTop, height: btn.offsetHeight })
  }, [tab])

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-slate-50 border-r border-slate-200">
        {/* Logo */}
        <div className="p-5 flex items-center gap-3 border-b border-slate-100">
          <img src="logo.png" alt="SDS" className="w-9 h-9 object-contain" />
          <div>
            <p className="text-sm font-bold text-brand-dark leading-tight">SDS</p>
            <p className="text-xs text-slate-400 font-light leading-tight">Dashboard</p>
          </div>
        </div>

        {/* Nav */}
        <nav ref={navRef} className="flex-1 p-3 space-y-0.5 relative">
          {/* Sliding pill */}
          {pill.height > 0 && (
            <div
              className="absolute left-3 right-3 bg-brand-mint rounded-xl transition-all duration-200 ease-out pointer-events-none"
              style={{ top: pill.top, height: pill.height }}
            />
          )}
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              data-active={String(tab === id)}
              onClick={() => setTab(id)}
              className={`relative z-10 w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                tab === id ? 'text-brand-dark' : 'text-slate-500 hover:text-brand-dark'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Settings */}
        <div className="p-3 border-t border-slate-100">
          <button
            onClick={() => setSettingsOpen(true)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              hasPw
                ? 'text-slate-500 hover:bg-slate-50 hover:text-brand-dark'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            {hasPw ? 'Inställningar' : 'Ange API-nyckel'}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {!hasPw && (
          <div className="bg-amber-50 border-b border-amber-100 px-4 md:px-6 py-2.5 text-sm text-amber-700 flex items-center gap-2">
            <span className="font-semibold">API-nyckel saknas</span>
            <span className="font-light hidden sm:inline">— klicka på "Inställningar" för att se data.</span>
          </div>
        )}
        {/* extra bottom padding on mobile so content isn't hidden behind bottom nav */}
        <main className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-6">
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'bookings'  && <RecentBookings />}
          {tab === 'customers' && <Customers />}
        </main>
      </div>

      {/* ── Bottom nav (mobile) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-100 flex safe-area-inset-bottom z-30">
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
              tab === id ? 'text-brand-dark' : 'text-slate-400'
            }`}
          >
            <Icon className={`w-5 h-5 ${tab === id ? 'stroke-[2.5]' : ''}`} />
            {label}
          </button>
        ))}
        <button
          onClick={() => setSettingsOpen(true)}
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
            hasPw ? 'text-slate-400' : 'text-amber-500'
          }`}
        >
          <Settings className="w-5 h-5" />
          Inställningar
        </button>
      </nav>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default function App() {
  return (
    <ApiProvider>
      <AppShell />
    </ApiProvider>
  )
}
