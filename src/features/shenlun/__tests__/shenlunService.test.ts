import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ApiClient from '../../../api/client'
import type { ShenlunRecord } from '../../../api/types'
import {
  SHENLUN_MIN_ANSWER_LENGTH,
  buildShenlunReport,
  findShenlunRecord,
  hasShenlunReportContent,
  loadShenlunReport,
  resolveShenlunRecord,
  saveAndResolveShenlun,
  saveShenlunAnswer,
  shenlunAnswerLength,
  shenlunPollingExpired,
  stripHtml,
  submitShenlunCorrection,
  toShenlunMaterials,
} from '../shenlunService'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('../../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>()
  return { ...actual, post: postMock }
})

const context = { baseUrl: 'https://example.test/api', token: 'test-token' }

function envelope(result: unknown, message: string | null = null, code = 0) {
  return { code, message, timestamp: 0, result }
}

function record(patch: Partial<ShenlunRecord> = {}): ShenlunRecord {
  return {
    sid: 80974,
    tid: 7904460,
    name: '2026年国家公考《申论》题（副省级）',
    wt: '请根据“给定资料1”，谈一谈H市是如何管理“城市用光”的。',
    ctime: '2026-10-26 10:00:00',
    utime: '2026-10-26 10:05:00',
    pgStatus: 1,
    r: '用户作答内容',
    ...patch,
  }
}

const question = {
  id: 10011,
  content: '<p>请根据“给定资料1”，谈一谈H市是如何管理“城市用光”的。（10分）</p>',
  plainContent: '请根据“给定资料1”，谈一谈H市是如何管理“城市用光”的。（10分）',
}

beforeEach(() => {
  postMock.mockReset()
})

describe('findShenlunRecord', () => {
  it('matches the paper id and question text, preferring the newest record', () => {
    const older = record({ sid: 1, utime: '2026-10-26 09:00:00' })
    const newer = record({ sid: 2, utime: '2026-10-26 11:00:00' })
    const otherPaper = record({ sid: 3, tid: 111, utime: '2026-10-26 12:00:00' })
    const otherQuestion = record({ sid: 4, wt: '另一道题', utime: '2026-10-26 12:00:00' })

    const found = findShenlunRecord(
      [older, newer, otherPaper, otherQuestion],
      7904460,
      '<p>请根据“给定资料1”，谈一谈H市是如何管理“城市用光”的。（10分）</p>',
    )

    expect(found?.sid).toBe(2)
  })

  it('tolerates whitespace, tags, and punctuation differences', () => {
    const found = findShenlunRecord(
      [record({ wt: '请根据 给定资料1 谈一谈H市是如何管理 城市用光 的' })],
      '7904460',
      '<p>请根据“给定资料1”，谈一谈H市是如何管理“城市用光”的。（10分）</p>',
    )

    expect(found?.sid).toBe(80974)
  })

  it('prefers an exact stem match over a newer overlapping record', () => {
    const overlapping = record({
      sid: 1,
      wt: '请谈谈A',
      utime: '2026-10-26 12:00:00',
    })
    const exact = record({
      sid: 2,
      wt: '请谈谈A和B',
      utime: '2026-10-26 09:00:00',
    })

    const found = findShenlunRecord([overlapping, exact], 7904460, '请谈谈A和B')

    expect(found?.sid).toBe(2)
  })

  it('falls back to ctime when utime is empty', () => {
    const older = record({
      sid: 1,
      utime: '',
      ctime: '2026-10-26 09:00:00',
    })
    const newer = record({
      sid: 2,
      utime: '',
      ctime: '2026-10-26 11:00:00',
    })

    const found = findShenlunRecord([older, newer], 7904460, record().wt)

    expect(found?.sid).toBe(2)
  })

  it('returns null when no saved record matches yet', () => {
    expect(findShenlunRecord([record({ tid: 1 })], 7904460, '请根据“给定资料1”作答')).toBeNull()
  })
})

describe('answer length and text helpers', () => {
  it('counts code points and enforces the 100-character minimum', () => {
    expect(shenlunAnswerLength('  一二三  ')).toBe(3)
    expect(shenlunAnswerLength('🙂🙂')).toBe(2)
    expect(shenlunAnswerLength('字'.repeat(SHENLUN_MIN_ANSWER_LENGTH - 1))).toBe(99)
  })

  it('turns question HTML into the plain text correctEssay expects', () => {
    expect(stripHtml('<p>第一段<br>第二行</p><p>&ldquo;引用&rdquo;&amp;说明</p>')).toBe(
      '第一段\n第二行\n“引用”&说明',
    )
  })

  it('collects expanded material strings and wrapper objects', () => {
    expect(
      toShenlunMaterials(['<p>材料一</p>', { content: '<p>材料二</p>' }, '', { text: '' }]),
    ).toEqual(['<p>材料一</p>', '<p>材料二</p>'])
  })
})

