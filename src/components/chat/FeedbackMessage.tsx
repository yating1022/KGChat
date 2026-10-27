import { containsHtml } from '../../lib/sanitize'
import { HtmlContent } from '../common/HtmlContent'

export interface FeedbackMessageProps {
  correct: boolean
  selectedText: string
  correctText: string
  /** One short post-answer explanation; the full analysis stays behind a reveal action. */
  explanation?: string
}

function OptionText({ value }: { value: string }) {
  if (!containsHtml(value)) return <>{value}</>
  return <HtmlContent as="span" className="feedback-inline" html={value} />
}

/**
 * Rendered as ordinary assistant prose so the answer check reads like a
 * normal chat reply instead of a coloured result card.
 */
export function FeedbackMessage({
  correct,
  selectedText,
  correctText,
  explanation,
}: FeedbackMessageProps) {
  return (
    <div className="feedback-plain" aria-live="polite">
      <p className="feedback-plain-title">{correct ? '答对了。' : '这题没选对。'}</p>
      <p>
        你选的是：<OptionText value={selectedText} />
      </p>
      {!correct ? (
        <p>
          正确答案是：<OptionText value={correctText} />
        </p>
      ) : null}
      {explanation ? <p className="feedback-plain-note">{explanation}</p> : null}
    </div>
  )
}
