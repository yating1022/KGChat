import { describe, expect, it } from 'vitest'

import { TEST_QUESTIONS } from '../../test/fixtures'
import type { PracticeQuestion } from '../chatTypes'
import { createPracticeMachine, practiceReducer, type PracticeMachine } from '../practiceReducer'

function start(questions: PracticeQuestion[] = TEST_QUESTIONS): PracticeMachine {
  return practiceReducer(createPracticeMachine(), {
    type: 'start',
    questions,
    at: 1_000,
    intro: '测试练习',
    introKind: 'notice',
    remote: false,
  })
}

describe('practiceReducer', () => {
  it('starts with an intro and the first question', () => {
    const machine = start()

    expect(machine.practice).not.toBeNull()
    expect(machine.practice?.status).toBe('active')
    expect(machine.practice?.index).toBe(0)
    expect(machine.messages).toHaveLength(2)
    expect(machine.messages[0]).toMatchObject({ kind: 'notice' })
    expect(machine.messages[1]).toMatchObject({
      kind: 'question',
      questionId: TEST_QUESTIONS[0].id,
      index: 0,
      total: TEST_QUESTIONS.length,
    })
  })

  it('does not serialize the correct answer into messages before submission', () => {
    const machine = start()

    expect(JSON.stringify(machine.messages)).not.toContain('correctAnswer')
    expect(JSON.stringify(machine.messages)).not.toContain(TEST_QUESTIONS[0].analysis)
  })

  it('records a correct answer and appends feedback plus actions', () => {
    const answered = practiceReducer(start(), { type: 'answer', labels: ['A'], at: 5_000 })
    const answer = answered.practice?.answers[String(TEST_QUESTIONS[0].id)]

    expect(answer).toMatchObject({ labels: ['A'], correct: true })
    expect(answered.messages.map((message) => message.kind)).toEqual(
      expect.arrayContaining(['text', 'feedback', 'actions']),
    )

    const feedback = answered.messages.find((message) => message.kind === 'feedback')
    expect(feedback).toMatchObject({ correct: true, selected: 'A' })
    expect(JSON.stringify(feedback)).not.toContain('correctAnswer')

    const actions = answered.messages.find((message) => message.kind === 'actions')
    expect(
      actions?.kind === 'actions' ? actions.actions.map((action) => action.label) : [],
    ).toEqual(['下一题', '查看解析', '换一组', '收藏这道题'])
  })

  it('compares multiple answers as an order-independent set', () => {
    const machine = start()
    const second = practiceReducer(machine, { type: 'next', at: 2_000 })
    const answered = practiceReducer(second, {
      type: 'answer',
      labels: ['D', 'A'],
      at: 3_000,
    })
    const answer = answered.practice?.answers[String(TEST_QUESTIONS[1].id)]

    expect(answer).toMatchObject({ labels: ['A', 'D'], correct: true })
  })

  it('records a wrong answer', () => {
    const answered = practiceReducer(start(), { type: 'answer', labels: ['B'], at: 2_000 })
    const feedback = answered.messages.find((message) => message.kind === 'feedback')

    expect(feedback).toMatchObject({ correct: false, selected: 'B' })
    expect(answered.practice?.answers[String(TEST_QUESTIONS[0].id)]?.correct).toBe(false)
  })

  it('ignores a second answer for the same question', () => {
    const first = practiceReducer(start(), { type: 'answer', labels: ['A'], at: 2_000 })
    const second = practiceReducer(first, { type: 'answer', labels: ['B'], at: 3_000 })

    expect(second).toBe(first)
  })

  it('advances to the next question and completes with a summary', () => {
    let machine = start(TEST_QUESTIONS.slice(0, 2))
    machine = practiceReducer(machine, { type: 'answer', labels: ['A'], at: 2_000 })
    machine = practiceReducer(machine, { type: 'next', at: 3_000 })

    expect(machine.practice?.index).toBe(1)
    expect(machine.messages.at(-1)).toMatchObject({
      kind: 'question',
      questionId: TEST_QUESTIONS[1].id,
    })

    machine = practiceReducer(machine, { type: 'answer', labels: ['A', 'D'], at: 4_000 })
    machine = practiceReducer(machine, { type: 'next', at: 65_000 })

    expect(machine.practice?.status).toBe('completed')
    expect(machine.practice?.completedAt).toBe(65_000)
    expect(machine.messages.at(-1)).toMatchObject({ kind: 'actions' })

    const summary = machine.messages.find(
      (message) => message.kind === 'text' && message.content.includes('这组练习完成了'),
    )
    expect(summary).toBeTruthy()
    expect(summary?.kind === 'text' ? summary.content : '').toContain('答对 2 题')
  })

  it('reveals analysis only after an answer and only once', () => {
    const machine = start()
    const before = practiceReducer(machine, { type: 'reveal', at: 2_000 })
    expect(before).toBe(machine)

    const answered = practiceReducer(machine, { type: 'answer', labels: ['A'], at: 2_000 })
    const revealed = practiceReducer(answered, { type: 'reveal', at: 3_000 })
    const revealedAgain = practiceReducer(revealed, { type: 'reveal', at: 4_000 })

    expect(revealed.messages).toHaveLength(answered.messages.length + 2)
    expect(revealed.messages.at(-1)).toMatchObject({
      kind: 'analysis',
      questionId: TEST_QUESTIONS[0].id,
    })
    expect(revealed.practice?.revealed[String(TEST_QUESTIONS[0].id)]).toBe(true)
    expect(revealedAgain).toBe(revealed)
  })

  it('uses assistant text for a real practice intro by default', () => {
    const machine = practiceReducer(createPracticeMachine(), {
      type: 'start',
      questions: TEST_QUESTIONS,
      at: 1_000,
      intro: '我整理了一组题。',
      remote: true,
    })

    expect(machine.messages[0]).toMatchObject({ kind: 'text', content: '我整理了一组题。' })
    expect(machine.practice?.remote).toBe(true)
  })

  it('marks skipped questions without an answer', () => {
    const machine = practiceReducer(start(), { type: 'skip', at: 2_000 })

    expect(machine.practice?.skipped[String(TEST_QUESTIONS[0].id)]).toBe(true)
    expect(machine.practice?.answers[String(TEST_QUESTIONS[0].id)]).toBeUndefined()
    expect(machine.messages.at(-1)).toMatchObject({ kind: 'actions' })
  })

  it('tracks local save state', () => {
    const machine = start()
    const saved = practiceReducer(machine, { type: 'save-status', status: 'saved-local' })

    expect(saved.practice?.saveState).toBe('saved-local')
  })

  it('counts unanswered questions in the summary', () => {
    let machine = start(TEST_QUESTIONS.slice(0, 2))
    machine = practiceReducer(machine, { type: 'next', at: 2_000 })
    machine = practiceReducer(machine, { type: 'next', at: 3_000 })

    const summary = machine.messages.find(
      (message) => message.kind === 'text' && message.content.includes('这组练习完成了'),
    )
    expect(summary?.kind === 'text' ? summary.content : '').toContain('未作答 2 题')
  })
})
