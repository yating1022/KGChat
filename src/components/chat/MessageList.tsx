import { ArrowDown } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { ChatAction, ChatSession } from '../../chat/chatTypes'
import type { SkinName } from '../../skins/types'
import { MessageBubble } from './MessageBubble'

export interface MessageListProps {
  skin: SkinName
  session: ChatSession
  favoriteIds: readonly number[]
  onOpenLogin?: () => void
  onAction: (action: ChatAction) => void
  onAnswer: (labels: string[]) => void
  onScrollTopChange?: (scrollTop: number) => void
  scrollToBottomOnMount?: boolean
  renderAssistantText?: (text: string) => ReactNode
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

/** `星期五 8:32`, matching the centered timestamp in the hosted products. */
export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp)
  const weekday = WEEKDAYS[date.getDay()] ?? ''
  return `${weekday} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function MessageList({
  skin,
  session,
  favoriteIds,
  onOpenLogin,
  onAction,
  onAnswer,
  onScrollTopChange,
  scrollToBottomOnMount = false,
  renderAssistantText,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const previousCount = useRef(session.messages.length)
  const [atBottom, setAtBottom] = useState(true)

  const syncAtBottom = (element: HTMLDivElement) => {
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight
    setAtBottom(distance < 48)
  }

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    element.scrollTop = scrollToBottomOnMount ? element.scrollHeight : session.scrollTop
    previousCount.current = session.messages.length
    syncAtBottom(element)
    // Restoration only runs when the session component mounts (keyed by id).
  }, [])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    if (session.messages.length > previousCount.current) {
      element.scrollTop = element.scrollHeight
      onScrollTopChange?.(element.scrollTop)
    }

    previousCount.current = session.messages.length
  }, [session.messages.length, onScrollTopChange])

  let previousAt: number | null = null

  return (
    <>
      <div
        className="chat-messages"
        ref={scrollRef}
        onScroll={(event) => {
          onScrollTopChange?.(event.currentTarget.scrollTop)
          syncAtBottom(event.currentTarget)
        }}
        aria-live="polite"
      >
        <div className="message-column">
          {session.messages.map((message) => {
            const showTime =
              previousAt === null || Math.abs(message.createdAt - previousAt) > 30 * 60 * 1000
            previousAt = message.createdAt

            return (
              <div className="message-block" key={message.id}>
                {showTime ? (
                  <p className="message-time">{formatMessageTime(message.createdAt)}</p>
                ) : null}
                <MessageBubble
                  skin={skin}
                  message={message}
                  practice={session.practice ?? null}
                  shenlun={session.shenlun ?? null}
                  favoriteIds={favoriteIds}
                  onOpenLogin={onOpenLogin}
                  onAction={onAction}
                  onAnswer={onAnswer}
                  renderAssistantText={renderAssistantText}
                />
              </div>
            )
          })}
        </div>
      </div>

      {atBottom ? null : (
        <button
          type="button"
          className="scroll-bottom"
          aria-label="滚动到最新"
          title="滚动到最新"
          onClick={() => {
            const element = scrollRef.current
            if (!element) return
            element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
          }}
        >
          <ArrowDown size={18} aria-hidden="true" />
        </button>
      )}
    </>
  )
}
