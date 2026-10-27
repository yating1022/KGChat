import { describe, expect, it } from 'vitest'

import { buildLoginBody } from '../endpoints/auth'
import { buildWordDetailBody } from '../endpoints/word'
import { ApiError, DecodeError } from '../errors'
import { parseWith, practiceSetSchema, questionArraySchema } from '../types'

describe('buildLoginBody', () => {
  it('builds a password-mode body with a 10-digit sign', () => {
    const body = buildLoginBody({
      email: '  user@example.com  ',
      password: 'secret123',
      mode: 'password',
    })

    expect(body).toMatchObject({
      email: 'user@example.com',
      password: 'secret123',
      code: '',
      k: '',
    })
    expect(body.sign).toMatch(/^\d{10}$/)
  })

  it('builds a code-mode body and omits the password', () => {
    const body = buildLoginBody({
      email: 'user@example.com',
      password: 'should-not-be-sent',
      code: '1234',
      mode: 'code',
    })

    expect(body.password).toBe('')
    expect(body.code).toBe('1234')
    expect(body.sign).toMatch(/^\d{10}$/)
  })

  it('defaults to password mode', () => {
    const body = buildLoginBody({ email: 'a@b.c', password: 'abc123' })
    expect(body.password).toBe('abc123')
    expect(body.code).toBe('')
  })
})

describe('buildWordDetailBody', () => {
  it('uses id for numeric references', () => {
    expect(buildWordDetailBody('idiom', 32319)).toEqual({ id: 32319 })
    expect(buildWordDetailBody('term', 118929)).toEqual({ id: 118929 })
  })

  it('uses context for a string idiom lookup', () => {
    expect(buildWordDetailBody('idiom', '一蹴而就')).toEqual({ context: '一蹴而就' })
  })

  it('accepts numeric strings for terms', () => {
    expect(buildWordDetailBody('term', '118929')).toEqual({ id: 118929 })
  })

  it('rejects non-numeric term references', () => {
    expect(() => buildWordDetailBody('term', '改革')).toThrow(ApiError)
  })
})

describe('trust-boundary normalization', () => {
  it('normalizes question fields without leaking types into the UI', () => {
    const parsed = parseWith(
      questionArraySchema,
      [
        {
          id: '42',
          title: null,
          type: null,
          correctAnswer: 3,
          options: null,
          analysis: null,
          source: null,
          tag: null,
          material: null,
          userAnswer: null,
          memorize: null,
        },
      ],
      '题目',
    )

    expect(parsed[0]).toEqual({
      id: 42,
      title: '',
      type: 'single',
      globalAccuracy: null,
      correctAnswer: '3',
      options: '',
      analysis: '',
      source: '',
      tag: '',
      material: '',
      userAnswer: null,
      memorize: false,
    })
  })

  it('throws DecodeError when a payload cannot match the schema', () => {
    expect(() => parseWith(questionArraySchema, { not: 'an array' }, '题目')).toThrow(
      DecodeError,
    )
  })
})

describe('practiceSetSchema tl', () => {
  const liveModules = [
    { name: '马克思主义', num: 5, snum: 1, enum: 5 },
    { name: '政治理论', num: 3, snum: 1, enum: 3 },
  ]

  it('accepts the live array shape used by tag/wrong/practice endpoints', () => {
    const parsed = parseWith(
      practiceSetSchema,
      { resps: [], testName: '专项练习', tl: liveModules },
      '专项练习',
    )

    expect(parsed.tl).toEqual(liveModules)
  })

  it('still accepts a string payload', () => {
    const parsed = parseWith(practiceSetSchema, { resps: [], tl: '[{"name":"政治理论"}]' }, '专项练习')

    expect(parsed.tl).toBe('[{"name":"政治理论"}]')
  })

  it('normalizes a missing tl to an empty array', () => {
    const parsed = parseWith(practiceSetSchema, { resps: [] }, '专项练习')

    expect(parsed.tl).toEqual([])
  })
})
