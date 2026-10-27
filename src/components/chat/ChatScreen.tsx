import { Download, MoreHorizontal, PanelLeft, Share2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { useAuthStore } from '../../auth/authStore'
import { useChatStore } from '../../chat/chatStore'
import type { ChatAction } from '../../chat/chatTypes'
import { downloadHistoryBackup } from '../../chat/historyTransfer'
import {
  SHENLUN_MIN_ANSWER_LENGTH,
  shenlunAnswerLength,
} from '../../features/shenlun/shenlunService'
import { useSettingsStore } from '../../settings/settingsStore'
import { accountPlanText, chatFooterText } from '../../skins/copy'
import type { BrandingMode, SkinName } from '../../skins/types'
import { Modal } from '../common/Modal'
import { SettingsDialog } from '../settings/SettingsDialog'
import { ChatLayout } from './ChatLayout'
import { ChatMarkdown } from './ChatMarkdown'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { Sidebar } from './Sidebar'
import { ToolPanel } from './ToolPanel'

export interface LandingRenderProps {
  skin: SkinName
  branding: BrandingMode
  draft: string
  accountName: string | null
  onDraftChange: (value: string) => void
  onSend: (value: string) => void
  onOpenTools: () => void
}

export interface ChatScreenProps {
  skin: SkinName
  onOpenLogin: () => void
  renderLanding: (props: LandingRenderProps) => ReactNode
}

export function ChatScreen({ skin, onOpenLogin, renderLanding }: ChatScreenProps) {
  const [railCollapsed, setRailCollapsed] = useState(false)

  const session = useChatStore((state) => state.session)
  const sessions = useChatStore((state) => state.sessions)
  const status = useChatStore((state) => state.status)
  const ui = useChatStore((state) => state.ui)
  const persistNotice = useChatStore((state) => state.persistNotice)
  const favoriteIds = useChatStore((state) => state.favoriteIds)
  const send = useChatStore((state) => state.send)
  const answer = useChatStore((state) => state.answer)
  const next = useChatStore((state) => state.next)
  const reveal = useChatStore((state) => state.reveal)
  const savePractice = useChatStore((state) => state.savePractice)
  const toggleFavorite = useChatStore((state) => state.toggleFavorite)
  const markAnalyzeMastered = useChatStore((state) => state.markAnalyzeMastered)
  const newChat = useChatStore((state) => state.newChat)
  const selectSession = useChatStore((state) => state.selectSession)
  const deleteSession = useChatStore((state) => state.deleteSession)
  const setDraft = useChatStore((state) => state.setDraft)
  const setScrollTop = useChatStore((state) => state.setScrollTop)
  const openSettings = useChatStore((state) => state.openSettings)
  const openTools = useChatStore((state) => state.openTools)
  const closeTools = useChatStore((state) => state.closeTools)
  const setSidebarOpen = useChatStore((state) => state.setSidebarOpen)
  const dismissPersistNotice = useChatStore((state) => state.dismissPersistNotice)

  const authStatus = useAuthStore((state) => state.status)
  const profile = useAuthStore((state) => state.profile)
  const membershipExpired = useAuthStore((state) => state.membershipExpired)
  const authError = useAuthStore((state) => state.lastError)
  const verifying = useAuthStore((state) => state.verifying)
  const verify = useAuthStore((state) => state.verify)

  const branding = useSettingsStore((state) => state.branding)
  const isLanding = !session || session.messages.length === 0
  const authenticated = authStatus === 'authenticated' || authStatus === 'authenticated-offline'
  const accountName = profile?.email ? profile.email.split('@')[0] : null
  // The rail mirrors an imported chat history only; practice sessions and
  // blank conversations stay out of it.
  const visibleSessions = sessions.filter((summary) => summary.origin === 'import')

  const activeShenlunQuestion =
    session?.mode === 'shenlun' && session.shenlun
      ? (session.shenlun.questions[session.shenlun.index] ?? null)
      : null
  const draftLength = shenlunAnswerLength(session?.draft ?? '')
  const composerPlaceholder = activeShenlunQuestion
    ? `写下你的申论作答，至少 ${SHENLUN_MIN_ANSWER_LENGTH} 字`
    : session?.mode === 'word'
      ? '输入一个成语或词语'
      : undefined

  const handleAction = (action: ChatAction) => {
    switch (action.kind) {
      case 'answer':
        answer(action.value ?? '')
        break
      case 'command':
        send(action.command ?? '')
        break
      case 'next':
        next()
        break
      case 'reveal':
        reveal()
        break
      case 'save':
        void savePractice()
        break
      case 'favorite':
        void toggleFavorite(Number(action.value))
        break
      case 'master':
        void markAnalyzeMastered()
        break
      case 'retry':
        if (authStatus === 'authenticated-offline') void verify()
        else onOpenLogin()
        break
      case 'open-settings':
        openSettings('appearance')
        break
      case 'open-tools':
        openTools()
        break
    }
  }

  const collapseRail = () => {
    setRailCollapsed(true)
    setSidebarOpen(false)
  }

  const topBar = (
    <>
      <div className="topbar-left">
        <button
          type="button"
          className="topbar-menu"
          onClick={() => {
            setRailCollapsed(false)
            setSidebarOpen(true)
          }}
          aria-label="打开侧栏"
        >
          <PanelLeft size={18} aria-hidden="true" />
        </button>
      </div>

      {!isLanding ? (
        <div className="topbar-right">
          <button
            type="button"
            className="topbar-action"
            onClick={() => void downloadHistoryBackup()}
            title="导出对话"
          >
            <Download size={16} aria-hidden="true" />
            <span>导出</span>
          </button>
          <button
            type="button"
            className="topbar-icon"
            onClick={() => openSettings('appearance')}
            aria-label="更多选项"
            title="更多选项"
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
          {skin === 'chatgpt' ? (
            <button
              type="button"
              className="topbar-icon"
              aria-label="分享对话"
              title="分享对话"
              onClick={() => {
                void navigator.clipboard?.writeText(window.location.href)
              }}
            >
              <Share2 size={17} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  )

  const sidebar = (
    <Sidebar
      skin={skin}
      sessions={visibleSessions}
      activeSessionId={session?.id ?? null}
      account={
        authenticated
          ? {
              name: accountName ?? '我的账号',
              plan: accountPlanText(skin, profile?.vipType),
              initial: (accountName ?? '我').trim().charAt(0).toUpperCase(),
              expired: membershipExpired,
            }
          : null
      }
      onNewChat={newChat}
      onSelectSession={(id) => void selectSession(id)}
      onDeleteSession={(id) => void deleteSession(id)}
      onOpenTools={openTools}
      onOpenSettings={() => openSettings('appearance')}
      onOpenAccount={() => openSettings('account')}
      onOpenLogin={onOpenLogin}
      onClose={collapseRail}
      sessionsInteractive={false}
    />
  )

  return (
    <ChatLayout
      skin={skin}
      sidebarOpen={ui.sidebarOpen}
      railCollapsed={railCollapsed}
      onCloseSidebar={() => setSidebarOpen(false)}
      sidebar={sidebar}
      topBar={topBar}
    >
      {persistNotice ? (
        <div className="chat-banner chat-banner--warning" role="status">
          <span>{persistNotice}</span>
          <button type="button" className="chat-banner-action" onClick={dismissPersistNotice}>
            知道了
          </button>
        </div>
      ) : null}

      {authError && authStatus !== 'authenticated' ? (
        <div className="chat-banner chat-banner--warning" role="status">
          <span>{authError}</span>
          {authStatus === 'authenticated-offline' ? (
            <button
              type="button"
              className="chat-banner-action"
              onClick={() => void verify()}
              disabled={verifying}
            >
              {verifying ? '正在校验…' : '重新校验'}
            </button>
          ) : (
            <button type="button" className="chat-banner-action" onClick={onOpenLogin}>
              去登录
            </button>
          )}
        </div>
      ) : null}

      {membershipExpired ? (
        <div className="chat-banner chat-banner--warning" role="status">
          <span>当前账号的会员状态不可用，部分内容可能无法读取。</span>
          <button
            type="button"
            className="chat-banner-action"
            onClick={() => openSettings('account')}
          >
            查看账号
          </button>
        </div>
      ) : null}

      {status === 'loading' || !session ? (
        <div className="chat-loading" role="status">
          正在准备对话…
        </div>
      ) : isLanding ? (
        renderLanding({
          skin,
          branding,
          draft: session.draft,
          accountName,
          onDraftChange: setDraft,
          onSend: send,
          onOpenTools: openTools,
        })
      ) : (
        <>
          <MessageList
            key={session.id}
            skin={skin}
            session={session}
            favoriteIds={favoriteIds}
            onOpenLogin={onOpenLogin}
            onAction={handleAction}
            onAnswer={answer}
            onScrollTopChange={setScrollTop}
            renderAssistantText={
              session.origin === 'import'
                ? (text) => <ChatMarkdown text={text} />
                : undefined
            }
          />
          <div className="chat-composer-dock">
            {activeShenlunQuestion ? (
              <p
                className={`shenlun-composer-counter ${
                  draftLength < SHENLUN_MIN_ANSWER_LENGTH ? 'is-short' : 'is-ready'
                }`}
              >
                已写 {draftLength} 字
                {draftLength < SHENLUN_MIN_ANSWER_LENGTH
                  ? ` · 还差 ${SHENLUN_MIN_ANSWER_LENGTH - draftLength} 字`
                  : ' · 发送后保存并送去批改'}
              </p>
            ) : null}
            <Composer
              skin={skin}
              branding={branding}
              value={session.draft}
              onChange={setDraft}
              onSend={send}
              onOpenTools={openTools}
              variant="docked"
              placeholder={composerPlaceholder}
            />
          </div>
          <p className="chat-disclaimer">{chatFooterText(skin)}</p>
        </>
      )}

      <Modal open={ui.toolsOpen} title="工具" onClose={closeTools} size="sm">
        <ToolPanel
          onOpenLogin={onOpenLogin}
          onAction={(action) => {
            closeTools()
            handleAction(action)
          }}
          variant="drawer"
        />
      </Modal>

      <SettingsDialog onOpenLogin={onOpenLogin} />
    </ChatLayout>
  )
}
