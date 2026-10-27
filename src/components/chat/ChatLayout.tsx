import type { ReactNode } from 'react'

import type { SkinName } from '../../skins/types'

export interface ChatLayoutProps {
  skin: SkinName
  sidebarOpen: boolean
  railCollapsed?: boolean
  onCloseSidebar: () => void
  sidebar: ReactNode
  topBar?: ReactNode
  children: ReactNode
}

export function ChatLayout({
  skin,
  sidebarOpen,
  railCollapsed = false,
  onCloseSidebar,
  sidebar,
  topBar,
  children,
}: ChatLayoutProps) {
  return (
    <div
      className={`chat-shell chat-shell--${skin}${railCollapsed ? ' chat-shell--rail-collapsed' : ''}`}
    >
      <div
        className={`chat-scrim ${sidebarOpen ? 'is-visible' : ''}`}
        onClick={onCloseSidebar}
        aria-hidden="true"
      />
      <aside className={`chat-rail ${sidebarOpen ? 'is-open' : ''}`} aria-label="对话与工具">
        {sidebar}
      </aside>
      <div className="chat-main">
        {topBar ? <header className="chat-topbar">{topBar}</header> : null}
        {children}
      </div>
    </div>
  )
}
