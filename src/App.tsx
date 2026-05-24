import { useEffect, useState, useRef, useLayoutEffect } from 'react'
import { LayoutDashboard, ClipboardList, Users, Settings, LogOut, ShoppingBag, PanelLeft, Phone, ClipboardCheck, Monitor, MoreHorizontal } from 'lucide-react'
import { ApiProvider, useApiConfig } from './context/ApiContext'
import { Dashboard } from './pages/Dashboard'
import { RecentBookings } from './pages/RecentBookings'
import { Customers } from './pages/Customers'
import { Shop } from './pages/Shop'
import { Calls } from './pages/Calls'
import { Narvaro } from './pages/Narvaro'
import { Signage } from './pages/Signage'
import { LoginPage } from './pages/LoginPage'
import { SettingsModal } from './components/SettingsModal'

type Tab = 'dashboard' | 'bookings' | 'customers' | 'shop' | 'calls' | 'narvaro' | 'signage'

const NAV = [
  { id: 'dashboard' as Tab, label: 'Översikt',    Icon: LayoutDashboard },
  { id: 'bookings'  as Tab, label: 'Anmälningar', Icon: ClipboardList   },
  { id: 'customers' as Tab, label: 'Kunder',       Icon: Users           },
  { id: 'shop'      as Tab, label: 'Shop',          Icon: ShoppingBag    },
  { id: 'calls'     as Tab, label: 'Samtal',        Icon: Phone           },
  { id: 'narvaro'   as Tab, label: 'Närvaro',       Icon: ClipboardCheck  },
  { id: 'signage'   as Tab, label: 'Skyltning',     Icon: Monitor         },
]

