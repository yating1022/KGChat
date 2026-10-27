import { Download, MoreHorizontal, PanelLeft, Share2 } from 'lucide-react'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'

import { useAuthStore } from '../../auth/authStore'
import type { ChatMessage, ChatSession, SessionSummary } from '../../chat/chatTypes'
import {
  loadSession,
  readActiveSessionId,
  readSessionIndex,
} from '../../chat/sessionRepository'
import { DECOY_ACCOUNTS } from '../../decoy/decoyAccount'
import { createId } from '../../lib/ids'
import { Brand } from '../../skins/Brand'
import { accountPlanText, chatFooterText } from '../../skins/copy'
import type { BrandingMode, SkinName } from '../../skins/types'
import { ChatLayout } from '../chat/ChatLayout'
import { ChatMarkdown } from '../chat/ChatMarkdown'
import { Composer } from '../chat/Composer'
import { MessageList } from '../chat/MessageList'
import { Sidebar } from '../chat/Sidebar'

export interface QuickHideOverlayProps {
  skin: SkinName
  branding: BrandingMode
}

const noop = () => {}

/** A plausible, content-free reply so the decoy stays interactive. */
export function decoyReply(text: string): string {
  const trimmed = text.trim()
  if (/^(hi|hello|你好|您好|嗨|在吗)/i.test(trimmed)) {
    return '你好！有什么可以帮你的？'
  }
  if (/谢谢|感谢/.test(trimmed)) {
    return '不客气，有需要随时和我说。'
  }
  return '好的，我先看一下。你可以再补充一点背景，我再帮你细看。'
}

/**
 * The decoy may only show untouched imported conversations: chat mode, no
 * practice state, and plain text messages. Anything else could leak quiz UI.
 */
export function isDecoySafeChat(session: ChatSession): boolean {
  if (session.mode !== 'chat') return false
  if (session.practice || session.shenlun || session.analyze || session.word) return false
  return session.messages.every((message) => message.kind === 'text')
}

function emptySession(): ChatSession {
  const now = Date.now()
  return {
    id: 'decoy-empty',
    title: '新对话',
    createdAt: now,
    updatedAt: now,
    messages: [],
    draft: '',
    scrollTop: 0,
    mode: 'chat',
  }
}

/**
 * Full-screen decoy used by quick-hide.
 *
 * The rail and the visible conversation come from the same imported chats the
 * live app lists, and the rail stays switchable here. Only imported sessions
 * are rendered, and only when they contain no quiz UI, so practice content
 * never reaches this surface. Typing and sending stay in local state.
 */
