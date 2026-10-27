import { AlertCircle, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { toUserMessage } from '../../api/errors'

export function PickerHeader({
  title,
  subtitle,
  aside,
}: {
  title: string
  subtitle?: string
  aside?: ReactNode
}) {
  return (
    <header className="picker-head">
      <div>
        <h3 className="picker-title">{title}</h3>
        {subtitle ? <p className="picker-subtitle">{subtitle}</p> : null}
      </div>
      {aside ? <div className="picker-head-aside">{aside}</div> : null}
    </header>
  )
}

export function PickerLoading({ label = '正在读取…' }: { label?: string }) {
  return (
    <div className="picker-loading" role="status">
      <Loader2 className="picker-spin" size={15} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function PickerError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="picker-error" role="status">
      <AlertCircle size={16} aria-hidden="true" />
      <span>{toUserMessage(error)}</span>
      {onRetry ? (
        <button type="button" className="picker-chip" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  )
}

export function PickerEmpty({ children }: { children: ReactNode }) {
  return <div className="picker-empty">{children}</div>
}

export function PickerHint({ children }: { children: ReactNode }) {
  return <p className="picker-hint">{children}</p>
}

export const DIFFICULTY_OPTIONS = [
  { label: '不限', value: null },
  { label: '容易', value: 3 },
  { label: '中等', value: 2 },
  { label: '困难', value: 1 },
] as const

export type DifficultyValue = (typeof DIFFICULTY_OPTIONS)[number]['value']

export function DifficultyChips({
  value,
  onChange,
  disabled,
}: {
  value: DifficultyValue
  onChange: (value: DifficultyValue) => void
  disabled?: boolean
}) {
  return (
    <div className="picker-chips" role="group" aria-label="练习难度">
      {DIFFICULTY_OPTIONS.map((option) => (
        <button
          key={option.label}
          type="button"
          className={`picker-chip ${value === option.value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
          disabled={disabled}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function LoginPrompt({ onOpenLogin }: { onOpenLogin?: () => void }) {
  return (
    <PickerEmpty>
      <p>登录后就可以读取这部分内容。</p>
      {onOpenLogin ? (
        <button type="button" className="picker-primary" onClick={onOpenLogin}>
          去登录
        </button>
      ) : null}
    </PickerEmpty>
  )
}
