import { beforeEach, describe, expect, it, vi } from 'vitest'

import { encryptSourceId } from '../../../api/crypto'
import type * as ApiClient from '../../../api/client'
import { SMART_PAPER_PRESETS } from '../presets'
import {
  labelsFromUserAnswer,
  loadRecord,
  sampleIds,
  splitOptions,
  startFavorites,
  startPaper,
  startSmartPaper,
  startTagPaper,
  startWrong,
  toPracticeQuestion,
} from '../practiceService'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('../../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>()
  return { ...actual, post: postMock }
})

function apiQuestion(patch: Record<string, unknown> = {}) {
  return {
    id: 23491,
    title: '<p>关于……下列说法正确的是：</p>',
    type: 'single',
    globalAccuracy: 57,
    correctAnswer: '3',
    options: '选项一#选项二#选项三#选项四',
    analysis: '<p>解析</p>',
    source: '2026年国家公务员录用考试《行测》（副省级）',
    tag: '理论政策',
    material: '',
    userAnswer: null,
    memorize: false,
    ...patch,
  }
}

function envelope(result: unknown) {
  return { code: 0, message: null, timestamp: 0, result }
}

const context = { baseUrl: 'https://example.test/api', token: 'test-token' }

beforeEach(() => {
  postMock.mockReset()
})

describe('toPracticeQuestion', () => {
  it('maps single, multiple, and judge answers from 0-based values', () => {
    const single = toPracticeQuestion(
      apiQuestion({ correctAnswer: '3', options: '一#二#三#四' }) as never,
    )
    expect(single.type).toBe('single')
    expect(single.correctAnswer).toEqual(['D'])
    expect(single.options).toEqual(['一', '二', '三', '四'])

    const multiple = toPracticeQuestion(
      apiQuestion({
        type: 'multiple',
        correctAnswer: '1,3',
        options: '一#二#三#四',
      }) as never,
    )
    expect(multiple.type).toBe('multiple')
    expect(multiple.correctAnswer).toEqual(['B', 'D'])

    const alias = toPracticeQuestion(
      apiQuestion({ type: 'multi', correctAnswer: '0,2', options: '一#二#三' }) as never,
    )
    expect(alias.type).toBe('multiple')
    expect(alias.correctAnswer).toEqual(['A', 'C'])

    const judgeTrue = toPracticeQuestion(
      apiQuestion({ type: 'judge', correctAnswer: '0', options: '正确#错误' }) as never,
    )
    expect(judgeTrue.correctAnswer).toEqual(['A'])

    const judgeFalse = toPracticeQuestion(
      apiQuestion({ type: 'judge', correctAnswer: '1', options: '正确#错误' }) as never,
    )
    expect(judgeFalse.correctAnswer).toEqual(['B'])
  })

  it('splits options on # without breaking HTML attributes', () => {
    expect(splitOptions('<font color="#fc5531">甲</font>#乙#&#39;丙&#39;')).toEqual([
      '<font color="#fc5531">甲</font>',
      '乙',
      '&#39;丙&#39;',
    ])
  })

  it('keeps raw API fields for record saving', () => {
    const raw = apiQuestion()
    const mapped = toPracticeQuestion(raw as never)

    expect(mapped.raw).toEqual(raw)
  })
})

describe('startPaper', () => {
  it('encrypts the source id and uses a neutral session title', async () => {
    postMock.mockResolvedValueOnce(envelope([apiQuestion()]))

    const start = await startPaper(
      {
        sid: 19463,
        source: '2026年国家公务员录用考试《行测》（副省级）',
        type: 1,
        difficulty: '4.4',
        model: '[{"name":"政治理论","snum":1,"enum":20}]',
        fraction: 0,
      },
      context,
    )

    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, body] = postMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(path).toBe('/tk/sourceInfo')
    expect(body.id).toBe(encryptSourceId(19463))
    expect(start.title).toBe('一组历年题')
    expect(start.title).not.toContain('国家公务员')
    expect(start.questions).toHaveLength(1)
    expect(start.model).toEqual([{ name: '政治理论', snum: 1, enum: 20 }])
    expect(start.remote).toBe(true)
  })
})

describe('startSmartPaper', () => {
  it('posts the preset reqs with the selected difficulty', async () => {
    postMock.mockResolvedValueOnce(envelope([apiQuestion()]))

    const start = await startSmartPaper('安徽', 2, context)
    const [path, body] = postMock.mock.calls[0] as [string, Record<string, unknown>]

    expect(path).toBe('/tk/intelligence')
    expect(body.reqs).toEqual(SMART_PAPER_PRESETS['安徽'])
    expect(body.difficulty).toBe('2')
    expect(start.title).toBe('一组行测练习')
  })
})

