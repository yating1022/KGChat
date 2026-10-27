import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useChatStore } from '../chat/chatStore'
import { useChatPersistence } from '../chat/useChatPersistence'
import { useAuthBootstrap } from '../auth/useAuthBootstrap'
import { LoginDialog } from '../components/auth/LoginDialog'
import { QuickHideOverlay } from '../components/overlays/QuickHideOverlay'
import { useDoubleEscape } from '../hooks/useDoubleEscape'
import { useSettingsStore } from '../settings/settingsStore'
import { SkinProvider } from '../skins/SkinProvider'
import { ChatGptShell } from '../skins/chatgpt/ChatGptShell'
import { GeminiShell } from '../skins/gemini/GeminiShell'

export function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const skin = useSettingsStore((state) => state.skin)
  const branding = useSettingsStore((state) => state.branding)
  const quickHideEnabled = useSettingsStore((state) => state.quickHideEnabled)
  const initialize = useChatStore((state) => state.initialize)

  const [hidden, setHidden] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useAuthBootstrap()
  useChatPersistence()

  useEffect(() => {
    void initialize()
  }, [initialize])

  const toggleHide = useCallback(() => {
    setHidden((current) => {
      if (!current && document.activeElement instanceof HTMLElement) {
        previousFocusRef.current = document.activeElement
      }
      return !current
    })
  }, [])

  useDoubleEscape({
    enabled: quickHideEnabled || hidden,
    onToggle: toggleHide,
  })

  useEffect(() => {
    if (hidden) {
      overlayRef.current?.focus()
      return
    }

    const previous = previousFocusRef.current
    previousFocusRef.current = null
    if (previous?.isConnected) previous.focus()
  }, [hidden])

  const openLogin = useCallback(() => {
    navigate('/login')
  }, [navigate])

  const closeLogin = useCallback(() => {
    navigate('/', { replace: location.pathname === '/login' })
  }, [navigate, location.pathname])

  return (
    <SkinProvider>
      <div
        className="app-shell"
        inert={hidden ? true : undefined}
        aria-hidden={hidden ? true : undefined}
      >
        {skin === 'gemini' ? (
          <GeminiShell onOpenLogin={openLogin} />
        ) : (
          <ChatGptShell onOpenLogin={openLogin} />
        )}
        <LoginDialog open={location.pathname === '/login'} onClose={closeLogin} skin={skin} />
      </div>

      {hidden ? (
        <QuickHideOverlay ref={overlayRef} skin={skin} branding={branding} />
      ) : null}
    </SkinProvider>
  )
}
