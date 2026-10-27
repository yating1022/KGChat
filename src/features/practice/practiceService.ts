import type { ApiContext } from '../../api/client'
import * as tk from '../../api/endpoints/tk'
import type { PaperSource, PracticeSet, Question, WrongQuestionGroup } from '../../api/types'
import { DecodeError } from '../../api/errors'
import { useAuthStore } from '../../auth/authStore'
import {
  correctLabelsFromRaw,
  normalizeQuestionType,
  optionLabel,
  type PracticeAnswer,
  type PracticeQuestion,
  type QuestionType,
} from '../../chat/chatTypes'
import { useSettingsStore } from '../../settings/settingsStore'
import { SMART_PAPER_PRESETS, type SmartPaperRegion } from './presets'

export const FAVORITES_SESSION_CAP = 20
export const FAVORITES_CONCURRENCY = 4
export const WRONG_SESSION_CAP = 10

export type RecordLoadMode = 'review' | 'redo'

export interface PracticeStart {
  questions: PracticeQuestion[]
  /** Metadata serialized into the practice record JSON. */
  model?: unknown
  /** Neutral session title; never a raw API `source` or `tname`. */
  title: string
  intro: string
  remote: boolean
  review?: boolean
  answers?: Record<string, PracticeAnswer>
}

export interface TagLeafSelection {
  name: string
  num: number
}

export const PRACTICE_TITLES = {
  paper: '一组历年题',
  smart: '一组行测练习',
  tag: '一组专项练习',
  wrong: '几道错题',
  favorites: '收藏的几道题',
  recordReview: '一次练习回顾',
  recordRedo: '一组练习',
} as const

/** Request context from the same stores used by the rest of the app. */
export function currentPracticeContext(signal?: AbortSignal): ApiContext {
  return {
    baseUrl: useSettingsStore.getState().apiBaseUrl,
    token: useAuthStore.getState().token,
    signal,
  }
}

/**
 * Splits `options` on `#` without breaking HTML attributes or entities such as
 * `<font color="#fc5531">` and `&#39;`.
 */
