import type { ReactNode } from 'react'

import { formatAnswerText, formatCorrectAnswerText } from '../../chat/messageFactory'
import {
  toQuestionView,
  type ChatAction,
  type ChatMessage,
  type PracticeState,
  type ShenlunState,
} from '../../chat/chatTypes'
import { ShenlunQuestionCard } from '../../features/shenlun/ShenlunQuestionCard'
import { ShenlunReportCard } from '../../features/shenlun/ShenlunReportCard'
import { htmlToText } from '../../lib/sanitize'
import type { SkinName } from '../../skins/types'
import { HtmlContent } from '../common/HtmlContent'
import { ActionChips } from './ActionChips'
import { FeedbackMessage } from './FeedbackMessage'
import { MessageActions } from './MessageActions'
import { NoticeMessage } from './NoticeMessage'
import { QuestionMessage } from './QuestionMessage'
import { ToolPanel } from './ToolPanel'

export interface MessageBubbleProps {
  skin: SkinName
  message: ChatMessage
  practice: PracticeState | null
  shenlun: ShenlunState | null
  favoriteIds: readonly number[]
  onOpenLogin?: () => void
  onAction: (action: ChatAction) => void
  onAnswer: (labels: string[]) => void
  /** Overrides assistant text rendering (used by the quick-hide decoy). */
  renderAssistantText?: (text: string) => ReactNode
}

function AssistantRow({
  children,
  skin,
  actionsText,
}: {
  children: ReactNode
  skin: SkinName
  actionsText?: string
}) {
  return (
    <div className="message-row message-row--assistant">
      <div className="message-assistant-body">
        {children}
        {actionsText ? (
          <MessageActions skin={skin} role="assistant" text={actionsText} />
        ) : null}
      </div>
    </div>
  )
}

function UserRow({
  children,
  skin,
  actionsText,
}: {
  children: ReactNode
  skin: SkinName
  actionsText?: string
}) {
  return (
    <div className="message-row message-row--user">
      <div className="message-user-block">
        <div className="message-bubble message-bubble--user">{children}</div>
        {actionsText ? <MessageActions skin={skin} role="user" text={actionsText} /> : null}
      </div>
    </div>
  )
}

export function MessageBubble({
  skin,
  message,
  practice,
  shenlun,
  favoriteIds,
  onOpenLogin,
  onAction,
  onAnswer,
  renderAssistantText,
}: MessageBubbleProps) {
  if (message.kind === 'text' && message.role === 'user') {
    return (
      <UserRow skin={skin} actionsText={message.content}>
        {message.content}
      </UserRow>
    )
  }

  if (message.kind === 'text') {
    return (
      <AssistantRow skin={skin} actionsText={message.content}>
        <div className="message-text">
          {renderAssistantText ? renderAssistantText(message.content) : message.content}
        </div>
      </AssistantRow>
    )
  }

  if (message.kind === 'notice') {
    return (
      <AssistantRow skin={skin}>
        <NoticeMessage tone={message.tone} content={message.content} />
      </AssistantRow>
    )
  }

  if (message.kind === 'analysis') {
    return (
      <AssistantRow skin={skin} actionsText={htmlToText(message.content, 4000)}>
        <div className="message-text">{message.lead ?? '这道题的思路是这样的：'}</div>
        <HtmlContent className="analysis-content" html={message.content} />
      </AssistantRow>
    )
  }

  if (message.kind === 'shenlun-material') {
    return (
      <AssistantRow skin={skin}>
        <HtmlContent className="shenlun-material" html={message.content} />
      </AssistantRow>
    )
  }

  if (message.kind === 'shenlun-question') {
    if (!shenlun) {
      return (
        <AssistantRow skin={skin}>
          <NoticeMessage tone="warning" content="这份申论材料已不在当前对话中。" />
        </AssistantRow>
      )
    }

    return (
      <AssistantRow skin={skin}>
        <ShenlunQuestionCard message={message} shenlun={shenlun} />
      </AssistantRow>
    )
  }

  if (message.kind === 'shenlun-report') {
    return (
      <AssistantRow skin={skin}>
        <ShenlunReportCard questionId={message.questionId} />
      </AssistantRow>
    )
  }

  if (message.kind === 'question') {
    const question = practice?.questions.find((item) => item.id === message.questionId)

    if (!question) {
      return (
        <AssistantRow skin={skin}>
          <NoticeMessage tone="warning" content="这道题的数据已不在当前会话中。" />
        </AssistantRow>
      )
    }

    const answer = practice?.answers[String(question.id)]

    return (
      <AssistantRow skin={skin}>
        <QuestionMessage
          question={toQuestionView(question)}
          answer={answer}
          readOnly={practice?.review}
          onAnswer={onAnswer}
        />
      </AssistantRow>
    )
  }

  if (message.kind === 'feedback') {
    const question = practice?.questions.find((item) => item.id === message.questionId)

    if (!question) {
      return (
        <AssistantRow skin={skin}>
          <NoticeMessage tone="warning" content="这道题的反馈数据已不在当前会话中。" />
        </AssistantRow>
      )
    }

    const selectedLabels = message.selected.split(',').filter(Boolean)

    return (
      <AssistantRow skin={skin}>
        <FeedbackMessage
          correct={message.correct}
          selectedText={formatAnswerText(question, selectedLabels)}
          correctText={formatCorrectAnswerText(question)}
          explanation={htmlToText(question.analysis, 120)}
        />
      </AssistantRow>
    )
  }

  if (message.kind === 'actions') {
    return (
      <AssistantRow skin={skin}>
        <ActionChips
          actions={message.actions}
          prompt={message.prompt}
          onAction={onAction}
          favoriteIds={favoriteIds}
        />
      </AssistantRow>
    )
  }

  return (
    <AssistantRow skin={skin}>
      <ToolPanel
        onAction={onAction}
        onOpenLogin={onOpenLogin}
        variant="inline"
        tool={message.tool}
        query={message.query}
      />
    </AssistantRow>
  )
}
