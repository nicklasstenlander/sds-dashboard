import { execFileSync } from 'node:child_process'
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

function sentryRelease(): string {
  if (process.env.VITE_SENTRY_RELEASE) return process.env.VITE_SENTRY_RELEASE
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (sha) return `sds-dashboard@${sha}`
  } catch {
    // Arkiv utan git, till exempel en del CI-exportar.
  }
  return 'sds-dashboard@0.1.0'
}

export default defineConfig(() => {
  const release = sentryRelease()
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN ?? ''
  const uploadSourcemaps = sentryAuthToken.length > 0
  const plugins: PluginOption[] = [react()]
  if (uploadSourcemaps) {
    plugins.push(sentryVitePlugin({
      url: process.env.SENTRY_URL || 'https://de.sentry.io',
      org: 'nicklas-stenlander',
      project: 'sds-dashboard',
      authToken: sentryAuthToken,
      telemetry: false,
      release: { name: release },
      sourcemaps: {
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
    }))
  }

  return {
    plugins,
    define: {
      __SENTRY_RELEASE__: JSON.stringify(release),
    },
    base: process.env.VITE_BASE_URL ?? '/',
    server: {
      proxy: {
        '/api/public': {
          target: 'https://dans.se',
          changeOrigin: true,
          secure: true,
        },
      },
    },
    build: {
      sourcemap: uploadSourcemaps ? 'hidden' : false,
      rollupOptions: {
        output: {
          manualChunks: {
            recharts: ['recharts'],
            react: ['react', 'react-dom'],
          },
        },
      },
    },
  }
})
