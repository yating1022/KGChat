import { describe, expect, it } from 'vitest'

import type { Question } from '../../../api/types'
import type { PracticeAnswer, PracticeQuestion } from '../../../chat/chatTypes'
import { buildRecordPayload, nativeUserAnswer } from '../recordPayload'

function apiQuestion(patch: Partial<Question> & Pick<Question, 'id'>): Question {
  const base: Omit<Question, 'id'> = {
    title: `<p>题目 ${patch.id}</p>`,
    type: 'single',
    globalAccuracy: 50,
    correctAnswer: '0',
    options: '甲#乙#丙#丁',
    analysis: '<p>解析</p>',
    source: '内部来源',
    tag: '',
    material: '',
    userAnswer: null,
    memorize: false,
  }

  return { ...base, ...patch }
}

function practiceQuestion(
  question: Question,
  options?: Partial<PracticeQuestion>,
): PracticeQuestion {
  return {
    id: question.id,
    title: question.title,
    type: 'single',
    options: question.options.split('#'),
    correctAnswer: ['A'],
    analysis: question.analysis,
    tag: question.tag,
    raw: question,
    ...options,
  }
}

function answer(labels: string[], correct: boolean): PracticeAnswer {
  return { labels, correct, answeredAt: 2_000 + labels.length * 1_000 }
}

describe('nativeUserAnswer', () => {
  it('writes single and judge answers as a 0-based number', () => {
    expect(nativeUserAnswer(['C'], 'single')).toBe(2)
    expect(nativeUserAnswer(['B'], 'judge')).toBe(1)
  })

  it('writes multiple answers as an array of 0-based indexes', () => {
    expect(nativeUserAnswer(['D', 'B'], 'multiple')).toEqual([1, 3])
  })
})

describe('buildRecordPayload', () => {
  it('builds tag maps, flat id arrays, and native userAnswer values', () => {
    const first = apiQuestion({ id: 23491, tag: '理论政策', correctAnswer: '2' })
    const second = apiQuestion({ id: 23492, tag: '理论政策', correctAnswer: '1' })
    const third = apiQuestion({
      id: 23493,
      tag: '',
      type: 'multiple',
      correctAnswer: '1,3',
      options: '甲#乙#丙#丁',
    })
    const fourth = apiQuestion({ id: 23494, tag: '常识判断' })

    const questions = [
      practiceQuestion(first, { correctAnswer: ['C'] }),
      practiceQuestion(second, { correctAnswer: ['B'] }),
      practiceQuestion(third, {
        type: 'multiple',
        correctAnswer: ['B', 'D'],
      }),
      practiceQuestion(fourth),
    ]

    const answers: Record<string, PracticeAnswer> = {
      '23491': answer(['C'], true),
      '23492': answer(['A'], false),
      '23493': answer(['B', 'D'], true),
    }

    const built = buildRecordPayload({
      title: '一组行测练习',
      questions,
      answers,
      timeTaken: 685,
      model: [{ name: '政治理论' }],
      startedAt: 1_000,
    })

    expect(built.canSave).toBe(true)
    expect(built.stats).toMatchObject({
      total: 4,
      answered: 3,
      correct: 2,
      wrong: 1,
      unanswered: 1,
    })

    expect(built.payload.tname).toBe('一组行测练习')
    expect(built.payload.total).toBe(4)
    expect(built.payload.timeTaken).toBe(685)

    expect(JSON.parse(built.payload.correctIds)).toEqual({
      理论政策: [23491],
    })
    expect(JSON.parse(built.payload.errorIds)).toEqual({
      理论政策: [23492],
    })
    expect(built.payload.tkWrongAnswerIds).toEqual({
      correctIds: [23491, 23493],
      errorIds: [23492],
    })

    const json = JSON.parse(built.payload.json) as {
      model: unknown
      questions: Array<Record<string, unknown>>
    }

    expect(json.model).toEqual([{ name: '政治理论' }])
    expect(json.questions).toHaveLength(4)

    const savedFirst = json.questions.find((item) => item.id === 23491)
    expect(savedFirst?.userAnswer).toBe(2)
    expect(savedFirst?.timeSpent).toBeGreaterThanOrEqual(0)

    const savedThird = json.questions.find((item) => item.id === 23493)
    expect(savedThird?.userAnswer).toEqual([1, 3])

    const savedFourth = json.questions.find((item) => item.id === 23494)
    expect(savedFourth?.userAnswer).toBeNull()
    expect(savedFourth?.timeSpent).toBe(0)
  })

  it('only allows saving when answered / total is greater than 50%', () => {
    const questions = [1, 2, 3, 4].map((id) =>
      practiceQuestion(apiQuestion({ id, tag: '常识判断' })),
    )
    const twoAnswers = {
      '1': answer(['A'], true),
      '2': answer(['B'], false),
    }

    expect(
      buildRecordPayload({
        title: '一组练习',
        questions,
        answers: twoAnswers,
        timeTaken: 10,
      }).canSave,
    ).toBe(false)

    const threeAnswers = { ...twoAnswers, '3': answer(['A'], true) }
    const built = buildRecordPayload({
      title: '一组练习',
      questions,
      answers: threeAnswers,
      timeTaken: 10,
    })

    expect(built.canSave).toBe(true)
    expect(built.payload.unanswered).toBe(1)
  })

  it('falls back to a native-shaped question when raw API data is absent', () => {
    const question: PracticeQuestion = {
      id: 900_001,
      title: '测试题',
      type: 'judge',
      options: ['正确', '错误'],
      correctAnswer: ['B'],
      analysis: '测试解析',
    }

    const built = buildRecordPayload({
      title: '一组练习',
      questions: [question],
      answers: { '900001': answer(['B'], false) },
      timeTaken: 5,
    })

    const json = JSON.parse(built.payload.json) as {
      questions: Array<Record<string, unknown>>
    }
    expect(json.questions[0]).toMatchObject({
      id: 900_001,
      type: 'judge',
      userAnswer: 1,
      correctAnswer: '1',
    })
  })
})
