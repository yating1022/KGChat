import { useEffect, useState } from 'react'

import { useChatStore } from '../../chat/chatStore'
import type { ShenlunQuestionState } from '../../chat/chatTypes'
import { SHENLUN_MIN_ANSWER_LENGTH, shenlunAnswerLength } from './shenlunService'

export interface ShenlunEditorProps {
  question: ShenlunQuestionState
}

/**
 * Inline long-answer editor. The chat composer also accepts a Shenlun answer;
 * this editor keeps the per-question draft visible and editable.
 */
export function ShenlunEditor({ question }: ShenlunEditorProps) {
  const saveShenlunAnswer = useChatStore((state) => state.saveShenlunAnswer)
  const submitShenlunAnswer = useChatStore((state) => state.submitShenlunAnswer)
  const [value, setValue] = useState(question.answer)

  useEffect(() => {
    setValue(question.answer)
  }, [question.id, question.answer])

  const length = shenlunAnswerLength(value)
  const remaining = Math.max(0, SHENLUN_MIN_ANSWER_LENGTH - length)
  const pending = question.status === 'saving' || question.status === 'submitting'

  return (
    <div className="shenlun-editor">
      <label className="shenlun-editor-label" htmlFor={`shenlun-editor-${question.id}`}>
        你的作答
      </label>
      <textarea
        id={`shenlun-editor-${question.id}`}
        className="shenlun-editor-input"
        rows={7}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={`在这里写下完整作答，至少 ${SHENLUN_MIN_ANSWER_LENGTH} 字。`}
        aria-label="申论作答"
      />

      <div className="shenlun-editor-foot">
        <span className={`shenlun-counter ${remaining > 0 ? 'is-short' : 'is-ready'}`}>
          {length} / {SHENLUN_MIN_ANSWER_LENGTH} 字
          {remaining > 0 ? ` · 还差 ${remaining} 字` : ' · 可以提交批改'}
        </span>
        <div className="shenlun-editor-actions">
          <button
            type="button"
            className="picker-chip"
            disabled={pending}
            onClick={() => void saveShenlunAnswer(value)}
          >
            {question.status === 'saving' ? '正在保存…' : '只保存'}
          </button>
          <button
            type="button"
            className="picker-primary"
            disabled={pending}
            onClick={() => void submitShenlunAnswer(value)}
          >
            {question.status === 'submitting' ? '正在提交…' : '保存并批改'}
          </button>
        </div>
      </div>

      {remaining > 0 ? (
        <p className="shenlun-editor-hint">
          再写 {remaining} 个字就够了，也可以直接在下方输入框继续写。
        </p>
      ) : null}
    </div>
  )
}
