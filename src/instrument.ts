import { useEffect } from 'react'
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom'
import * as Sentry from '@sentry/react'

const PUBLIC_DSN = 'https://1016c5033514434d4805b5e73aa3b99a@o4512322194112512.ingest.de.sentry.io/4512322209841232'

function sentryDsn(): string | undefined {
  const fromEnv = import.meta.env.VITE_SENTRY_DSN
  if (fromEnv === '') return undefined
  return fromEnv || PUBLIC_DSN
}

const dsn = sentryDsn()

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: __SENTRY_RELEASE__,
    integrations: [
      Sentry.reactRouterBrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    tracePropagationTargets: ['localhost', /^\//],
    initialScope: { tags: { runtime: 'sds-dashboard' } },
  })
}
