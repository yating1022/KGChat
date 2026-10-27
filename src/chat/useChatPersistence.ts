import { useCallback, useEffect, useRef } from 'react'

import { useChatStore } from './chatStore'
import { saveSession } from './sessionRepository'
import type { ChatSession } from './chatTypes'

export const SESSION_WRITE_DEBOUNCE_MS = 300

/**
 * Debounces local session writes and flushes them when the page is hidden or
 * unloaded. Failed writes keep the in-memory session and surface a notice.
 */
export function useChatPersistence(): void {
  const session = useChatStore((state) => state.session)
  const setPersistNotice = useChatStore((state) => state.setPersistNotice)
  const latestRef = useRef<ChatSession | null>(session)
  const timerRef = useRef<number | null>(null)

  const flush = useCallback(async () => {
    const current = latestRef.current
    if (!current) return

    const result = await saveSession(current)
    if (!result.ok) {
      setPersistNotice(result.message)
    }
  }, [setPersistNotice])

  useEffect(() => {
    latestRef.current = session
    if (!session) return

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void flush()
    }, SESSION_WRITE_DEBOUNCE_MS)

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [session, flush])

  useEffect(() => {
    const handlePageHide = () => {
      void flush()
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void flush()
      }
    }

    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [flush])
}