export function splitOptions(raw: string): string[] {
  if (!raw) return []

  const parts: string[] = []
  let current = ''
  let inTag = false
  let inEntity = false
  let quote: string | null = null

  for (const char of raw) {
    if (inEntity) {
      current += char
      if (char === ';') inEntity = false
      continue
    }

    if (inTag) {
      current += char
      if (quote) {
        if (char === quote) quote = null
      } else if (char === '"' || char === "'") {
        quote = char
      } else if (char === '>') {
        inTag = false
      }
      continue
    }

    if (char === '&') {
      inEntity = true
      current += char
      continue
    }

    if (char === '<') {
      inTag = true
      current += char
      continue
    }

    if (char === '#') {
      parts.push(current)
      current = ''
      continue
    }

    current += char
  }

  parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

export function parseModel(raw: string | null | undefined): unknown {
  if (!raw) return []
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

/** Maps one API question into the internal, answer-label based model. */
export function toPracticeQuestion(question: Question): PracticeQuestion {
  const type = normalizeQuestionType(question.type)
  let options = splitOptions(question.options)

  // A few judge payloads omit options; keep them answerable.
  if (options.length === 0 && type === 'judge') {
    options = ['正确', '错误']
  }

  return {
    id: question.id,
    title: question.title,
    type,
    options,
    correctAnswer: correctLabelsFromRaw(question.correctAnswer, options.length, type),
    analysis: question.analysis,
    ...(question.material ? { material: question.material } : {}),
    ...(question.source ? { source: question.source } : {}),
    ...(question.tag ? { tag: question.tag } : {}),
    raw: question,
  }
}

export function toPracticeQuestions(questions: readonly Question[]): PracticeQuestion[] {
  return questions.map(toPracticeQuestion)
}

function labelsFromIndexes(raw: unknown, optionCount: number): string[] {
  const values: unknown[] = Array.isArray(raw) ? raw : [raw]
  const labels = new Set<string>()

  for (const value of values) {
    if (value === null || value === undefined || value === '') continue

    if (typeof value === 'string' && /^[A-Za-z]$/.test(value.trim())) {
      const label = value.trim().toUpperCase()
      if (label.charCodeAt(0) - 65 < optionCount) labels.add(label)
      continue
    }

    const index = Number(value)
    if (Number.isInteger(index) && index >= 0 && index < optionCount) {
      labels.add(optionLabel(index))
    }
  }

  return [...labels].sort()
}

/** Converts the saved native `userAnswer` shape back into option labels. */
export function labelsFromUserAnswer(
  raw: unknown,
  type: QuestionType,
  optionCount: number,
): string[] {
  if (raw === null || raw === undefined) return []

  if (typeof raw === 'string' && !/^[0-9]+$/.test(raw.trim())) {
    const normalized = raw.trim()

    // Older/alternate payloads store a multiple answer as "0,2" text.
    if (/^[0-9]+(?:\s*[,，;；、]\s*[0-9]+)+$/.test(normalized)) {
      return labelsFromIndexes(
        normalized.split(/\s*[,，;；、]\s*/).map((value) => Number(value)),
        optionCount,
      )
    }

    if (type === 'judge') {
      if (normalized === '对' || normalized === '正确') return ['A']
      if (normalized === '错' || normalized === '错误') return ['B']
    }
    if (/^[A-Za-z,;、，\s]+$/.test(normalized)) {
      const labels = normalized
        .toUpperCase()
        .split(/[,;、，\s]+/)
        .filter(Boolean)
      return labelsFromIndexes(labels, optionCount)
    }
  }

  return labelsFromIndexes(raw, optionCount)
}

function sameSelection(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  return [...left].sort().join(',') === [...right].sort().join(',')
}

/** Rebuilds locked answers for a read-only history review. */
export function reviewAnswersFromQuestions(
  questions: readonly PracticeQuestion[],
  answeredAt = Date.now(),
): Record<string, PracticeAnswer> {
  const answers: Record<string, PracticeAnswer> = {}

  for (const question of questions) {
    const labels = labelsFromUserAnswer(
      question.raw?.userAnswer,
      question.type,
      question.options.length,
    )
    if (labels.length === 0) continue

    answers[String(question.id)] = {
      labels,
      correct: sameSelection(labels, question.correctAnswer),
      answeredAt,
    }
  }

  return answers
}

export async function startPaper(
  source: PaperSource,
  context: ApiContext = currentPracticeContext(),
): Promise<PracticeStart> {
  const questions = toPracticeQuestions(await tk.getPaperQuestions(source.sid, context))

  return {
    questions,
    model: parseModel(source.model),
    title: PRACTICE_TITLES.paper,
    intro: questions.length
      ? `这套历年题一共 ${questions.length} 道，我们一道一道来。`
      : '这套题暂时没有可用的题目，换一套试试。',
    remote: true,
  }
}

export async function startSmartPaper(
  region: SmartPaperRegion,
  difficulty: string | number | null,
  context: ApiContext = currentPracticeContext(),
): Promise<PracticeStart> {
  const reqs = SMART_PAPER_PRESETS[region]
  if (!reqs) throw new DecodeError('没有找到这个地区的组卷预设')

  // The live site sends difficulty as a string ("1"–"5") or null.
  const difficultyParam = difficulty == null ? null : String(difficulty)
  const questions = toPracticeQuestions(await tk.startSmartPaper(reqs, difficultyParam, context))

  return {
    questions,
    model: reqs,
    title: PRACTICE_TITLES.smart,
    intro: `我按「${region}」的分布整理了一组题，先从第一道开始。`,
    remote: true,
  }
}

export async function startTagPaper(
  leafs: TagLeafSelection[],
  difficulty: string | number | null,
  context: ApiContext = currentPracticeContext(),
): Promise<PracticeStart> {
  const difficultyParam = difficulty == null ? null : String(difficulty)
  const set: PracticeSet = await tk.startTagPaper(leafs, difficultyParam, context)
  const questions = toPracticeQuestions(set.resps)

  return {
    questions,
    model: set.tl,
    title: PRACTICE_TITLES.tag,
    intro: questions.length
      ? `我按你选的专项挑了 ${questions.length} 道题，先从第一道开始。`
      : '这个组合暂时没有可用的题目，换一组试试。',
    remote: true,
  }
}

export function sampleIds(ids: readonly number[], limit = WRONG_SESSION_CAP): number[] {
  const shuffled = [...new Set(ids)]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapWith]
    shuffled[swapWith] = current
  }

  return shuffled.slice(0, Math.min(limit, shuffled.length))
}

