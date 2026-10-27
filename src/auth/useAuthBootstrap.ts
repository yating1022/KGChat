import { useEffect } from 'react'

import { AUTH_STORAGE_KEY, readStoredAuth, useAuthStore } from './authStore'

/**
 * Verifies the stored token once on startup and re-bootstraps when another tab
 * rotates or clears the session. The API token itself is never rendered.
 */
export function useAuthBootstrap(): void {
  const bootstrap = useAuthStore((state) => state.bootstrap)
  const verify = useAuthStore((state) => state.verify)

  useEffect(() => {
    void bootstrap()

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_STORAGE_KEY && event.key !== null) return

      const stored = readStoredAuth()
      const current = useAuthStore.getState()

      if (!stored?.token) {
        if (current.token) {
          current.handleAuthFailure()
        }
        return
      }

      if (stored.token !== current.token) {
        void verify(stored.token)
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [bootstrap, verify])
}
