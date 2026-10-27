import type { LandingRenderProps } from '../../components/chat/ChatScreen'
import { Composer } from '../../components/chat/Composer'
import { chatFooterText } from '../copy'

export function ChatGptLanding({
  skin,
  branding,
  draft,
  onDraftChange,
  onSend,
  onOpenTools,
}: LandingRenderProps) {
  return (
    <div className="chat-landing chat-landing--chatgpt">
      <div className="landing-center">
        <h1 className="landing-greeting">
          {branding === 'official' ? '有什么可以帮忙的？' : '今天想聊点什么？'}
        </h1>

        <div className="landing-composer">
          <Composer
            skin={skin}
            branding={branding}
            value={draft}
            onChange={onDraftChange}
            onSend={onSend}
            onOpenTools={onOpenTools}
            variant="landing"
          />
        </div>
      </div>

      <footer className="landing-footer">{chatFooterText(skin)}</footer>
    </div>
  )
}
