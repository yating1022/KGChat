import { useEffect, useRef } from 'react'

export const DOUBLE_ESCAPE_WINDOW_MS = 400

/**
 * True while a dialog or an inline destructive confirmation is open. In that
 * state Escape belongs to the modal/confirmation, not to quick-hide.
 */
export function isQuickHideBlocked(): boolean {
  if (typeof document === 'undefined') return false
  return Boolean(document.querySelector('[aria-modal="true"], [data-confirm-open="true"]'))
}

export interface UseDoubleEscapeOptions {
  enabled: boolean
  onToggle: () => void
  /** Override the default modal/confirmation check, useful in tests. */
  isBlocked?: () => boolean
  windowMs?: number
}

/**
 * Calls `onToggle` when Escape is pressed twice within `windowMs`.
 * Escape presses that close a dialog are ignored and do not start a sequence.
 */
export function useDoubleEscape({
  enabled,
  onToggle,
  isBlocked = isQuickHideBlocked,
  windowMs = DOUBLE_ESCAPE_WINDOW_MS,
}: UseDoubleEscapeOptions): void {
  const lastPressRef = useRef(0)
  const toggleRef = useRef(onToggle)
  const blockedRef = useRef(isBlocked)

  toggleRef.current = onToggle
  blockedRef.current = isBlocked

  useEffect(() => {
    if (!enabled) {
      lastPressRef.current = 0
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (blockedRef.current()) {
        lastPressRef.current = 0
        return
      }

      const now = Date.now()
      const previous = lastPressRef.current

      if (previous > 0 && now - previous <= windowMs) {
        lastPressRef.current = 0
        toggleRef.current()
        return
      }

      lastPressRef.current = now
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, windowMs])
}