export async function startWrong(
  name: string,
  indexs: number[],
  context: ApiContext = currentPracticeContext(),
): Promise<PracticeStart> {
  const set = await tk.getWrongQuestions(indexs, name, context)
  const questions = toPracticeQuestions(set.resps)

  return {
    questions,
    model: set.tl,
    title: PRACTICE_TITLES.wrong,
    intro: questions.length
      ? `我从错题里挑了 ${questions.length} 道，慢慢来。`
      : '这组错题暂时没有可用的题目。',
    remote: true,
  }
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const runners = Math.max(1, Math.min(limit, items.length))

  await Promise.all(
    Array.from({ length: runners }, async () => {
      while (next < items.length) {
        const index = next
        next += 1
        results[index] = await worker(items[index], index)
      }
    }),
  )

  return results
}

export async function startFavorites(
  ids: readonly number[],
  context: ApiContext = currentPracticeContext(),
  cap = FAVORITES_SESSION_CAP,
): Promise<PracticeStart> {
  const limited = [...new Set(ids)].slice(0, cap)
  const questions = await mapWithConcurrency(limited, FAVORITES_CONCURRENCY, (id) =>
    tk.getProblemById(id, context),
  )
  const mapped = toPracticeQuestions(questions)

  return {
    questions: mapped,
    model: [],
    title: PRACTICE_TITLES.favorites,
    intro: mapped.length
      ? `我从收藏里取了 ${mapped.length} 道题，先看第一道。`
      : '收藏里暂时没有可以练习的题目。',
    remote: true,
  }
}

export async function loadRecord(
  id: number | string,
  mode: RecordLoadMode,
  context: ApiContext = currentPracticeContext(),
): Promise<PracticeStart> {
  const detail = await tk.getPracticeRecordDetail(id, context)
  const questions = toPracticeQuestions(detail.questions)
  const review = mode === 'review'

  return {
    questions,
    model: detail.model,
    title: review ? PRACTICE_TITLES.recordReview : PRACTICE_TITLES.recordRedo,
    intro: review
      ? '这是上次练习的回顾，选项已经锁定，可以逐题查看解析。'
      : '我把上次这组题重新拿来了，这次重新作答。',
    remote: !review,
    ...(review ? { review: true, answers: reviewAnswersFromQuestions(questions) } : {}),
  }
}

export async function fetchPaperCategories(context: ApiContext = currentPracticeContext()) {
  return tk.listPaperCategories(context)
}

export async function fetchTagTree(context: ApiContext = currentPracticeContext()) {
  return tk.getTagTree(context)
}

export async function fetchWrongGroups(context: ApiContext = currentPracticeContext()) {
  return tk.listWrongQuestionGroups(context)
}

export async function fetchFavoriteIds(context: ApiContext = currentPracticeContext()) {
  return tk.listFavoriteIds(context)
}

export async function fetchPracticeRecords(context: ApiContext = currentPracticeContext()) {
  return tk.listPracticeRecords(1, context)
}

export type { WrongQuestionGroup }
