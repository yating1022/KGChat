import { optionLabel, type PracticeQuestion } from './chatTypes'

export const COMMAND_NAMES = [
  'help',
  'new',
  'skin',
  'settings',
  'practice',
  'paper',
  'special',
  'wrong',
  'favorites',
  'history',
  'progress',
  'save',
  'skip',
  'reveal',
  'next',
  'shenlun',
  'analyze',
  'word',
] as const

export type CommandName = (typeof COMMAND_NAMES)[number]

export interface SlashCommand {
  type: 'slash'
  name: CommandName
  args: string[]
  raw: string
}

export interface UnknownSlashCommand {
  type: 'unknown'
  name: string
  args: string[]
  raw: string
}

export type ParsedSlashCommand = SlashCommand | UnknownSlashCommand

export type StudyIntent =
  'practice' | 'paper' | 'special' | 'wrong' | 'favorites' | 'history' | 'vocabulary' | 'shenlun'

function isCommandName(value: string): value is CommandName {
  return (COMMAND_NAMES as readonly string[]).includes(value)
}

/**
 * Parses a composer value that starts with `/`. Returns null when the input is
 * ordinary conversation or an answer.
 */
export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const raw = input.trim()
  if (!raw.startsWith('/')) return null

  const body = raw.slice(1).trim()
  if (!body) {
    return { type: 'unknown', name: '', args: [], raw }
  }

  const [head, ...args] = body.split(/\s+/)
  const name = head.toLowerCase()

  if (isCommandName(name)) {
    return { type: 'slash', name, args, raw }
  }

  return { type: 'unknown', name, args, raw }
}

function toHalfWidth(value: string): string {
  return value.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0),
  )
}

function cleanToken(value: string): string {
  return value
    .trim()
    .replace(/^[（(【[]+/, '')
    .replace(/[.。:：、)）】\]]+$/, '')
}

function uniqueOrdered(labels: readonly string[], total: number): string[] {
  const valid = new Set(Array.from({ length: total }, (_, index) => optionLabel(index)))
  const seen = new Set<string>()
  const result: string[] = []

  for (const label of labels) {
    const normalized = label.toUpperCase()
    if (!valid.has(normalized) || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result.sort()
}

function parseJudgeAnswer(value: string, question: PracticeQuestion): string[] | null {
  const compact = toHalfWidth(value)
    .replace(/[\s,，、;；/|]+/g, '')
    .toUpperCase()

  const exactOption = question.options.findIndex((option) => {
    const text = option.trim()
    return text === value.trim() || toHalfWidth(text).toUpperCase() === compact
  })
  if (exactOption >= 0) return [optionLabel(exactOption)]

  if (['对', '正确', '√', '✓', '1', 'A'].includes(compact)) return ['A']
  if (['错', '错误', '×', 'X', '2', 'B'].includes(compact)) return ['B']

  return null
}

function parseChoiceAnswer(value: string, question: PracticeQuestion): string[] | null {
  const normalized = toHalfWidth(value).trim()
  if (!normalized) return null

  const exact = question.options.findIndex(
    (option) => option.trim() === normalized || toHalfWidth(option.trim()) === normalized,
  )
  if (exact >= 0) return uniqueOrdered([optionLabel(exact)], question.options.length)

  const tokens = normalized
    .replace(/[，、；;|/]+/g, ',')
    .replace(/\s+/g, ',')
    .split(',')
    .map(cleanToken)
    .filter(Boolean)

  const labels: string[] = []

  for (const token of tokens) {
    const upperToken = token.toUpperCase()

    if (/^[A-H]+$/.test(upperToken)) {
      labels.push(...upperToken.split(''))
      continue
    }

    if (/^[1-8]$/.test(token)) {
      labels.push(optionLabel(Number(token) - 1))
      continue
    }

    const optionIndex = question.options.findIndex(
      (option) => toHalfWidth(option.trim()).toUpperCase() === upperToken,
    )
    if (optionIndex >= 0) labels.push(optionLabel(optionIndex))
  }

  const result = uniqueOrdered(labels, question.options.length)
  if (result.length === 0) return null

  if (question.type === 'single' && result.length !== 1) return null
  return result
}
/**
 * Normalizes a typed or clicked answer into option labels (`A`, `C`, ...).
 * Returns null when the text is not a usable answer for this question.
 */
export function parseAnswerInput(input: string, question: PracticeQuestion): string[] | null {
  if (!input.trim()) return null

  if (question.type === 'judge') {
    return parseJudgeAnswer(input, question)
  }

  return parseChoiceAnswer(input, question)
}

/** Normalizes clicked option labels coming from the multi-select card. */
export function normalizeSelectedLabels(
  labels: readonly string[],
  question: PracticeQuestion,
): string[] {
  const result = uniqueOrdered(labels, question.options.length)
  if (question.type === 'single' && result.length > 1) return result.slice(0, 1)
  return result
}

/** Small keyword table for neutral study intents typed without a slash. */
export function parseStudyIntent(input: string): StudyIntent | null {
  const value = input.trim()
  if (!value) return null

  if (/错题|做错的题|错题本/.test(value)) return 'wrong'
  if (/收藏/.test(value)) return 'favorites'
  if (/练习记录|历史记录|做过的练习/.test(value)) return 'history'
  if (/专项|知识点/.test(value)) return 'special'
  if (/历年题|真题|试卷/.test(value)) return 'paper'
  if (/成语|词语|高频词|生词/.test(value)) return 'vocabulary'
  if (/申论|大作文|文章写作/.test(value)) return 'shenlun'
  if (/找一组题|来一组|练一练|练练|做题|刷题|练习/.test(value)) return 'practice'

  return null
}
