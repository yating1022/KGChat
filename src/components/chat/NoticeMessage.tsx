import { AlertTriangle, Info, ShieldAlert } from 'lucide-react'

import type { NoticeTone } from '../../chat/chatTypes'

export interface NoticeMessageProps {
  tone: NoticeTone
  content: string
}

const ICONS = {
  info: Info,
  warning: AlertTriangle,
  error: ShieldAlert,
} as const

export function NoticeMessage({ tone, content }: NoticeMessageProps) {
  const Icon = ICONS[tone]

  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon className="notice-icon" size={16} aria-hidden="true" />
      <p className="notice-text">{content}</p>
    </div>
  )
}
