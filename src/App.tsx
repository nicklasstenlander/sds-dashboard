import { useState } from 'react'
import { LayoutDashboard, ClipboardList, Settings } from 'lucide-react'
import { ApiProvider, useApiConfig } from './context/ApiContext'
import { Dashboard } from './pages/Dashboard'
import { RecentBookings } from './pages/RecentBookings'
import { SettingsModal } from './components/SettingsModal'

type Tab = 'dashboard' | 'bookings'

const NAV = [
  { id: 'dashboard' as Tab, label: 'Översikt',      Icon: LayoutDashboard },
  { id: 'bookings'  as Tab, label: 'Anmälningar',   Icon: ClipboardList   },
]

function AppShell() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { config } = useApiConfig()
  const hasPw = Boolean(config.pw)

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-slate-100">
        {/* Logo */}
        <div className="p-5 flex items-center gap-3 border-b border-slate-100">
          <img src="logo.png" alt="SDS" className="w-9 h-9 object-contain" />
          <div>
            <p className="text-sm font-bold text-brand-dark leading-tight">SDS</p>
            <p className="text-xs text-slate-400 font-light leading-tight">Dashboard</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                tab === id
                  ? 'bg-brand-mint text-brand-dark'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-brand-dark'
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
      <div className="flex-1 flex flex-col overflow-hidden">
        {!hasPw && (
          <div className="bg-amber-50 border-b border-amber-100 px-6 py-2.5 text-sm text-amber-700 flex items-center gap-2">
            <span className="font-semibold">API-nyckel saknas</span>
            <span className="font-light">— klicka på "Ange API-nyckel" i menyn för att se data.</span>
          </div>
        )}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'bookings'  && <RecentBookings />}
        </main>
      </div>

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
