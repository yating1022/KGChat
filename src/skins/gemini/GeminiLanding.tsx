import type { LandingRenderProps } from '../../components/chat/ChatScreen'
import { Composer } from '../../components/chat/Composer'
import { chatFooterText } from '../copy'

export function GeminiLanding({
  skin,
  branding,
  draft,
  accountName,
  onDraftChange,
  onSend,
  onOpenTools,
}: LandingRenderProps) {
  return (
    <div className="chat-landing chat-landing--gemini">
      <div className="landing-center">
        <h1 className="landing-greeting">
          <span className="landing-greeting-gradient">
            你好，{accountName ?? '朋友'}
          </span>
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