function AppShell() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('sds-theme')
    if (stored) return stored === 'dark'
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  })
  const { config, setConfig } = useApiConfig()
  const hasPw = Boolean(config.pw)
  const navRef = useRef<HTMLElement>(null)
  const [pill, setPill] = useState({ top: 0, height: 0 })

  useLayoutEffect(() => {
    if (!hasPw) return
    const btn = navRef.current?.querySelector<HTMLButtonElement>('[data-active="true"]')
    if (btn) setPill({ top: btn.offsetTop, height: btn.offsetHeight })
  }, [tab, hasPw, collapsed])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('sds-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  if (!hasPw) return <LoginPage />

  return (
    <div className="flex h-screen bg-white dark:bg-[var(--dark-page)] overflow-hidden">
      {/* ── Sidebar (desktop) ── */}
      <aside
        className="sds-sidebar hidden md:flex shrink-0 flex-col bg-slate-50 border-r border-slate-200 transition-all duration-250 ease-out"
        style={{ width: collapsed ? 68 : 224 }}
      >
        {/* Logo */}
        <div className={`py-4 border-b border-slate-200 flex items-center gap-3 transition-all duration-250 ${collapsed ? 'justify-center px-0' : 'px-5'}`}>
          <img src="logo.png" alt="SDS" className="w-8 h-8 object-contain shrink-0 dark:brightness-0 dark:invert" />
          {!collapsed && (
            <div>
              <p className="text-xl font-bold tracking-widest text-brand-forest leading-none">CORE</p>
              <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase leading-tight mt-0.5">by SDS</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav ref={navRef} className="flex-1 p-3 space-y-0.5 relative">
          {/* Sliding pill */}
          {pill.height > 0 && (
            <div
              className="sds-sidebar-pill absolute left-3 right-3 bg-brand-mint rounded-xl transition-all duration-200 ease-out pointer-events-none"
              style={{ top: pill.top, height: pill.height }}
            />
          )}
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              data-active={String(tab === id)}
              onClick={() => setTab(id)}
              title={collapsed ? label : undefined}
              className={`sds-nav-item relative z-10 w-full flex items-center gap-3 rounded-xl text-sm font-medium transition-colors ${
                collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
              } ${tab === id ? 'sds-nav-item-active text-brand-dark' : 'text-slate-500 hover:text-brand-dark'}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && label}
            </button>
          ))}
        </nav>

        {/* Collapse toggle + Settings + Logout */}
        <div className="p-3 border-t border-slate-100 space-y-0.5">
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expandera meny' : 'Minimera meny'}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-brand-dark hover:bg-slate-100 transition-colors ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <PanelLeft className={`w-4 h-4 shrink-0 transition-transform duration-250 ${collapsed ? 'rotate-180' : ''}`} />
            {!collapsed && 'Minimera'}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title={collapsed ? 'Inställningar' : undefined}
            className={`w-full flex items-center gap-3 rounded-xl text-sm font-medium transition-colors ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'} ${
              hasPw
                ? 'text-slate-500 hover:bg-slate-50 hover:text-brand-dark'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            {!collapsed && (hasPw ? 'Inställningar' : 'Ange API-nyckel')}
          </button>
          {hasPw && (
            <button
              onClick={() => setConfig({ org: 'sollentunadans', pw: '' })}
              title={collapsed ? 'Logga ut' : undefined}
              className={`w-full flex items-center gap-3 rounded-xl text-sm font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}`}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!collapsed && 'Logga ut'}
            </button>
          )}
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
          {tab === 'dashboard' && <Dashboard darkMode={darkMode} onToggleDarkMode={() => setDarkMode((value) => !value)} />}
          {tab === 'bookings'  && <RecentBookings />}
          {tab === 'customers' && <Customers />}
          {tab === 'shop'      && <Shop />}
          {tab === 'calls'     && <Calls />}
          {tab === 'narvaro'   && <Narvaro />}
          {tab === 'signage'   && <Signage />}
        </main>
      </div>

      {/* ── Bottom nav (mobile) ── */}
      {(() => {
        const BOTTOM: { id: Tab; label: string; Icon: React.ElementType }[] = [
          { id: 'dashboard', label: 'Översikt',    Icon: LayoutDashboard },
          { id: 'bookings',  label: 'Anmälningar', Icon: ClipboardList   },
          { id: 'customers', label: 'Kunder',      Icon: Users           },
          { id: 'shop',      label: 'Shop',        Icon: ShoppingBag     },
        ]
        const MORE: { id: Tab; label: string; Icon: React.ElementType }[] = [
          { id: 'calls',   label: 'Samtal',    Icon: Phone         },
          { id: 'narvaro', label: 'Närvaro',   Icon: ClipboardCheck },
          { id: 'signage', label: 'Skyltning', Icon: Monitor       },
        ]
        const isMoreActive = MORE.some(m => m.id === tab)
        function pick(id: Tab) { setTab(id); setDrawerOpen(false) }

        return (
          <>
            <nav
              className="md:hidden fixed inset-x-0 bottom-0 z-30 px-4 pb-4"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-end justify-center gap-3">
                <div className="sds-bottom-nav grid grid-cols-4 h-16 flex-1 max-w-[390px] rounded-full border border-white/30 bg-white/70 shadow-[0_16px_40px_rgba(15,23,42,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-black/35 dark:shadow-[0_18px_48px_rgba(0,0,0,0.34)]">
                  {BOTTOM.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => pick(id)}
                      aria-label={label}
                      aria-current={tab === id ? 'page' : undefined}
                      className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                        tab === id ? 'text-[#1e4025] dark:text-[var(--dark-positive)]' : 'text-[#9ca3af] dark:text-[var(--dark-text-muted)]'
                      }`}
                    >
                      <Icon
                        className="w-6 h-6"
                        style={{ strokeWidth: tab === id ? 2.5 : 2 }}
                      />
                      <span className="text-[10px] font-medium">
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setDrawerOpen(o => !o)}
                  aria-label="Mer"
                  className={`sds-bottom-nav relative flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border border-white/30 bg-white/70 shadow-[0_16px_40px_rgba(15,23,42,0.18)] backdrop-blur-2xl transition-colors dark:border-white/10 dark:bg-black/35 dark:shadow-[0_18px_48px_rgba(0,0,0,0.34)] ${
                    isMoreActive || drawerOpen ? 'text-[#1e4025] dark:text-[var(--dark-positive)]' : 'text-[#9ca3af] dark:text-[var(--dark-text-muted)]'
                  }`}
                >
                  <div className="relative">
                    <MoreHorizontal
                      className="w-6 h-6"
                      style={{ strokeWidth: isMoreActive || drawerOpen ? 2.5 : 2 }}
                    />
                    {isMoreActive && !drawerOpen && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#dd5c86] dark:bg-[var(--dark-warning)]" />
                    )}
                  </div>
                  <span className="text-[10px] font-medium">
                    Mer
                  </span>
                </button>
              </div>
            </nav>

            {/* Backdrop */}
            {drawerOpen && (
              <div
                className="fixed inset-0 bg-black/30 z-40 md:hidden"
                onClick={() => setDrawerOpen(false)}
              />
            )}

            {/* Drawer */}
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Fler navigeringsalternativ"
              className={`sds-drawer fixed inset-x-3 bottom-3 bg-white rounded-[28px] z-50 md:hidden transform border border-white/30 shadow-2xl backdrop-blur-2xl transition-transform duration-300 ease-out dark:border-white/10 ${
                drawerOpen ? 'translate-y-0' : 'translate-y-full'
              }`}
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>
              {MORE.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => pick(id)}
                  aria-label={label}
                  aria-current={tab === id ? 'page' : undefined}
                  className={`w-full flex items-center gap-4 px-6 hover:bg-slate-50 transition-colors ${
                    tab === id ? 'text-[#1e4025] dark:text-[var(--dark-positive)]' : 'text-[#374151] dark:text-[var(--dark-text-primary)]'
                  }`}
                  style={{ minHeight: 56 }}
                >
                  <Icon className="w-5 h-5 shrink-0" style={{ strokeWidth: tab === id ? 2.5 : 2 }} />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
              <div className="mx-6 my-1 h-px bg-gray-100" />
              <button
                onClick={() => { setSettingsOpen(true); setDrawerOpen(false) }}
                aria-label="Inställningar"
                className="w-full flex items-center gap-4 px-6 hover:bg-slate-50 transition-colors text-[#374151] dark:text-[var(--dark-text-primary)]"
                style={{ minHeight: 56 }}
              >
                <Settings className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium">Inställningar</span>
              </button>
              {hasPw && (
                <button
                  onClick={() => { setConfig({ org: 'sollentunadans', pw: '' }); setDrawerOpen(false) }}
                  aria-label="Logga ut"
                  className="w-full flex items-center gap-4 px-6 hover:bg-red-50 transition-colors mb-2 text-brand-pinkDark dark:text-[var(--dark-warning)]"
                  style={{ minHeight: 56 }}
                >
                  <LogOut className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-medium">Logga ut</span>
                </button>
              )}
            </div>
          </>
        )
      })()}

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
