import CryptoJS from 'crypto-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ApiClient from '../../../api/client'
import {
  addVocabularyToPersonal,
  isWordInPersonalList,
  loadHighFrequency,
  loadPersonalWords,
  loadVocabularyDetail,
  removePersonalWord,
  searchVocabulary,
  splitWordList,
  toPersonalWordInput,
  toggleHighFrequency,
  updatePersonalWord,
  wordDetailReference,
  wordKindFromWordType,
} from '../vocabService'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('../../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>()
  return { ...actual, post: postMock }
})

const PREFIX_KEY = 'AbCdEfGh12345678'
const context = { baseUrl: 'https://saduck.test/api', token: 'test-token' }

function encryptPrefixed(value: unknown): string {
  const cipher = CryptoJS.AES.encrypt(
    JSON.stringify(value),
    CryptoJS.enc.Utf8.parse(PREFIX_KEY),
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
  ).toString()
  return `${PREFIX_KEY}${cipher}`
}

function envelope(result: unknown, code = 0) {
  return { code, message: null, timestamp: 0, result }
}

const idiomDetail = {
  id: 32319,
  wordType: 1,
  wordContent: '一蹴而就',
  abbreviation: 'ycej',
  derivation: '出自宋·苏洵《上田枢密书》',
  example: '行百里者半九十，成功不会<font color="#fc5531">一蹴而就</font>。',
  explanation: '踏一步就成功，形容事情轻而易举。',
  pinyin: 'yī cù ér jiù',
  similar: '一蹴即至,一举成功',
  opposite: '一事无成,一蹶不振',
  wordSex: '贬义',
  hot: true,
}

const termDetail = {
  id: 9001,
  wordType: 2,
  wordContent: '斡旋',
  derivation: null,
  example: '双方正在斡旋。',
  explanation: '调解争端。',
  pinyin: 'wò xuán',
  similar: '调停',
  opposite: '',
  wordSex: '',
  hot: false,
}

beforeEach(() => {
  postMock.mockReset()
})

describe('searchVocabulary', () => {
  it('uses the idiom endpoint and decrypts the prefixed payload', async () => {
    postMock.mockResolvedValueOnce(
      envelope(encryptPrefixed([{ id: 32319, value: '一蹴而就', hot: true }])),
    )

    const result = await searchVocabulary('idiom', '  一蹴而就  ', context)

    expect(postMock).toHaveBeenCalledWith(
      '/word/getWordByKeyEncryption',
      { key: '一蹴而就' },
      expect.anything(),
    )
    expect(result).toEqual({
      kind: 'idiom',
      query: '一蹴而就',
      results: [{ id: 32319, value: '一蹴而就', hot: true }],
    })
  })

  it('uses the term endpoint for 词语', async () => {
    postMock.mockResolvedValueOnce(envelope(encryptPrefixed([{ id: 9001, value: '斡旋' }])))

    const result = await searchVocabulary('term', '斡旋', context)

    expect(postMock.mock.calls[0][0]).toBe('/word/getTermsByKeyEncryption')
    expect(result.results).toEqual([{ id: 9001, value: '斡旋', hot: false }])
  })

  it('rejects an empty query before calling the API', async () => {
    await expect(searchVocabulary('idiom', '   ', context)).rejects.toThrow()
    expect(postMock).not.toHaveBeenCalled()
  })
})

