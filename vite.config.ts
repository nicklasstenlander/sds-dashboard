import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
})
