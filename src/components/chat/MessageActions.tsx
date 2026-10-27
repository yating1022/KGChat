import {
  Copy,
  Download,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Share,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from 'lucide-react'
import { useState } from 'react'

import type { SkinName } from '../../skins/types'

export interface MessageActionsProps {
  skin: SkinName
  role: 'user' | 'assistant'
  text: string
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy path.
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

/**
 * The hover toolbar under a message. Copy is real; the remaining controls are
 * the same passive affordances the hosted products show.
 */
export function MessageActions({ skin, role, text }: MessageActionsProps) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    const ok = await copyText(text)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const copyButton = (
    <button
      type="button"
      className="message-action"
      aria-label={copied ? '已复制' : '复制'}
      title={copied ? '已复制' : '复制'}
      onClick={() => void onCopy()}
    >
      <Copy size={15} aria-hidden="true" />
    </button>
  )

  if (skin === 'gemini') {
    return (
      <div className={`message-actions message-actions--${role}`}>
        <button type="button" className="message-action" aria-label="回答得好" title="回答得好">
          <ThumbsUp size={15} aria-hidden="true" />
        </button>
        <button type="button" className="message-action" aria-label="回答不好" title="回答不好">
          <ThumbsDown size={15} aria-hidden="true" />
        </button>
        {copyButton}
        <button type="button" className="message-action" aria-label="分享" title="分享">
          <Download size={15} aria-hidden="true" />
        </button>
        <button type="button" className="message-action" aria-label="更多" title="更多">
          <MoreHorizontal size={15} aria-hidden="true" />
        </button>
      </div>
    )
  }

  if (role === 'user') {
    return (
      <div className="message-actions message-actions--user">
        {copyButton}
        <button type="button" className="message-action" aria-label="分享" title="分享">
          <Share size={15} aria-hidden="true" />
        </button>
        <button type="button" className="message-action" aria-label="编辑" title="编辑">
          <Pencil size={15} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <div className="message-actions message-actions--assistant">
      {copyButton}
      <button type="button" className="message-action" aria-label="朗读" title="朗读">
        <Volume2 size={15} aria-hidden="true" />
      </button>
      <button type="button" className="message-action" aria-label="回答不好" title="回答不好">
        <ThumbsDown size={15} aria-hidden="true" />
      </button>
      <button type="button" className="message-action" aria-label="重新生成" title="重新生成">
        <RefreshCw size={15} aria-hidden="true" />
      </button>
      <button type="button" className="message-action" aria-label="更多" title="更多">
        <MoreHorizontal size={15} aria-hidden="true" />
      </button>
    </div>
  )
}