describe('word detail', () => {
  it('sends `{ context }` for idiom detail and decodes highlighting', async () => {
    postMock.mockResolvedValueOnce(envelope(encryptPrefixed(idiomDetail)))

    const detail = await loadVocabularyDetail('idiom', '一蹴而就', context)

    expect(postMock.mock.calls[0][0]).toBe('/word/getWordEncryption')
    expect(postMock.mock.calls[0][1]).toEqual({ context: '一蹴而就' })
    expect(detail.wordContent).toBe('一蹴而就')
    expect(detail.example).toContain('<font color="#fc5531">')
    expect(detail.pinyin).toBe('yī cù ér jiù')
    expect(detail.similar).toBe('一蹴即至,一举成功')
  })

  it('sends a numeric id for term detail, even when the reference is numeric text', async () => {
    postMock
      .mockResolvedValueOnce(envelope(encryptPrefixed(termDetail)))
      .mockResolvedValueOnce(envelope(encryptPrefixed(termDetail)))

    await loadVocabularyDetail('term', 9001, context)
    await loadVocabularyDetail('term', '9001', context)

    expect(postMock.mock.calls[0][0]).toBe('/word/getTermsEncryption')
    expect(postMock.mock.calls[0][1]).toEqual({ id: 9001 })
    expect(postMock.mock.calls[1][1]).toEqual({ id: 9001 })
  })

  it('rejects a non-numeric term reference instead of sending a context', async () => {
    await expect(loadVocabularyDetail('term', '斡旋', context)).rejects.toThrow()
    expect(postMock).not.toHaveBeenCalled()
  })

  it('prefers the searched value for idioms and the id for terms', () => {
    expect(wordDetailReference('idiom', { id: 1, value: '一蹴而就' })).toBe('一蹴而就')
    expect(wordDetailReference('term', { id: 9001, value: '斡旋' })).toBe(9001)
    expect(wordKindFromWordType(1)).toBe('idiom')
    expect(wordKindFromWordType(2)).toBe('term')
    expect(wordKindFromWordType(undefined)).toBe('idiom')
  })
})

describe('high-frequency words', () => {
  it('decrypts only hword and maps saved ids', async () => {
    postMock.mockResolvedValueOnce(
      envelope({ myWordId: [32319], hword: encryptPrefixed([idiomDetail]) }),
    )

    const result = await loadHighFrequency(context)

    expect(postMock.mock.calls[0][0]).toBe('/word/getHWordEncryption')
    expect(result.myWordId).toEqual([32319])
    expect(result.hword[0].wordContent).toBe('一蹴而就')
  })

  it('adds and removes high-frequency words by wordId', async () => {
    postMock.mockResolvedValue(envelope(null))

    await toggleHighFrequency(32319, false, context)
    await toggleHighFrequency(32319, true, context)

    expect(postMock.mock.calls[0][0]).toBe('/word/addMyHWord?wordId=32319')
    expect(postMock.mock.calls[1][0]).toBe('/word/delMyHWord?wordId=32319')
  })
})

describe('personal word list', () => {
  it('keeps data when /myWord/list returns 102', async () => {
    postMock.mockResolvedValueOnce(
      envelope([{ ...idiomDetail, createTime: '2026-10-26 10:00:00' }], 102),
    )

    const result = await loadPersonalWords(context)

    expect(postMock.mock.calls[0]).toEqual([
      '/myWord/list',
      {},
      expect.objectContaining({ acceptedCodes: [0, 102] }),
    ])
    expect(result.code).toBe(102)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].wordContent).toBe('一蹴而就')
  })

  it('maps a detail into the personal-word payload', async () => {
    const input = toPersonalWordInput(idiomDetail)

    expect(input).toMatchObject({
      wordContent: '一蹴而就',
      explanation: idiomDetail.explanation,
      pinyin: 'yī cù ér jiù',
      similarArry: ['一蹴即至', '一举成功'],
      oppositeArry: ['一事无成', '一蹶不振'],
      wordSex: '贬义',
    })
    expect(splitWordList('甲，乙、丙')).toEqual(['甲', '乙', '丙'])
    expect(isWordInPersonalList(idiomDetail, [{ ...idiomDetail, id: 1 }])).toBe(true)
    expect(
      isWordInPersonalList(idiomDetail, [{ ...idiomDetail, id: 2, wordContent: '亦步亦趋' }]),
    ).toBe(false)
  })

  it('adds, updates, and deletes personal words with the documented bodies', async () => {
    postMock.mockResolvedValue(envelope(451))

    await addVocabularyToPersonal(idiomDetail, context)
    await updatePersonalWord({ ...toPersonalWordInput(idiomDetail), id: 451 }, context)
    await removePersonalWord(451, context)

    expect(postMock.mock.calls[0][0]).toBe('/myWord/add')
    expect(postMock.mock.calls[0][1]).toMatchObject({ wordContent: '一蹴而就' })
    expect(postMock.mock.calls[1][0]).toBe('/myWord/update')
    expect(postMock.mock.calls[1][1]).toMatchObject({ id: 451 })
    expect(postMock.mock.calls[2]).toEqual([
      '/myWord/del',
      { id: 451 },
      expect.anything(),
    ])
  })
})
