import { useState } from 'react'
import { Settings, Music } from 'lucide-react'
import { ApiProvider, useApiConfig } from './context/ApiContext'
import { Dashboard } from './pages/Dashboard'
import { RecentBookings } from './pages/RecentBookings'
import { SettingsModal } from './components/SettingsModal'

type Tab = 'dashboard' | 'bookings'

function AppShell() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { config } = useApiConfig()
  const hasPw = Boolean(config.pw)

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-brand-dark flex items-center justify-center">
              <Music className="w-4 h-4 text-brand-mint" />
            </div>
            <div>
              <h1 className="text-base font-bold text-brand-dark leading-tight">SDS Dashboard</h1>
              <p className="text-xs text-slate-400 font-light">Sollentuna Dans och Scenskola</p>
            </div>
          </div>

          <nav className="flex items-center gap-1 bg-slate-50 rounded-full p-1">
            <button
              onClick={() => setTab('dashboard')}
              className={`tab-btn ${tab === 'dashboard' ? 'tab-btn-active' : 'tab-btn-inactive'}`}
            >
              Översikt
            </button>
            <button
              onClick={() => setTab('bookings')}
              className={`tab-btn ${tab === 'bookings' ? 'tab-btn-active' : 'tab-btn-inactive'}`}
            >
              Anmälningar
            </button>
          </nav>

          <button
            onClick={() => setSettingsOpen(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm transition-colors shrink-0 ${
              hasPw
                ? 'text-slate-500 hover:bg-slate-100'
                : 'text-brand-forest bg-brand-mint hover:bg-brand-mint/80 font-medium'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">{hasPw ? 'Inställningar' : 'Ange API-nyckel'}</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {!hasPw && (
          <div className="mb-6 bg-brand-mintLight border border-brand-mint rounded-2xl p-4 flex items-start gap-3">
            <span className="text-brand-forest mt-0.5 text-lg">!</span>
            <div className="text-sm text-brand-forest">
              <p className="font-bold">API-nyckel saknas</p>
              <p className="mt-0.5 font-light">
                Klicka på "Ange API-nyckel" för att lägga till din CogWork API-nyckel och se all data.
              </p>
            </div>
          </div>
        )}

        {tab === 'dashboard' && <Dashboard />}
        {tab === 'bookings' && <RecentBookings />}
      </main>

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
