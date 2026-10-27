import { X } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useDialogFocus } from '../../hooks/useDialogFocus'

export interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ open, title, onClose, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId()
  const cardRef = useRef<HTMLElement>(null)

  useDialogFocus({ open, onClose, containerRef: cardRef })

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={cardRef}
        className={`modal-card modal-card--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="modal-header">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  )
}
