import { describe, expect, it } from 'vitest'

import {
  normalizeSelectedLabels,
  parseAnswerInput,
  parseSlashCommand,
  parseStudyIntent,
} from '../commandParser'
import { correctLabelsFromRaw, normalizeQuestionType, type PracticeQuestion } from '../chatTypes'

function single(): PracticeQuestion {
  return {
    id: 1,
    type: 'single',
    title: '选一个',
    options: ['甲', '乙', '丙', '丁'],
    correctAnswer: ['A'],
    analysis: '解析',
  }
}

function multiple(): PracticeQuestion {
  return {
    id: 2,
    type: 'multiple',
    title: '选多个',
    options: ['甲', '乙', '丙', '丁'],
    correctAnswer: ['A', 'C'],
    analysis: '解析',
  }
}

function judge(): PracticeQuestion {
  return {
    id: 3,
    type: 'judge',
    title: '判断',
    options: ['正确', '错误'],
    correctAnswer: ['A'],
    analysis: '解析',
  }
}

describe('parseSlashCommand', () => {
  it('parses known commands and arguments', () => {
    expect(parseSlashCommand('/help')).toMatchObject({
      type: 'slash',
      name: 'help',
      args: [],
    })
    expect(parseSlashCommand('  /skin   chatgpt ')).toMatchObject({
      type: 'slash',
      name: 'skin',
      args: ['chatgpt'],
    })
  })

  it('returns an unknown marker for unsupported commands', () => {
    expect(parseSlashCommand('/login')).toMatchObject({
      type: 'unknown',
      name: 'login',
    })
    expect(parseSlashCommand('/')).toMatchObject({ type: 'unknown' })
  })

  it('returns null for ordinary conversation', () => {
    expect(parseSlashCommand('帮我找一组题练练')).toBeNull()
  })
})

describe('parseAnswerInput', () => {
  it('accepts letters, lowercase, and full-width input', () => {
    expect(parseAnswerInput('a', single())).toEqual(['A'])
    expect(parseAnswerInput('Ｂ', single())).toEqual(['B'])
    expect(parseAnswerInput('1', single())).toEqual(['A'])
    expect(parseAnswerInput('４', single())).toEqual(['D'])
  })

  it('rejects multiple answers for single questions', () => {
    expect(parseAnswerInput('AB', single())).toBeNull()
    expect(parseAnswerInput('A,B', single())).toBeNull()
  })

  it('supports set answers for multiple questions', () => {
    expect(parseAnswerInput('AC', multiple())).toEqual(['A', 'C'])
    expect(parseAnswerInput('A，C', multiple())).toEqual(['A', 'C'])
    expect(parseAnswerInput('A、C', multiple())).toEqual(['A', 'C'])
    expect(parseAnswerInput('1,3', multiple())).toEqual(['A', 'C'])
    expect(parseAnswerInput('丙', multiple())).toEqual(['C'])
    expect(parseAnswerInput('A,A', multiple())).toEqual(['A'])
  })

  it('maps judge words and values', () => {
    expect(parseAnswerInput('对', judge())).toEqual(['A'])
    expect(parseAnswerInput('正确', judge())).toEqual(['A'])
    expect(parseAnswerInput('错', judge())).toEqual(['B'])
    expect(parseAnswerInput('错误', judge())).toEqual(['B'])
    expect(parseAnswerInput('1', judge())).toEqual(['A'])
    expect(parseAnswerInput('2', judge())).toEqual(['B'])
  })

  it('rejects unrecognized input', () => {
    expect(parseAnswerInput('也许吧', single())).toBeNull()
    expect(parseAnswerInput('', single())).toBeNull()
  })

  it('normalizes clicked labels', () => {
    expect(normalizeSelectedLabels(['C', 'A', 'A'], multiple())).toEqual(['A', 'C'])
    expect(normalizeSelectedLabels(['B', 'A'], single())).toEqual(['A'])
  })
})

describe('parseStudyIntent', () => {
  it('matches the neutral landing suggestions', () => {
    expect(parseStudyIntent('帮我找一组题练练')).toBe('practice')
    expect(parseStudyIntent('继续上次的错题')).toBe('wrong')
    expect(parseStudyIntent('聊聊最近的高频成语')).toBe('vocabulary')
  })

  it('matches shenlun and ignores chit-chat', () => {
    expect(parseStudyIntent('帮我看看申论')).toBe('shenlun')
    expect(parseStudyIntent('今天天气不错')).toBeNull()
  })
})

describe('correct answer semantics from the live bundle', () => {
  it('treats single/multiple values as 0-based option indexes', () => {
    expect(correctLabelsFromRaw('3', 4, 'single')).toEqual(['D'])
    expect(correctLabelsFromRaw('3', 4, 'multiple')).toEqual(['D'])
    expect(correctLabelsFromRaw('0,2', 4, 'multiple')).toEqual(['A', 'C'])
  })

  it('maps judge values: 0 = 正确, non-zero = 错误', () => {
    expect(correctLabelsFromRaw('0', 2, 'judge')).toEqual(['A'])
    expect(correctLabelsFromRaw('1', 2, 'judge')).toEqual(['B'])
  })

  it('accepts multi as an alias for multiple', () => {
    expect(normalizeQuestionType('multi')).toBe('multiple')
    expect(normalizeQuestionType('multiple')).toBe('multiple')
    expect(normalizeQuestionType('judge')).toBe('judge')
    expect(normalizeQuestionType('unknown')).toBe('single')
  })
})
