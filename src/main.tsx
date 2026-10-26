import './instrument'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})

function SentryFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <p className="text-sm text-slate-600">Något gick fel. Ladda om sidan och försök igen.</p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<SentryFallback />}>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)
