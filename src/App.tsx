import { useEffect, useState, useRef, useLayoutEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, Users, Settings, LogOut, ShoppingBag, PanelLeft, Phone, ClipboardCheck, Monitor, CalendarDays, MoreHorizontal, Loader2, FileText } from 'lucide-react'
import { ApiProvider, useApiConfig } from './context/ApiContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { SetPasswordPage } from './pages/SetPasswordPage'
import { SettingsModal } from './components/SettingsModal'

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const RecentBookings = lazy(() => import('./pages/RecentBookings').then(m => ({ default: m.RecentBookings })))
const Customers = lazy(() => import('./pages/Customers').then(m => ({ default: m.Customers })))
const Shop = lazy(() => import('./pages/Shop').then(m => ({ default: m.Shop })))
const Calls = lazy(() => import('./pages/Calls').then(m => ({ default: m.Calls })))
const Narvaro = lazy(() => import('./pages/Narvaro').then(m => ({ default: m.Narvaro })))
const Signage = lazy(() => import('./pages/Signage').then(m => ({ default: m.Signage })))
const Schema = lazy(() => import('./pages/Schema').then(m => ({ default: m.Schema })))
const Forms = lazy(() => import('./pages/Forms').then(m => ({ default: m.Forms })))
const PublicForm = lazy(() => import('./pages/PublicForm').then(m => ({ default: m.PublicForm })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-brand-forest" />
    </div>
  )
}

function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="w-6 h-6 animate-spin text-brand-forest" />
    </div>
  )
}

function PreparingLoader() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: 'linear-gradient(145deg, #007a80 0%, #009399 40%, #45aba5 100%)' }}
    >
      <Loader2 className="w-6 h-6 animate-spin text-white" />
      <p className="text-white/80 text-sm font-light tracking-wide">Förbereder CORE …</p>
    </div>
  )
}

const NAV = [
  { to: '/',            label: 'Översikt',    Icon: LayoutDashboard },
  { to: '/anmalningar', label: 'Anmälningar', Icon: ClipboardList   },
  { to: '/kunder',      label: 'Kunder',       Icon: Users           },
  { to: '/shop',        label: 'Shop',          Icon: ShoppingBag    },
  { to: '/samtal',      label: 'Samtal',        Icon: Phone           },
  { to: '/narvaro',     label: 'Närvaro',       Icon: ClipboardCheck  },
  { to: '/skyltning',   label: 'Skyltning',     Icon: Monitor         },
  { to: '/schema',      label: 'Schema',        Icon: CalendarDays    },
  { to: '/formular',    label: 'Formulär',      Icon: FileText        },
]

