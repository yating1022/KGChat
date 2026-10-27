import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * `frame-ancestors` is ignored when delivered in a `<meta>` element, so the
 * meta policy omits it and the full policy is sent as an HTTP header by the
 * preview server and the static-host configs.
 */
export const PRODUCTION_CSP_META = [
  "default-src 'self'",
  "img-src 'self' https: data:",
  "connect-src 'self' https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

export const PRODUCTION_CSP_HEADER = `${PRODUCTION_CSP_META}; frame-ancestors 'none'`

/**
 * Adds the CSP only to production HTML. Vite dev needs inline scripts for Fast
 * Refresh, so the dev server deliberately stays untouched.
 */
function productionCspPlugin(): Plugin {
  return {
    name: 'ai-chat-production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      if (html.includes('Content-Security-Policy')) return html
      // Insert immediately after <head> so the policy applies to every
      // stylesheet/script Vite injects later in the document.
      return html.replace(
        /<head>/i,
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP_META}" />`,
      )
    },
  }
}

// The app talks to the SaDuck API directly. The dev proxy below is an optional
// fallback for environments where the browser blocks the cross-origin request;
// it is not used unless the API base URL is configured to `/saduck-api`.
export default defineConfig({
  // GitHub Pages project sites are served from /<repo>/, so the build workflow
  // sets VITE_BASE=/KGChat/. Local dev keeps the root base.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss(), productionCspPlugin()],
  server: {
    port: 4521,
    proxy: {
      '/saduck-api': {
        target: 'https://saduck.top',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/saduck-api/, '/api'),
      },
    },
  },
  preview: {
    port: 4521,
    headers: {
      'Content-Security-Policy': PRODUCTION_CSP_HEADER,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/api/**', 'src/auth/**'],
    },
  },
})
