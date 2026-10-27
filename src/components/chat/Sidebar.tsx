import {
  Bell,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  FolderOpen,
  GraduationCap,
  Library,
  MoreHorizontal,
  PanelLeft,
  Plug,
  Plus,
  Search,
  Settings,
  SquarePen,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react'
import { useState } from 'react'

import { formatRelativeTime } from '../../lib/time'
import type { SessionSummary } from '../../chat/chatTypes'
import { Brand } from '../../skins/Brand'
import type { SkinName } from '../../skins/types'

export interface RailAccount {
  name: string
  plan: string
  initial: string
  expired?: boolean
}

export interface SidebarProps {
  skin: SkinName
  sessions: SessionSummary[]
  activeSessionId: string | null
  account: RailAccount | null
  onNewChat: () => void
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onOpenTools: () => void
  onOpenSettings: () => void
  onOpenAccount: () => void
  onOpenLogin: () => void
  onClose: () => void
  /** The live app keeps the rail as a cover list; the decoy allows switching. */
  sessionsInteractive?: boolean
}

/** Sidebar shared by both skins; layout and labels follow each product. */
export function Sidebar({
  skin,
  sessions,
  activeSessionId,
  account,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onOpenTools,
  onOpenSettings,
  onOpenAccount,
  onOpenLogin,
  onClose,
  sessionsInteractive = true,
}: SidebarProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  const trimmed = query.trim().toLowerCase()
  const visible = trimmed
    ? sessions.filter((summary) => summary.title.toLowerCase().includes(trimmed))
    : sessions

  return (
    <div className="rail-inner">
      <header className="rail-head">
        <div className="rail-brand">
          <Brand skin={skin} size={skin === 'gemini' ? 26 : 24} showWordmark />
          {skin === 'chatgpt' ? (
            <ChevronDown className="rail-brand-caret" size={14} aria-hidden="true" />
          ) : null}
        </div>

        <div className="rail-head-actions">
          <button
            type="button"
            className="rail-icon"
            aria-label="搜索对话"
            title="搜索对话"
            onClick={() => {
              setSearchOpen((current) => !current)
              setQuery('')
            }}
          >
            <Search size={18} aria-hidden="true" />
          </button>
          <button type="button" className="rail-icon rail-icon--panel" onClick={onClose} aria-label="收起侧栏">
            <PanelLeft size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      {searchOpen ? (
        <div className="rail-search">
          <Search size={15} aria-hidden="true" />
          <input
            className="rail-search-input"
            type="text"
            value={query}
            placeholder="搜索对话"
            aria-label="搜索对话"
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="rail-search-close"
            aria-label="关闭搜索"
            onClick={() => {
              setSearchOpen(false)
              setQuery('')
            }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="rail-scroll">
        {skin === 'gemini' ? (
          <>
            <nav className="rail-primary" aria-label="主要操作">
              <button type="button" className="rail-button rail-button--strong" onClick={onNewChat}>
                <SquarePen size={18} aria-hidden="true" />
                <span>发起新对话</span>
              </button>
              <button type="button" className="rail-button" onClick={onOpenTools}>
                <Library size={18} aria-hidden="true" />
                <span>库</span>
              </button>
              <button type="button" className="rail-button">
                <Clock size={18} aria-hidden="true" />
                <span>已安排</span>
              </button>
              <button type="button" className="rail-button">
                <GraduationCap size={18} aria-hidden="true" />
                <span>学生</span>
              </button>
              <button type="button" className="rail-button" onClick={onOpenTools}>
                <MoreHorizontal size={18} aria-hidden="true" />
                <span>更多</span>
              </button>
            </nav>

            <div className="rail-shortcuts">
              <button type="button" className="rail-shortcut">
                <span>Gems</span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
              <button type="button" className="rail-shortcut">
                <span>笔记本</span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
              <div className="rail-shortcut rail-shortcut--folder">
                <span>文件夹</span>
                <ChevronRight size={15} aria-hidden="true" />
                <span className="rail-folder-actions" aria-hidden="true">
                  <UserPlus size={15} />
                  <FolderOpen size={15} />
                  <Upload size={15} />
                  <Settings size={15} />
                  <Bell size={15} />
                  <Plus size={15} />
                </span>
              </div>
            </div>

            <div className="rail-list-head">
              <span>全部</span>
              <Filter size={14} aria-hidden="true" />
            </div>
          </>
        ) : (
          <>
            <nav className="rail-primary" aria-label="主要操作">
              <button type="button" className="rail-button rail-button--strong" onClick={onNewChat}>
                <SquarePen size={18} aria-hidden="true" />
                <span>新聊天</span>
              </button>
              <button type="button" className="rail-button">
                <Clock size={18} aria-hidden="true" />
                <span>定时任务</span>
              </button>
              <button type="button" className="rail-button">
                <Library size={18} aria-hidden="true" />
                <span>资料库</span>
              </button>
              <button type="button" className="rail-button" onClick={onOpenTools}>
                <Plug size={18} aria-hidden="true" />
                <span>插件</span>
              </button>
              <button type="button" className="rail-button">
                <MoreHorizontal size={18} aria-hidden="true" />
                <span>探索</span>
              </button>
            </nav>

            <div className="rail-block">
              <p className="rail-block-head">项目</p>
              <p className="rail-empty-line">没有项目</p>
            </div>

            <div className="rail-block">
              <div className="rail-block-head">
                <span>文件夹</span>
                <Plus size={14} aria-hidden="true" />
              </div>
              <div className="rail-filter">搜索文件夹和对话 · F : 仅文件夹</div>
              <p className="rail-empty-line">暂无文件夹</p>
            </div>

            <div className="rail-list-head rail-list-head--recent">
              <span>最近</span>
            </div>
          </>
        )}

        {visible.length > 0 ? (
          <ul className="session-list">
            {visible.map((summary) => (
              <li key={summary.id} className="session-row">
                {sessionsInteractive ? (
                  <button
                    type="button"
                    className={`session-button ${summary.id === activeSessionId ? 'is-active' : ''}`}
                    onClick={() => onSelectSession(summary.id)}
                    aria-current={summary.id === activeSessionId ? 'page' : undefined}
                    aria-label={`打开对话 ${summary.title}`}
                    title={summary.title}
                  >
                    <span className="session-title">{summary.title}</span>
                    <span className="session-time">{formatRelativeTime(summary.updatedAt)}</span>
                  </button>
                ) : (
                  <span
                    className={`session-button is-static ${
                      summary.id === activeSessionId ? 'is-active' : ''
                    }`}
                    title={summary.title}
                  >
                    <span className="session-title">{summary.title}</span>
                    <span className="session-time">{formatRelativeTime(summary.updatedAt)}</span>
                  </span>
                )}
                <button
                  type="button"
                  className="session-delete"
                  onClick={() => onDeleteSession(summary.id)}
                  aria-label={`删除对话 ${summary.title}`}
                  title="删除对话"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <footer className="rail-footer">
        <div className="rail-account">
          {account ? (
            <button
              type="button"
              className="rail-account-main"
              onClick={onOpenAccount}
              aria-label="打开账号设置"
            >
              <span className="account-avatar account-avatar--small" aria-hidden="true">
                {account.initial}
              </span>
              <span className="rail-account-text">
                <span className="rail-account-name">{account.name}</span>
                <span className={`rail-account-status ${account.expired ? 'is-expired' : ''}`}>
                  {account.expired ? '会员已过期' : account.plan}
                </span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="rail-account-main rail-account--signedout"
              onClick={onOpenLogin}
              aria-label="登录"
            >
              <span className="account-avatar account-avatar--small" aria-hidden="true">
                ?
              </span>
              <span className="rail-account-text">
                <span className="rail-account-name">登录</span>
                <span className="rail-account-status">
                  {skin === 'gemini' ? '免费版' : 'Free'}
                </span>
              </span>
            </button>
          )}
          <button
            type="button"
            className="rail-icon-action"
            onClick={onOpenSettings}
            aria-label="打开设置"
            title="设置"
          >
            <Settings size={18} aria-hidden="true" />
          </button>
        </div>
      </footer>
    </div>
  )
}