function AppShell() {
  const { session, loading: authLoading, usingLegacyAuth, profile, signOut, preparingApi, isPasswordRecovery } = useAuth()
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
  const { pathname } = useLocation()
  const isPublicForm = pathname.startsWith('/f/')
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to))

  const isAuthenticated = Boolean(session) || usingLegacyAuth
  const canSeeSettings = usingLegacyAuth || profile?.role !== 'teacher'

  useLayoutEffect(() => {
    if (!isAuthenticated) return
    const link = navRef.current?.querySelector<HTMLAnchorElement>('[data-active="true"]')
    if (link) setPill({ top: link.offsetTop, height: link.offsetHeight })
  }, [pathname, isAuthenticated, collapsed])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('sds-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  async function handleLogout() {
    await signOut()
    setConfig({ org: 'sollentunadans', pw: '' })
  }

  if (isPublicForm) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/f/:slug" element={<PublicForm />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    )
  }

  if (authLoading) return <FullPageLoader />
  if (isPasswordRecovery) return <SetPasswordPage />
  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }
  if (preparingApi) return <PreparingLoader />

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
          {pill.height > 0 && (
            <div
              className="sds-sidebar-pill absolute left-3 right-3 bg-brand-mint rounded-xl transition-all duration-200 ease-out pointer-events-none"
              style={{ top: pill.top, height: pill.height }}
            />
          )}
          {NAV.map(({ to, label, Icon }) => {
            const active = isActive(to)
            return (
              <NavLink
                key={to}
                to={to}
                data-active={String(active)}
                title={collapsed ? label : undefined}
                className={`sds-nav-item relative z-10 w-full flex items-center gap-3 rounded-xl text-sm font-medium transition-colors ${
                  collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
                } ${active ? 'sds-nav-item-active text-brand-dark' : 'text-slate-500 hover:text-brand-dark'}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && label}
              </NavLink>
            )
          })}
        </nav>

        {/* Användarmeny + kontroller */}
        <div className="p-3 border-t border-slate-100 space-y-0.5">
          {/* Användarbadge */}
          {!collapsed && (
            <div className="px-3 py-2 mb-1">
              {usingLegacyAuth ? (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                  Tillfälligt läge
                </span>
              ) : profile ? (
                <p className="text-xs font-medium text-brand-dark truncate" title={profile.full_name}>
                  {profile.full_name}
                </p>
              ) : null}
            </div>
          )}

          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expandera meny' : 'Minimera meny'}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-brand-dark hover:bg-slate-100 transition-colors ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <PanelLeft className={`w-4 h-4 shrink-0 transition-transform duration-250 ${collapsed ? 'rotate-180' : ''}`} />
            {!collapsed && 'Minimera'}
          </button>

          {canSeeSettings && (
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
          )}

          <button
            onClick={handleLogout}
            title={collapsed ? 'Logga ut' : undefined}
            className={`w-full flex items-center gap-3 rounded-xl text-sm font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors ${collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'}`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && 'Logga ut'}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* extra bottom padding on mobile so content isn't hidden behind bottom nav */}
        <main className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-6">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard darkMode={darkMode} onToggleDarkMode={() => setDarkMode((value) => !value)} />} />
              <Route path="/anmalningar" element={<RecentBookings />} />
              <Route path="/kunder" element={<Customers />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/samtal" element={<Calls />} />
              <Route path="/narvaro" element={<Narvaro />} />
              <Route path="/skyltning" element={<Signage />} />
              <Route path="/schema" element={<Schema />} />
              <Route path="/formular" element={<Forms />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {/* ── Bottenmeny (mobil) ── */}
      {(() => {
        const BOTTOM: { to: string; label: string; Icon: React.ElementType }[] = [
          { to: '/',            label: 'Översikt',    Icon: LayoutDashboard },
          { to: '/anmalningar', label: 'Anmälningar', Icon: ClipboardList   },
          { to: '/kunder',      label: 'Kunder',      Icon: Users           },
          { to: '/shop',        label: 'Shop',        Icon: ShoppingBag     },
        ]
        const MORE: { to: string; label: string; Icon: React.ElementType }[] = [
          { to: '/samtal',    label: 'Samtal',    Icon: Phone         },
          { to: '/narvaro',   label: 'Närvaro',   Icon: ClipboardCheck },
          { to: '/skyltning', label: 'Skyltning', Icon: Monitor       },
          { to: '/schema',    label: 'Schema',    Icon: CalendarDays  },
          { to: '/formular',  label: 'Formulär',  Icon: FileText      },
        ]
        const isMoreActive = MORE.some(m => isActive(m.to))

        return (
          <>
            <nav
              className="md:hidden fixed inset-x-0 bottom-0 z-30 px-4 pb-4"
              style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            >
              <div className="flex items-end justify-center gap-3">
                <div className="sds-bottom-nav grid grid-cols-4 h-16 flex-1 max-w-[390px] rounded-full border border-white/30 bg-white/70 shadow-[0_16px_40px_rgba(15,23,42,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-black/35 dark:shadow-[0_18px_48px_rgba(0,0,0,0.34)]">
                  {BOTTOM.map(({ to, label, Icon }) => {
                    const active = isActive(to)
                    return (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={() => setDrawerOpen(false)}
                        aria-label={label}
                        aria-current={active ? 'page' : undefined}
                        className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                          active ? 'text-[#1e4025] dark:text-[var(--dark-positive)]' : 'text-[#9ca3af] dark:text-[var(--dark-text-muted)]'
                        }`}
                      >
                        <Icon
                          className="w-6 h-6"
                          style={{ strokeWidth: active ? 2.5 : 2 }}
                        />
                        <span className="text-[10px] font-medium">
                          {label}
                        </span>
                      </NavLink>
                    )
                  })}
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

              {/* Användarbadge i drawer */}
              {usingLegacyAuth ? (
                <div className="px-6 pb-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                    Tillfälligt läge
                  </span>
                </div>
              ) : profile && (
                <div className="px-6 pb-2">
                  <p className="text-xs font-medium text-slate-500 truncate">{profile.full_name}</p>
                </div>
              )}

              {MORE.map(({ to, label, Icon }) => {
                const active = isActive(to)
                return (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setDrawerOpen(false)}
                    aria-label={label}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center gap-4 px-6 hover:bg-slate-50 transition-colors ${
                      active ? 'text-[#1e4025] dark:text-[var(--dark-positive)]' : 'text-[#374151] dark:text-[var(--dark-text-primary)]'
                    }`}
                    style={{ minHeight: 56 }}
                  >
                    <Icon className="w-5 h-5 shrink-0" style={{ strokeWidth: active ? 2.5 : 2 }} />
                    <span className="text-sm font-medium">{label}</span>
                  </NavLink>
                )
              })}
              <div className="mx-6 my-1 h-px bg-gray-100" />

              {canSeeSettings && (
                <button
                  onClick={() => { setSettingsOpen(true); setDrawerOpen(false) }}
                  aria-label="Inställningar"
                  className="w-full flex items-center gap-4 px-6 hover:bg-slate-50 transition-colors text-[#374151] dark:text-[var(--dark-text-primary)]"
                  style={{ minHeight: 56 }}
                >
                  <Settings className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-medium">Inställningar</span>
                </button>
              )}

              <button
                onClick={() => { handleLogout(); setDrawerOpen(false) }}
                aria-label="Logga ut"
                className="w-full flex items-center gap-4 px-6 hover:bg-red-50 transition-colors mb-2 text-brand-pinkDark dark:text-[var(--dark-warning)]"
                style={{ minHeight: 56 }}
              >
                <LogOut className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium">Logga ut</span>
              </button>
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
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ApiProvider>
  )
}
