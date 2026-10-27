import { RefreshCw } from 'lucide-react'

import { useChatStore } from '../../chat/chatStore'
import type { ShenlunQuestionChatMessage, ShenlunState } from '../../chat/chatTypes'
import { HtmlContent } from '../../components/common/HtmlContent'
import { ShenlunEditor } from './ShenlunEditor'

export interface ShenlunQuestionCardProps {
  message: ShenlunQuestionChatMessage
  shenlun: ShenlunState
}

const STATUS_HINTS: Record<string, string> = {
  saved: '这次作答已保存。',
  'sync-pending': '记录同步中，稍后刷新一下就能继续批改。',
  submitting: '正在送去批改…',
  polling: '已经送去批改，正在等结果。',
  error: '这次没有提交成功，可以再试一次。',
}

export function ShenlunQuestionCard({ message, shenlun }: ShenlunQuestionCardProps) {
  const question = shenlun.questions.find((item) => item.id === message.questionId)
  const setShenlunIndex = useChatStore((state) => state.setShenlunIndex)
  const syncShenlunRecord = useChatStore((state) => state.syncShenlunRecord)

  if (!question) {
    return <p className="shenlun-report-note">这道申论题已不在当前对话中。</p>
  }

  const isCurrent = shenlun.index === message.index
  const hint = STATUS_HINTS[question.status]

  return (
    <article className="shenlun-question">
      <p className="shenlun-question-meta">
        第 {message.index + 1} / {message.total} 题
        {isCurrent ? '' : ' · 已翻过'}
      </p>

      <HtmlContent className="shenlun-question-content" html={question.content} />

      {question.requirement ? (
        <HtmlContent className="shenlun-requirement" html={question.requirement} />
      ) : null}

      {question.answer ? (
        <details className="shenlun-answer-preview">
          <summary>查看已保存的作答</summary>
          <p>{question.answer}</p>
        </details>
      ) : null}

      {hint && question.status !== 'polling' ? (
        <p className="shenlun-status">{hint}</p>
      ) : null}

      {question.status === 'sync-pending' ? (
        <button
          type="button"
          className="picker-chip shenlun-report-refresh"
          onClick={() => void syncShenlunRecord(message.questionId)}
        >
          <RefreshCw size={13} aria-hidden="true" />
          <span>刷新记录</span>
        </button>
      ) : null}

      {question.status === 'error' && question.error ? (
        <p className="shenlun-status shenlun-status--error">{question.error}</p>
      ) : null}

      {isCurrent ? (
        <ShenlunEditor question={question} />
      ) : (
        <button
          type="button"
          className="picker-chip"
          onClick={() => setShenlunIndex(message.index)}
        >
          回到这一题
        </button>
      )}
    </article>
  )
}
