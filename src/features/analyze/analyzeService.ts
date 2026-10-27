import type { ApiContext } from '../../api/client'
import * as analyzeApi from '../../api/endpoints/analyze'
import { DecodeError } from '../../api/errors'
import type { AnalyzeWord } from '../../api/types'
import { useAuthStore } from '../../auth/authStore'
import { useSettingsStore } from '../../settings/settingsStore'
import { buildAnalyzeRounds, type AnalyzeMode } from './analyzeEngine'
import type { PracticeQuestion } from '../../chat/chatTypes'

export const ANALYZE_SESSION_TITLE = '几组词语辨析'

export function currentAnalyzeContext(signal?: AbortSignal): ApiContext {
  return {
    baseUrl: useSettingsStore.getState().apiBaseUrl,
    token: useAuthStore.getState().token,
    signal,
  }
}

export interface AnalyzeStart {
  groupId: number
  words: AnalyzeWord[]
  mode: AnalyzeMode
  questions: PracticeQuestion[]
  intro: string
}

export interface AnalyzeGroup {
  groupId: number
  words: AnalyzeWord[]
}

export function toAnalyzeGroup(words: AnalyzeWord[]): AnalyzeGroup {
  if (words.length === 0) {
    throw new DecodeError('这组词语暂时没有内容，换一组试试')
  }

  return { groupId: words[0].groupId, words }
}

function analyzeIntro(mode: AnalyzeMode): string {
  return mode === 'wordToDef'
    ? '我整理了一组词语辨析。先看成语选释义，答完会告诉你它们的区别。'
    : '这次反过来：看释义猜成语。答完同样会展开每个词的区别。'
}

export function prepareAnalyzeStart(
  words: AnalyzeWord[],
  mode: AnalyzeMode,
  groupId?: number,
): AnalyzeStart {
  const group = toAnalyzeGroup(words)
  const questions = buildAnalyzeRounds(group.words, mode)

  if (questions.length === 0) {
    throw new DecodeError('这组词语暂时没有可用的辨析题目')
  }

  return {
    groupId: groupId ?? group.groupId,
    words: group.words,
    mode,
    questions,
    intro: analyzeIntro(mode),
  }
}

export async function loadAnalyzeStart(
  mode: AnalyzeMode,
  context: ApiContext = currentAnalyzeContext(),
): Promise<AnalyzeStart> {
  const words = await analyzeApi.getAnalyzeGroup(context)
  return prepareAnalyzeStart(words, mode)
}

export async function markAnalyzeGroupMastered(
  groupId: number | string,
  context: ApiContext = currentAnalyzeContext(),
): Promise<void> {
  await analyzeApi.markAnalyzeGroupMastered(groupId, context)
}

export async function loadAnalyzeHistory(
  context: ApiContext = currentAnalyzeContext(),
): Promise<unknown> {
  return analyzeApi.getAnalyzeHistory(1, context)
}

export async function clearAnalyzeHistory(
  context: ApiContext = currentAnalyzeContext(),
): Promise<void> {
  await analyzeApi.clearAnalyzeHistory(context)
}

/** Best-effort count for `myInfo`, whose result shape is not documented. */
export function analyzeHistoryCount(raw: unknown): number | null {
  if (Array.isArray(raw)) return raw.length
  if (typeof raw !== 'object' || raw === null) return null

  const record = raw as Record<string, unknown>
  const candidates = ['list', 'records', 'rows', 'data', 'myInfo', 'zwList']

  for (const key of candidates) {
    const value = record[key]
    if (Array.isArray(value)) return value.length
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }

  if (typeof record.total === 'number' && Number.isFinite(record.total)) return record.total
  if (typeof record.count === 'number' && Number.isFinite(record.count)) return record.count
  if (typeof record.totalPage === 'number') return null

  return null
}
