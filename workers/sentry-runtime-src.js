import * as Sentry from '@sentry/cloudflare'

// Publik DSN (ingen hemlighet). SENTRY_DSN på workern vinner om den är satt.
const PUBLIC_DSN = 'https://1016c5033514434d4805b5e73aa3b99a@o4512322194112512.ingest.de.sentry.io/4512322209841232'

function stringEnv(env, name) {
  const value = env && env[name]
  return typeof value === 'string' ? value : undefined
}

function tracesSampleRate(env) {
  const raw = stringEnv(env, 'SENTRY_TRACES_SAMPLE_RATE')
  if (raw !== undefined && raw !== '') {
    const n = Number(raw)
    if (Number.isFinite(n)) return n
  }
  return 0.2
}

export function wrapWithSentry(handler, runtime) {
  return Sentry.withSentry((env) => {
    const configured = stringEnv(env, 'SENTRY_DSN')
    const dsn = configured === '' ? undefined : (configured || PUBLIC_DSN)
    return {
      dsn,
      enabled: Boolean(dsn),
      environment: stringEnv(env, 'SENTRY_ENVIRONMENT') || 'production',
      release: stringEnv(env, 'SENTRY_RELEASE') || __SENTRY_WORKER_RELEASE__,
      tracesSampleRate: tracesSampleRate(env),
      initialScope: { tags: { runtime } },
    }
  }, handler)
}
