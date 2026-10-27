import type { ApiContext } from '../../api/client'
import * as wordApi from '../../api/endpoints/word'
import { DecodeError } from '../../api/errors'
import type {
  DataWithCode,
  HighFrequencyResult,
  PersonalWord,
  PersonalWordInput,
  PersonalWordUpdateInput,
  WordDetail,
  WordKind,
  WordSummary,
} from '../../api/types'
import { useAuthStore } from '../../auth/authStore'
import { useSettingsStore } from '../../settings/settingsStore'

export const WORD_KIND_LABELS: Record<WordKind, string> = {
  idiom: '成语',
  term: '词语',
}

export function currentVocabContext(signal?: AbortSignal): ApiContext {
  return {
    baseUrl: useSettingsStore.getState().apiBaseUrl,
    token: useAuthStore.getState().token,
    signal,
  }
}

export interface VocabularySearch {
  kind: WordKind
  query: string
  results: WordSummary[]
}

export function normalizeWordKind(value: unknown): WordKind {
  return value === 'term' ? 'term' : 'idiom'
}

/** API `wordType` is 1 for idioms (成语) and 2 for terms (词语). */
export function wordKindFromWordType(wordType: unknown): WordKind {
  return Number(wordType) === 2 ? 'term' : 'idiom'
}

export async function searchVocabulary(
  kind: WordKind,
  query: string,
  context: ApiContext = currentVocabContext(),
): Promise<VocabularySearch> {
  const trimmed = query.trim()
  if (!trimmed) throw new DecodeError('先输入一个成语或词语')

  const results = await wordApi.searchWords(kind, trimmed, context)
  return { kind, query: trimmed, results }
}

/**
 * Idiom detail accepts the searched word as `{ context }`; terms use the
 * numeric id from the search result. A numeric reference always wins.
 */
export function wordDetailReference(
  kind: WordKind,
  summary: Pick<WordSummary, 'id' | 'value'>,
): number | string {
  return kind === 'idiom' ? summary.value : summary.id
}

export async function loadVocabularyDetail(
  kind: WordKind,
  reference: number | string,
  context: ApiContext = currentVocabContext(),
): Promise<WordDetail> {
  return wordApi.getWordDetail(kind, reference, context)
}

export function toPersonalWordInput(detail: WordDetail): PersonalWordInput {
  const similarArray = splitWordList(detail.similar)
  const oppositeArray = splitWordList(detail.opposite)

  return {
    wordContent: detail.wordContent,
    ...(detail.explanation ? { explanation: detail.explanation } : {}),
    ...(detail.pinyin ? { pinyin: detail.pinyin } : {}),
    ...(detail.abbreviation ? { abbreviation: detail.abbreviation } : {}),
    ...(detail.example ? { example: detail.example } : {}),
    ...(detail.wordSex ? { wordSex: detail.wordSex } : {}),
    ...(detail.similar ? { similar: detail.similar } : {}),
    ...(detail.opposite ? { opposite: detail.opposite } : {}),
    ...(similarArray.length > 0 ? { similarArry: similarArray } : {}),
    ...(oppositeArray.length > 0 ? { oppositeArry: oppositeArray } : {}),
  }
}

export function splitWordList(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(/[,，、;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export async function addVocabularyToPersonal(
  detail: WordDetail,
  context: ApiContext = currentVocabContext(),
): Promise<number | null> {
  return wordApi.addPersonalWord(toPersonalWordInput(detail), context)
}

export async function loadHighFrequency(
  context: ApiContext = currentVocabContext(),
): Promise<HighFrequencyResult> {
  return wordApi.getHighFrequencyWords(context)
}

export async function toggleHighFrequency(
  wordId: number,
  saved: boolean,
  context: ApiContext = currentVocabContext(),
): Promise<void> {
  if (saved) {
    await wordApi.removeHighFrequencyWord(wordId, context)
    return
  }
  await wordApi.addHighFrequencyWord(wordId, context)
}

/** Code 102 can still carry personal words; callers keep the data. */
export async function loadPersonalWords(
  context: ApiContext = currentVocabContext(),
): Promise<DataWithCode<PersonalWord[]>> {
  return wordApi.listPersonalWords(context)
}

export async function createPersonalWord(
  input: PersonalWordInput,
  context: ApiContext = currentVocabContext(),
): Promise<number | null> {
  return wordApi.addPersonalWord(input, context)
}

export async function updatePersonalWord(
  input: PersonalWordUpdateInput,
  context: ApiContext = currentVocabContext(),
): Promise<void> {
  await wordApi.updatePersonalWord(input, context)
}

export async function removePersonalWord(
  id: number,
  context: ApiContext = currentVocabContext(),
): Promise<void> {
  await wordApi.deletePersonalWord(id, context)
}

export function personalWordInputFrom(
  word: PersonalWord,
  patch: Partial<PersonalWordInput> = {},
): PersonalWordUpdateInput {
  const merged = { ...toPersonalWordInput(word), id: word.id, ...patch }

  if (patch.similar !== undefined) merged.similarArry = splitWordList(patch.similar)
  if (patch.opposite !== undefined) merged.oppositeArry = splitWordList(patch.opposite)

  return merged
}

export function isWordInPersonalList(
  detail: Pick<WordDetail, 'wordContent'>,
  list: readonly PersonalWord[],
): boolean {
  const target = detail.wordContent.trim()
  return list.some((word) => word.wordContent.trim() === target)
}
