import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// loadEnv reads .env / .env.local / .env.[mode] for the given mode.
// The third arg '' means "expose ALL vars" (not just VITE_*), so we can read
// VITE_API_URL reliably in the config.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawApi = (env.VITE_API_URL || 'http://localhost:8000').trim().replace(/\/+$/, '')

  // The proxy forwards requests whose path starts with "/api" to the target,
  // KEEPING the "/api" prefix. So the target must be the backend HOST ROOT
  // (without "/api"), otherwise we get a double prefix: /api/api/auth/login.
  const proxyTarget = rawApi.replace(/\/api$/, '') || 'http://localhost:8000'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  }
})
