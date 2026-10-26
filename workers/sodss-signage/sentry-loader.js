// Laddar @sentry/cloudflare först när ett anrop kommer in.
// SENTRY_DSN="" hoppar över SDK:t (tester och nödavstängning).
// Saknas nodejs_compat / AsyncLocalStorage i Cloudflare faller anropet
// tillbaka till workern, så en deploy utan den flaggan inte tar ner trafiken.

const wrapped = new WeakMap()

export function withOptionalSentry(handler, runtime) {
  const target = {
    async fetch(request, env, ctx) {
      const resolved = await resolve(handler, env, runtime)
      return resolved.fetch.call(resolved, request, env, ctx)
    },
  }
  if (typeof handler.scheduled === 'function') {
    target.scheduled = async (event, env, ctx) => {
      const resolved = await resolve(handler, env, runtime)
      return resolved.scheduled.call(resolved, event, env, ctx)
    }
  }
  return target
}

async function resolve(handler, env, runtime) {
  if (env && env.SENTRY_DSN === '') return handler
  const cached = wrapped.get(handler)
  if (cached) return cached
  try {
    const { wrapWithSentry } = await import('./sentry-runtime.js')
    const next = wrapWithSentry(handler, runtime)
    wrapped.set(handler, next)
    return next
  } catch (err) {
    console.error('Sentry kunde inte startas:', err && err.message ? err.message : err)
    wrapped.set(handler, handler)
    return handler
  }
}
