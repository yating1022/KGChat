import { describe, expect, it } from 'vitest'

import type { AnalyzeWord } from '../../../api/types'
import { practiceReducer, type PracticeMachine } from '../../../chat/practiceReducer'
import { buildAnalyzeRounds, shuffleWithSeed } from '../analyzeEngine'
import { analyzeHistoryCount, prepareAnalyzeStart } from '../analyzeService'

const words: AnalyzeWord[] = [
  {
    id: 451,
    groupId: 116,
    idiom: '奉为圭臬',
    definition: '把某种准则、理论当作最高准则来遵循',
    keynote: '必须遵守、不可逾越',
    meaning: '各地将以人民为中心的发展思想奉为圭臬。',
  },
  {
    id: 452,
    groupId: 116,
    idiom: '亦步亦趋',
    definition: '比喻没有主见，处处追随模仿别人',
    keynote: '含贬义，强调缺乏独立性',
    meaning: '学习不能亦步亦趋。',
  },
  {
    id: 453,
    groupId: 116,
    idiom: '步人后尘',
    definition: '跟在别人后面，比喻追随模仿',
    keynote: '多指落后于人',
    meaning: '技术上不能总是步人后尘。',
  },
  {
    id: 454,
    groupId: 116,
    idiom: '人云亦云',
    definition: '别人说什么自己也跟着说什么',
    keynote: '强调没有自己的见解',
    meaning: '讨论时要独立思考，不要人云亦云。',
  },
]

function labelIndex(label: string): number {
  return label.charCodeAt(0) - 65
}

function startMachine(): PracticeMachine {
  return practiceReducer(
    { messages: [], practice: null },
    {
      type: 'start',
      questions: buildAnalyzeRounds(words, 'wordToDef'),
      intro: '先看成语选释义。',
      flow: 'analyze',
      groupId: 116,
      remote: false,
    },
  )
}

describe('buildAnalyzeRounds', () => {
  it('builds wordToDef rounds whose 0-based label points at the matching definition', () => {
    const rounds = buildAnalyzeRounds(words, 'wordToDef')

    expect(rounds).toHaveLength(4)

    for (const [index, round] of rounds.entries()) {
      const word = words[index]
      expect(round.type).toBe('single')
      expect(round.options).toHaveLength(4)
      expect(round.options).toEqual(expect.arrayContaining(words.map((item) => item.definition)))
      expect(round.title).toContain(word.idiom)
      expect(round.correctAnswer).toHaveLength(1)

      const correct = round.options[labelIndex(round.correctAnswer[0])]
      expect(correct).toBe(word.definition)
    }
  })

  it('builds defToWord rounds whose label points at the matching idiom', () => {
    const rounds = buildAnalyzeRounds(words, 'defToWord')

    for (const [index, round] of rounds.entries()) {
      const word = words[index]
      expect(round.options).toEqual(expect.arrayContaining(words.map((item) => item.idiom)))
      expect(round.title).toContain(word.definition)

      const correct = round.options[labelIndex(round.correctAnswer[0])]
      expect(correct).toBe(word.idiom)
    }
  })

  it('uses distinct ids per mode and keeps shuffling deterministic', () => {
    const first = buildAnalyzeRounds(words, 'wordToDef')
    const second = buildAnalyzeRounds(words, 'wordToDef')
    const reverse = buildAnalyzeRounds(words, 'defToWord')

    expect(first).toEqual(second)
    expect(first.map((round) => round.options)).toEqual(
      second.map((round) => round.options),
    )
    expect(new Set(first.map((round) => round.id)).size).toBe(first.length)
    expect(first[0].id).not.toBe(reverse[0].id)
    expect(shuffleWithSeed([1, 2, 3], 7)).toEqual(shuffleWithSeed([1, 2, 3], 7))
  })

  it('carries definition, keynote, and example into the analysis', () => {
    const [first] = buildAnalyzeRounds(words, 'wordToDef')
    expect(first.analysis).toContain('把某种准则、理论当作最高准则来遵循')
    expect(first.analysis).toContain('必须遵守、不可逾越')
    expect(first.analysis).toContain('各地将以人民为中心的发展思想奉为圭臬')
  })
})

describe('analyze practice flow', () => {
  it('reveals the group difference right after answering and never offers favorite/save', () => {
    const started = startMachine()
    expect(started.practice?.flow).toBe('analyze')

    const firstQuestion = started.practice!.questions[0]
    const answered = practiceReducer(started, {
      type: 'answer',
      labels: firstQuestion.correctAnswer,
      revealAnalysis: true,
    })

    const analysis = answered.messages.find((message) => message.kind === 'analysis')
    expect(analysis).toMatchObject({ lead: '这组词的区别是这样的：' })
    expect(answered.practice?.revealed[String(firstQuestion.id)]).toBe(true)

    const actions = answered.messages.at(-1)
    expect(actions?.kind).toBe('actions')
    if (actions?.kind === 'actions') {
      expect(actions.actions.map((action) => action.label)).toEqual(['下一题'])
    }
  })

  it('ends with 标记已掌握 instead of saving a practice record', () => {
    let machine = startMachine()
    const total = machine.practice!.questions.length

    for (let index = 0; index < total; index += 1) {
      const question = machine.practice!.questions[index]
      machine = practiceReducer(machine, {
        type: 'answer',
        labels: question.correctAnswer,
        revealAnalysis: true,
      })
      machine = practiceReducer(machine, { type: 'next' })
    }

    expect(machine.practice?.status).toBe('completed')

    const completion = machine.messages.at(-1)
    expect(completion?.kind).toBe('actions')
    if (completion?.kind === 'actions') {
      expect(completion.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'master', label: '标记已掌握' }),
        ]),
      )
      expect(completion.actions.some((action) => action.kind === 'save')).toBe(false)
    }

    const summary = machine.messages.find(
      (message) => message.kind === 'text' && message.content.includes('这组辨析完成了'),
    )
    expect(summary).toBeTruthy()
  })
})

describe('analyze service helpers', () => {
  it('prepares a start payload with the group id and a neutral intro', () => {
    const start = prepareAnalyzeStart(words, 'defToWord')

    expect(start.groupId).toBe(116)
    expect(start.mode).toBe('defToWord')
    expect(start.questions).toHaveLength(4)
    expect(start.intro).toContain('看释义猜成语')
  })

  it('counts history entries across the shapes myInfo may return', () => {
    expect(analyzeHistoryCount([1, 2, 3])).toBe(3)
    expect(analyzeHistoryCount({ list: [1, 2] })).toBe(2)
    expect(analyzeHistoryCount({ total: 9 })).toBe(9)
    expect(analyzeHistoryCount({ something: true })).toBeNull()
  })
})