export const QuickHideOverlay = forwardRef<HTMLDivElement, QuickHideOverlayProps>(
  function QuickHideOverlay({ skin, branding }, ref) {
    const imported = useMemo<SessionSummary[]>(
      () => readSessionIndex().filter((summary) => summary.origin === 'import'),
      [],
    )

    const [records, setRecords] = useState<ChatSession[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [draft, setDraft] = useState('')
    const [extras, setExtras] = useState<Record<string, ChatMessage[]>>({})
    const timerRef = useRef<number | null>(null)

    const profile = useAuthStore((state) => state.profile)
    const cover = DECOY_ACCOUNTS[skin]

    useEffect(() => {
      if (imported.length === 0) {
        setRecords([])
        return
      }

      let cancelled = false

      void Promise.all(
        imported.map(async (summary) => {
          const session = await loadSession(summary.id).catch(() => null)
          return session && isDecoySafeChat(session) ? session : null
        }),
      ).then((list) => {
        if (cancelled) return

        const safe = list.filter((item): item is ChatSession => item !== null)
        setRecords(safe)
        setSelectedId((current) => {
          if (current && safe.some((item) => item.id === current)) return current
          const activeId = readActiveSessionId()
          return (safe.find((item) => item.id === activeId) ?? safe[0])?.id ?? null
        })
      })

      return () => {
        cancelled = true
      }
    }, [imported])

    useEffect(
      () => () => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      },
      [],
    )

    const railSessions = useMemo<SessionSummary[]>(
      () =>
        records.map((session) => ({
          id: session.id,
          title: session.title,
          updatedAt: session.updatedAt,
          origin: 'import' as const,
        })),
      [records],
    )

    const selected = records.find((item) => item.id === selectedId) ?? null
    const baseSession = selected ?? emptySession()
    const conversationKey = selected?.id ?? 'local'
    const pending = extras[conversationKey] ?? []

    const session = useMemo<ChatSession>(
      () => ({ ...baseSession, messages: [...baseSession.messages, ...pending] }),
      [baseSession, pending],
    )

    const accountName = profile?.email ? profile.email.split('@')[0] : cover.name
    const account = {
      name: accountName || cover.name,
      plan: profile ? accountPlanText(skin, profile.vipType) : cover.plan,
      initial: (accountName || cover.name).trim().charAt(0).toUpperCase() || cover.initial,
    }

    const pushMessage = (key: string, message: ChatMessage) => {
      setExtras((current) => ({ ...current, [key]: [...(current[key] ?? []), message] }))
    }

    const send = (value: string) => {
      const text = value.trim()
      if (!text) return

      const key = conversationKey
      setDraft('')
      pushMessage(key, {
        id: createId('decoy'),
        role: 'user',
        kind: 'text',
        content: text,
        createdAt: Date.now(),
      })

      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        pushMessage(key, {
          id: createId('decoy'),
          role: 'assistant',
          kind: 'text',
          content: decoyReply(text),
          createdAt: Date.now(),
        })
      }, 700)
    }

    return (
      <div
        ref={ref}
        className={`quick-hide quick-hide--${skin}`}
        role="region"
        aria-label="对话"
        tabIndex={-1}
      >
        <ChatLayout
          skin={skin}
          sidebarOpen={false}
          onCloseSidebar={noop}
          sidebar={
            <Sidebar
              skin={skin}
              sessions={railSessions}
              activeSessionId={selectedId}
              account={account}
              onNewChat={() => {
                setSelectedId(null)
                setDraft('')
              }}
              onSelectSession={(id) => {
                if (id !== selectedId) {
                  setSelectedId(id)
                  setDraft('')
                }
              }}
              onDeleteSession={noop}
              onOpenTools={noop}
              onOpenSettings={noop}
              onOpenAccount={noop}
              onOpenLogin={noop}
              onClose={noop}
            />
          }
          topBar={
            <>
              <div className="topbar-left">
                <span className="topbar-menu quick-hide-static" aria-hidden="true">
                  <PanelLeft size={18} />
                </span>
              </div>
              <div className="topbar-right">
                <span className="topbar-action quick-hide-static">
                  <Download size={16} aria-hidden="true" />
                  <span>导出</span>
                </span>
                <span className="topbar-icon quick-hide-static" aria-hidden="true">
                  <MoreHorizontal size={18} />
                </span>
                {skin === 'chatgpt' ? (
                  <span className="topbar-icon quick-hide-static" aria-hidden="true">
                    <Share2 size={17} />
                  </span>
                ) : null}
              </div>
            </>
          }
        >
          {session.messages.length > 0 ? (
            <MessageList
              key={conversationKey}
              skin={skin}
              session={session}
              favoriteIds={[]}
              onAction={noop}
              onAnswer={noop}
              scrollToBottomOnMount
              renderAssistantText={(text) => <ChatMarkdown text={text} />}
            />
          ) : (
            <div className="chat-messages">
              <div className="quick-hide-empty">
                <Brand skin={skin} branding={branding} size={26} showWordmark={false} />
                <p>有什么可以帮你？</p>
              </div>
            </div>
          )}

          <div className="chat-composer-dock">
            <Composer
              skin={skin}
              branding={branding}
              value={draft}
              onChange={setDraft}
              onSend={send}
              variant="docked"
            />
          </div>

          <p className="chat-disclaimer">{chatFooterText(skin)}</p>
        </ChatLayout>
      </div>
    )
  },
)
