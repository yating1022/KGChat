import { ChatScreen } from '../../components/chat/ChatScreen'
import { GeminiLanding } from './GeminiLanding'

export interface GeminiShellProps {
  onOpenLogin: () => void
}

export function GeminiShell({ onOpenLogin }: GeminiShellProps) {
  return (
    <ChatScreen
      skin="gemini"
      onOpenLogin={onOpenLogin}
      renderLanding={(props) => <GeminiLanding {...props} />}
    />
  )
}
