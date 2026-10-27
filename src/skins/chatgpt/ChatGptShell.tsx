import { ChatScreen } from '../../components/chat/ChatScreen'
import { ChatGptLanding } from './ChatGptLanding'

export interface ChatGptShellProps {
  onOpenLogin: () => void
}

export function ChatGptShell({ onOpenLogin }: ChatGptShellProps) {
  return (
    <ChatScreen
      skin="chatgpt"
      onOpenLogin={onOpenLogin}
      renderLanding={(props) => <ChatGptLanding {...props} />}
    />
  )
}
