import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Stamp each build with when it was made and which commit it came from.
 *
 * Without this there is no way to tell a freshly deployed bundle from a stale one by looking at
 * the running site, which makes "I deployed but nothing changed" impossible to diagnose — you
 * end up re-checking source that was correct all along. The admin panel prints this, so the
 * answer is always one glance away.
 *
 * Netlify builds from a shallow clone where git may be unavailable; falling back to the CI's own
 * commit env vars keeps the stamp useful there, and 'unknown' is fine everywhere else.
 */
function gitSha(): string {
  const fromCi = process.env.COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA
  if (fromCi) return fromCi.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        /*
         * Keep the Firebase SDK in a chunk of its own.
         *
         * It is ~676 kB and only changes when the dependency is upgraded, so it wants a long cache
         * life. Left to automatic chunking it gets folded in with whichever shared UI module
         * happens to sit beside it in the import graph — which is exactly what happened the moment
         * the public nav started reading auth state: Firebase landed inside the shared BrandLogo
         * chunk, so every future logo tweak would have invalidated 688 kB instead of 11.
         */
        manualChunks(id: string) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase'
          }
          return undefined
        },
      },
    },
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_SHA__: JSON.stringify(gitSha()),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
})