describe('startTagPaper', () => {
  it('accepts the live tl array and keeps it as record model metadata', async () => {
    const tl = [{ name: '政治理论', num: 5, snum: 1, enum: 5 }]
    postMock.mockResolvedValueOnce(
      envelope({
        resps: [apiQuestion()],
        testName: '2026国考专项-政治理论',
        tl,
      }),
    )

    const start = await startTagPaper([{ name: '理论政策', num: 5 }], 3, context)
    const [path, body] = postMock.mock.calls[0] as [string, Record<string, unknown>]

    expect(path).toBe('/tk/tagInfo')
    expect(body.reqs).toEqual([{ name: '理论政策', num: 5 }])
    expect(body.difficulty).toBe('3')
    expect(start.title).toBe('一组专项练习')
    expect(start.title).not.toContain('国考')
    expect(start.model).toEqual(tl)
  })

  it('still accepts a string tl and sends null difficulty when none is selected', async () => {
    postMock.mockResolvedValueOnce(
      envelope({ resps: [apiQuestion()], testName: '专项', tl: '[{"name":"政治理论"}]' }),
    )

    const start = await startTagPaper([{ name: '理论政策', num: 5 }], null, context)
    const [, body] = postMock.mock.calls[0] as [string, Record<string, unknown>]

    expect(body.difficulty).toBeNull()
    expect(start.model).toBe('[{"name":"政治理论"}]')
  })
})

describe('startWrong', () => {
  it('sends question ids as indexs and accepts the live tl array', async () => {
    const tl = [{ name: '经济', num: 2, snum: 1, enum: 2 }]
    postMock.mockResolvedValueOnce(
      envelope({ resps: [apiQuestion()], testName: '错题练习', tl }),
    )

    const ids = [22720, 23491]
    const start = await startWrong('经济', ids, context)
    const [path, body] = postMock.mock.calls[0] as [string, Record<string, unknown>]

    expect(path).toBe('/tk/getCtInfo')
    expect(body).toEqual({ indexs: ids, name: '经济' })
    expect(start.title).toBe('几道错题')
    expect(start.model).toEqual(tl)
  })

  it('samples at most ten unique ids', () => {
    const ids = Array.from({ length: 30 }, (_, index) => index + 1)
    const sample = sampleIds(ids)
    expect(sample).toHaveLength(10)
    expect(new Set(sample).size).toBe(10)
  })
})

describe('startFavorites', () => {
  it('caps the session at 20 questions and uses at most 4 concurrent requests', async () => {
    let active = 0
    let peak = 0

    postMock.mockImplementation(async (path: string) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      const id = Number(new URL(`https://x.test${path}`).searchParams.get('id'))
      return envelope(apiQuestion({ id, userAnswer: null }))
    })

    const ids = Array.from({ length: 26 }, (_, index) => index + 1)
    const start = await startFavorites(ids, context)

    expect(postMock).toHaveBeenCalledTimes(20)
    expect(start.questions).toHaveLength(20)
    expect(peak).toBeLessThanOrEqual(4)
    expect(start.title).toBe('收藏的几道题')
  })
})

describe('loadRecord', () => {
  it('rebuilds locked answers from the saved native userAnswer shape', async () => {
    postMock.mockResolvedValueOnce(
      envelope(
        JSON.stringify({
          model: [{ name: '政治理论' }],
          questions: [
            apiQuestion({ id: 1, type: 'single', correctAnswer: '2', userAnswer: 2 }),
            apiQuestion({
              id: 2,
              type: 'multiple',
              correctAnswer: '1,3',
              options: '一#二#三#四',
              userAnswer: [1, 3],
            }),
            apiQuestion({ id: 3, type: 'judge', correctAnswer: '1', userAnswer: 0 }),
          ],
        }),
      ),
    )

    const review = await loadRecord(9, 'review', context)

    expect(review.review).toBe(true)
    expect(review.remote).toBe(false)
    expect(review.title).toBe('一次练习回顾')
    expect(review.answers?.['1']).toMatchObject({ labels: ['C'], correct: true })
    expect(review.answers?.['2']).toMatchObject({ labels: ['B', 'D'], correct: true })
    expect(review.answers?.['3']).toMatchObject({ labels: ['A'], correct: false })
  })

  it('can rebuild a redo session without answers', async () => {
    postMock.mockResolvedValueOnce(
      envelope(JSON.stringify({ model: [], questions: [apiQuestion({ id: 1 })] })),
    )

    const redo = await loadRecord(10, 'redo', context)

    expect(redo.review).toBeUndefined()
    expect(redo.remote).toBe(true)
    expect(redo.answers).toBeUndefined()
    expect(redo.title).toBe('一组练习')
  })
})

describe('labelsFromUserAnswer', () => {
  it('accepts native numbers, arrays, and labels', () => {
    expect(labelsFromUserAnswer(2, 'single', 4)).toEqual(['C'])
    expect(labelsFromUserAnswer([1, 3], 'multiple', 4)).toEqual(['B', 'D'])
    expect(labelsFromUserAnswer('C', 'single', 4)).toEqual(['C'])
    expect(labelsFromUserAnswer(null, 'single', 4)).toEqual([])
  })

  it('accepts a comma-separated numeric string for multiple answers', () => {
    expect(labelsFromUserAnswer('0, 2', 'multiple', 4)).toEqual(['A', 'C'])
    expect(labelsFromUserAnswer('2，0', 'multiple', 4)).toEqual(['A', 'C'])
  })
})
