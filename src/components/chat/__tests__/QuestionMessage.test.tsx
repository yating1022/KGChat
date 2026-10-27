import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChatSession, PracticeQuestion, QuestionView } from '../../../chat/chatTypes'
import { createQuestionMessage } from '../../../chat/messageFactory'
import { FeedbackMessage } from '../FeedbackMessage'
import { MessageList } from '../MessageList'
import { QuestionMessage } from '../QuestionMessage'

afterEach(() => {
  cleanup()
})

const SECRET_ANALYSIS = 'SECRET-ANALYSIS-不要提前出现'

const question: PracticeQuestion = {
  id: 42,
  title: '<p>下面哪一项是正确的？</p>',
  type: 'single',
  options: ['<font color="#fc5531">甲选项</font>', '乙选项', '丙选项', '丁选项'],
  correctAnswer: ['B'],
  analysis: `<p>${SECRET_ANALYSIS}</p>`,
  material: '<p>材料一</p>',
  source: '某年真题',
  tag: '常识判断',
}

const view: QuestionView = {
  id: question.id,
  title: question.title,
  type: question.type,
  options: question.options,
  material: question.material,
  tag: question.tag,
}

describe('QuestionMessage', () => {
  it('renders sanitized HTML and keeps the answer and analysis out of the DOM', () => {
    const { container } = render(<QuestionMessage question={view} onAnswer={vi.fn()} />)

    expect(screen.getByText('下面哪一项是正确的？')).toBeTruthy()
    expect(screen.getByText('材料一')).toBeTruthy()
    expect(container.querySelector('font')?.getAttribute('color')).toBe('#fc5531')
    expect(container.innerHTML).not.toContain(SECRET_ANALYSIS)
    expect(container.innerHTML).not.toContain('correctAnswer')
    expect(container.innerHTML).not.toContain('data-correct')
  })

  it('strips scripts from question HTML', () => {
    const { container } = render(
      <QuestionMessage
        question={{ ...view, title: '<p>题干</p><script>alert(1)</script>' }}
        onAnswer={vi.fn()}
      />,
    )

    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('题干')
  })
})

describe('answer secrecy in the message list', () => {
  it('does not mount the analysis or correct-answer fields before submission', () => {
    const session: ChatSession = {
      id: 'session-1',
      title: '一组练习',
      createdAt: 1,
      updatedAt: 1,
      draft: '',
      scrollTop: 0,
      mode: 'practice',
      messages: [createQuestionMessage(question, 0, 1)],
      practice: {
        questions: [question],
        index: 0,
        status: 'active',
        answers: {},
        skipped: {},
        revealed: {},
        startedAt: 1,
        saveState: 'idle',
        remote: true,
      },
    }

    const { container } = render(
      <MessageList
        skin="gemini"
        session={session}
        favoriteIds={[]}
        onAction={vi.fn()}
        onAnswer={vi.fn()}
        onScrollTopChange={vi.fn()}
      />,
    )

    expect(container.innerHTML).not.toContain(SECRET_ANALYSIS)
    expect(container.innerHTML).not.toContain('correctAnswer')
    expect(container.innerHTML).not.toContain('"B"')
  })
})

describe('FeedbackMessage', () => {
  it('keeps plain option text readable', () => {
    render(<FeedbackMessage correct={false} selectedText="B. 迫不急待" correctText="A. 一如既往" />)

    expect(screen.getByText(/你选的是：B\. 迫不急待/)).toBeTruthy()
    expect(screen.getByText(/正确答案是：A\. 一如既往/)).toBeTruthy()
  })

  it('sanitizes HTML option text instead of showing raw tags', () => {
    const { container } = render(
      <FeedbackMessage
        correct={false}
        selectedText='B. <font color="#fc5531">红色选项</font>'
        correctText="A. 普通选项"
      />,
    )

    expect(container.textContent).not.toContain('<font')
    expect(container.textContent).toContain('红色选项')
    expect(container.querySelector('font')?.getAttribute('color')).toBe('#fc5531')
  })
})