describe('save -> resolve -> submit sequencing', () => {
  it('saves the answer, resolves the record sid, then submits correction', async () => {
    postMock
      .mockResolvedValueOnce(envelope(null))
      .mockResolvedValueOnce(envelope([record()]))
      .mockResolvedValueOnce(envelope(null))

    const input = {
      paperId: 7904460,
      question,
      answer: '  一是出台指导性文件，二是建立分区管理制度。  ',
      context,
    }

    const saved = await saveAndResolveShenlun(input)
    expect(saved?.sid).toBe(80974)

    await submitShenlunCorrection({ ...input, sid: saved!.sid })

    const calls = postMock.mock.calls as Array<[string, Record<string, unknown>]>
    expect(calls[0][0]).toBe('/sl/saveMy')
    expect(calls[0][1]).toEqual({
      problemId: 10011,
      answer: '一是出台指导性文件，二是建立分区管理制度。',
      answerId: 7904460,
    })

    expect(calls[1][0]).toBe('/sl/getMySl')

    expect(calls[2][0]).toBe('/extraFunctions/correctEssay')
    expect(calls[2][1]).toEqual({
      testId: 7904460,
      userAnswerId: 80974,
      problem: '请根据“给定资料1”，谈一谈H市是如何管理“城市用光”的。（10分）',
      r: '一是出台指导性文件，二是建立分区管理制度。',
    })
  })

  it('does not invent a sid when the saved record has not synced yet', async () => {
    postMock.mockResolvedValueOnce(envelope(null)).mockResolvedValueOnce(envelope([]))

    const recordOrNull = await saveAndResolveShenlun({
      paperId: 7904460,
      question,
      answer: '一段作答',
      context,
    })

    expect(recordOrNull).toBeNull()
    expect(postMock).toHaveBeenCalledTimes(2)
  })

  it('reports a pending record through resolveShenlunRecord', async () => {
    postMock.mockResolvedValueOnce(envelope([record({ tid: 1 })]))

    const recordOrNull = await resolveShenlunRecord({
      paperId: 7904460,
      question,
      answer: '一段作答',
      context,
    })

    expect(recordOrNull).toBeNull()
  })

  it('validates empty answers before calling the API', async () => {
    await expect(
      saveShenlunAnswer({ paperId: 1, question, answer: '   ', context }),
    ).rejects.toThrow()
    expect(postMock).not.toHaveBeenCalled()
  })
})

describe('report polling', () => {
  it('parses the report JSON carried in message', async () => {
    const payload = {
      baseInfo: { questionType: '归纳概括', answerWordCount: 240, totalScore: 20 },
      finalScore: { actualScore: 15, level: '良好', scoreRate: '75%' },
    }
    postMock.mockResolvedValueOnce(envelope(null, JSON.stringify(payload)))

    const report = await loadShenlunReport(80974, context)

    expect(postMock).toHaveBeenCalledWith('/sl/pgResp?id=80974', {}, expect.anything())
    expect(report).toEqual(payload)
  })

  it('returns null while the report is still pending', async () => {
    postMock.mockResolvedValueOnce(envelope(null, null))
    await expect(loadShenlunReport(80974, context)).resolves.toBeNull()
  })

  it('caps automatic polling at three minutes', () => {
    const start = 1_000
    expect(shenlunPollingExpired(start, start + 179_000)).toBe(false)
    expect(shenlunPollingExpired(start, start + 180_000)).toBe(true)
    expect(shenlunPollingExpired(undefined)).toBe(false)
  })
})

describe('buildShenlunReport', () => {
  it('renders the live pgResp fields as a conversational report', () => {
    const report = buildShenlunReport({
      baseInfo: {
        questionType: '归纳概括',
        answerWordCount: 240,
        wordCountCheck: '符合要求',
        totalScore: 20,
      },
      finalScore: { actualScore: 15, level: '良好', scoreRate: '75%' },
      subScoreList: [
        { itemName: '要点完整', itemScore: 8, deductReason: '' },
        { itemName: '条理清晰', itemScore: 7, deductReason: '层次可以更清楚' },
      ],
      advantageList: ['要点覆盖较全'],
      errorList: [{ errorDesc: '表述略显口语', deductScore: 2 }],
      suggestList: ['多练习分条归纳'],
    })

    expect(report.headline).toBe('实际得分 15 / 20 · 等级 良好 · 得分率 75%')
    expect(report.info).toEqual([
      { label: '题型', value: '归纳概括' },
      { label: '作答字数', value: '240' },
      { label: '字数检查', value: '符合要求' },
      { label: '总分', value: '20' },
    ])
    expect(report.subScores).toHaveLength(2)
    expect(report.advantages).toEqual(['要点覆盖较全'])
    expect(report.errors).toEqual([{ errorDesc: '表述略显口语', deductScore: '2' }])
    expect(report.suggestions).toEqual(['多练习分条归纳'])
    expect(hasShenlunReportContent(report)).toBe(true)
  })

  it('accepts double-encoded report JSON', () => {
    const inner = JSON.stringify({
      finalScore: { actualScore: 12, totalScore: 20 },
    })

    const report = buildShenlunReport(JSON.stringify({ report: inner }))
    expect(report.headline).toContain('12')
  })

  it('falls back to generic sections for unknown shapes', () => {
    const report = buildShenlunReport({
      comment: '整体不错',
      detail: { tone: '稳健', advice: ['多写多改'] },
      list: [{ label: '字数', text: '略少' }],
    })

    expect(report.sections.map((section) => section.title)).toEqual(
      expect.arrayContaining(['点评', 'detail · tone', 'list']),
    )
    expect(hasShenlunReportContent(report)).toBe(true)
  })

  it('keeps plain-text reports readable', () => {
    const report = buildShenlunReport('批改服务暂时没有返回结构化结果')
    expect(report.sections[0]).toMatchObject({ title: '总评' })
    expect(hasShenlunReportContent(report)).toBe(true)
  })
})
