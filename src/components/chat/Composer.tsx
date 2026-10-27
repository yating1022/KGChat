import { ArrowUp, AudioLines, ChevronDown, Mic, Plus } from 'lucide-react'
import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'

import { composerPlaceholder, modelLabel } from '../../skins/copy'
import type { BrandingMode, SkinName } from '../../skins/types'

export interface ComposerProps {
  skin: SkinName
  branding: BrandingMode
  value: string
  onChange?: (value: string) => void
  onSend?: (value: string) => void
  onOpenTools?: () => void
  variant?: 'landing' | 'docked'
  disabled?: boolean
  placeholder?: string
  /** Decoy mode: renders the same chrome but accepts no input. */
  readOnly?: boolean
}

export function Composer({
  skin,
  branding,
  value,
  onChange,
  onSend,
  onOpenTools,
  variant = 'docked',
  disabled = false,
  placeholder,
  readOnly = false,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canSend = value.trim().length > 0 && !disabled && !readOnly

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight || 24, 192)}px`
  }, [value])

  const submit = () => {
    if (!canSend || !onSend) return
    onSend(value)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  return (
    <form
      className={`composer composer--${skin} composer--${variant}${
        readOnly ? ' composer--readonly' : ''
      }`}
      onSubmit={handleSubmit}
      aria-label="输入消息"
    >
      <button
        type="button"
        className="composer-icon composer-plus"
        onClick={onOpenTools}
        aria-label="打开工具"
        tabIndex={readOnly ? -1 : undefined}
      >
        <Plus size={20} aria-hidden="true" />
      </button>

      <textarea
        ref={textareaRef}
        className="composer-input"
        rows={1}
        value={value}
        placeholder={placeholder ?? composerPlaceholder(skin, branding)}
        onChange={(event) => onChange?.(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        readOnly={readOnly}
        aria-label="消息内容"
        tabIndex={readOnly ? -1 : undefined}
      />

      <div className="composer-actions">
        <button
          type="button"
          className="composer-model"
          aria-label="切换模型"
          title="切换模型"
          tabIndex={readOnly ? -1 : undefined}
        >
          <span>{modelLabel(skin, branding)}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="composer-icon composer-mic"
          aria-label="语音输入（暂未开放）"
          title="语音输入暂未开放"
          disabled
          tabIndex={-1}
        >
          <Mic size={18} aria-hidden="true" />
        </button>

        {skin === 'chatgpt' && !canSend ? (
          <button
            type="button"
            className="composer-voice"
            aria-label="语音模式（暂未开放）"
            title="语音模式暂未开放"
            disabled
            tabIndex={-1}
          >
            <AudioLines size={19} aria-hidden="true" />
          </button>
        ) : null}

        {canSend ? (
          <button type="submit" className="composer-send" aria-label="发送">
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </form>
  )
}
