import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** Open dialogs, oldest first. Escape belongs to the last (topmost) entry. */
const dialogStack: symbol[] = []
let scrollLockCount = 0
let previousBodyOverflow = ''

function focusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
  )
}

function lockBodyScroll(): void {
  if (typeof document === 'undefined') return
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLockCount += 1
}

function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return
  scrollLockCount = Math.max(0, scrollLockCount - 1)
  if (scrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow
  }
}

export interface UseDialogFocusOptions {
  open: boolean
  onClose: () => void
  containerRef: RefObject<HTMLElement | null>
  /** Element to focus first; defaults to the first focusable control. */
  initialFocusRef?: RefObject<HTMLElement | null>
  lockScroll?: boolean
}

/**
 * Modal/dialog behaviour shared by `Modal` and `LoginDialog`: initial focus, a
 * simple Tab trap, body scroll lock, focus restoration, and Escape routed to
 * only the topmost dialog.
 */
export function useDialogFocus({
  open,
  onClose,
  containerRef,
  initialFocusRef,
  lockScroll = true,
}: UseDialogFocusOptions): void {
  const closeRef = useRef(onClose)
  const initialFocusTargetRef = useRef(initialFocusRef)

  closeRef.current = onClose
  initialFocusTargetRef.current = initialFocusRef

  useEffect(() => {
    if (!open) return

    const container = containerRef.current
    const previousFocus =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const dialogId = Symbol('dialog')

    dialogStack.push(dialogId)
    if (lockScroll) lockBodyScroll()

    const focusTimer = window.setTimeout(() => {
      const preferred = initialFocusTargetRef.current?.current
      const target = preferred ?? focusableElements(container)[0] ?? container
      target?.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (dialogStack[dialogStack.length - 1] !== dialogId) return
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
        return
      }

      if (event.key !== 'Tab' || !container) return

      // Only the topmost dialog owns the focus trap. Without this check a
      // lower dialog's listener would also run and pull focus back into it.
      if (dialogStack[dialogStack.length - 1] !== dialogId) return

      const items = focusableElements(container)
      if (items.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (active === last || !container.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown, true)

      const index = dialogStack.lastIndexOf(dialogId)
      if (index >= 0) dialogStack.splice(index, 1)

      if (lockScroll) unlockBodyScroll()

      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open, containerRef, lockScroll])
}
