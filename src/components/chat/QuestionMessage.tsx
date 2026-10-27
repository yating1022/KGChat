import { useEffect, useState } from 'react'

import type { PracticeAnswer, QuestionView } from '../../chat/chatTypes'
import { HtmlContent } from '../common/HtmlContent'

export interface QuestionMessageProps {
  question: QuestionView
  answer?: PracticeAnswer
  readOnly?: boolean
  onAnswer: (labels: string[]) => void
}

function optionBody(label: string, text: string): string {
  const prefix = new RegExp(`^${label}[.、．:：\\s]+`, 'i')
  return text.replace(prefix, '')
}

export function QuestionMessage({
  question,
  answer,
  readOnly = false,
  onAnswer,
}: QuestionMessageProps) {
  const [selected, setSelected] = useState<string[]>([])
  const isMultiple = question.type === 'multiple'
  const answered = Boolean(answer)
  const locked = answered || readOnly

  useEffect(() => {
    setSelected([])
  }, [question.id])

  const activeSelection = answer?.labels ?? selected

  const toggle = (label: string) => {
    if (locked) return
    if (!isMultiple) {
      onAnswer([label])
      return
    }

    setSelected((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label].sort(),
    )
  }

  return (
    <div className="question-inline">
      {question.material ? (
        <HtmlContent className="question-material" html={question.material} />
      ) : null}
      <HtmlContent className="question-title" html={question.title} />

      <div className="option-list" role="group" aria-label="选项">
        {question.options.map((text, optionIndex) => {
          const label = String.fromCharCode(65 + optionIndex)
          const isSelected = activeSelection.includes(label)

          return (
            <button
              key={label}
              type="button"
              className="option-chip"
              aria-pressed={isSelected}
              onClick={() => toggle(label)}
              disabled={locked}
            >
              <span className="option-label">{label}</span>
              <HtmlContent as="span" className="option-text" html={optionBody(label, text)} />
            </button>
          )
        })}
      </div>

      {isMultiple && !locked ? (
        <div className="question-submit-row">
          <span className="question-hint">可多选，选好后提交。</span>
          <button
            type="button"
            className="question-submit"
            onClick={() => onAnswer(selected)}
            disabled={selected.length === 0}
          >
            提交答案
          </button>
        </div>
      ) : null}
    </div>
  )
}
