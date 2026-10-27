import { post, postOptions, type ApiContext } from '../client'
import { decryptPrefixed } from '../crypto'
import { ApiError } from '../errors'
import {
  highFrequencyRawSchema,
  parseWith,
  personalWordListSchema,
  wordDetailListSchema,
  wordDetailSchema,
  wordSummaryListSchema,
  type DataWithCode,
  type HighFrequencyResult,
  type PersonalWord,
  type PersonalWordInput,
  type PersonalWordUpdateInput,
  type WordDetail,
  type WordKind,
  type WordSummary,
} from '../types'

function queryId(id: number | string): string {
  return encodeURIComponent(String(id))
}

function decryptPayload(value: unknown): unknown {
  return decryptPrefixed(value)
}

export async function searchWords(
  kind: WordKind,
  query: string,
  context: ApiContext = {},
): Promise<WordSummary[]> {
  const path =
    kind === 'idiom' ? '/word/getWordByKeyEncryption' : '/word/getTermsByKeyEncryption'
  const envelope = await post<unknown>(path, { key: query }, postOptions(context))
  return parseWith(wordSummaryListSchema, decryptPayload(envelope.result), '搜索结果')
}

/**
 * Pure request-body builder for word detail lookups.
 *
 * Idiom detail accepts a context string; term detail requires a numeric id.
 */
export function buildWordDetailBody(
  kind: WordKind,
  reference: number | string,
): { id: number } | { context: string } {
  if (typeof reference === 'number') {
    return { id: reference }
  }

  if (kind === 'idiom') {
    return { context: reference }
  }

  const numeric = Number(reference)
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new ApiError(1, '词语详情需要有效的 id')
  }
  return { id: numeric }
}

export async function getWordDetail(
  kind: WordKind,
  reference: number | string,
  context: ApiContext = {},
): Promise<WordDetail> {
  const path = kind === 'idiom' ? '/word/getWordEncryption' : '/word/getTermsEncryption'
  const envelope = await post<unknown>(
    path,
    buildWordDetailBody(kind, reference),
    postOptions(context),
  )
  return parseWith(wordDetailSchema, decryptPayload(envelope.result), '词语详情')
}

export async function getHighFrequencyWords(
  context: ApiContext,
): Promise<HighFrequencyResult> {
  const envelope = await post<unknown>(
    '/word/getHWordEncryption',
    {},
    postOptions(context),
  )
  const raw = parseWith(highFrequencyRawSchema, envelope.result, '高频词')
  const hword = parseWith(
    wordDetailListSchema,
    decryptPayload(raw.hword),
    '高频词',
  )
  return { myWordId: raw.myWordId, hword }
}

export async function addHighFrequencyWord(
  wordId: number,
  context: ApiContext,
): Promise<void> {
  await post(`/word/addMyHWord?wordId=${queryId(wordId)}`, {}, postOptions(context))
}

export async function removeHighFrequencyWord(
  wordId: number,
  context: ApiContext,
): Promise<void> {
  await post(`/word/delMyHWord?wordId=${queryId(wordId)}`, {}, postOptions(context))
}

/**
 * Reads the personal word list. Code 102 still carries data, so the caller
 * receives the code and decides how to present the membership warning.
 */
export async function listPersonalWords(
  context: ApiContext,
): Promise<DataWithCode<PersonalWord[]>> {
  const envelope = await post<unknown>('/myWord/list', {}, postOptions(context, [0, 102]))
  return {
    data: parseWith(personalWordListSchema, envelope.result, '生词本'),
    code: envelope.code,
  }
}

export async function addPersonalWord(
  input: PersonalWordInput,
  context: ApiContext,
): Promise<number | null> {
  const envelope = await post<number | null>('/myWord/add', input, postOptions(context))
  return envelope.result
}

export async function updatePersonalWord(
  input: PersonalWordUpdateInput,
  context: ApiContext,
): Promise<void> {
  await post('/myWord/update', input, postOptions(context))
}

export async function deletePersonalWord(id: number, context: ApiContext): Promise<void> {
  await post('/myWord/del', { id }, postOptions(context))
}
