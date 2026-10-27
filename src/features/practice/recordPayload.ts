import type { PracticeRecordPayload } from '../../api/types'
import type { PracticeAnswer, PracticeQuestion, QuestionType } from '../../chat/chatTypes'

export interface RecordStats {
  total: number
  answered: number
  correct: number
  wrong: number
  unanswered: number
}

export interface BuildRecordInput {
  title: string
  questions: PracticeQuestion[]
  answers: Record<string, PracticeAnswer>
  timeTaken: number
  model?: unknown
  startedAt?: number
}

export interface BuiltRecord {
  payload: PracticeRecordPayload
  stats: RecordStats
  /** True when answered / total > 50%, mirroring the live site. */
  canSave: boolean
}

function labelIndexes(labels: readonly string[]): number[] {
  const indexes = new Set<number>()

  for (const label of labels) {
    const upper = label.trim().toUpperCase()
    if (upper.length !== 1) continue
    const index = upper.charCodeAt(0) - 65
    if (index >= 0 && index <= 25) indexes.add(index)
  }

  return [...indexes].sort((left, right) => left - right)
}

/**
 * Writes the answer back in the API's native shape:
 * - single/judge: a 0-based option index number
 * - multiple: an array of 0-based option indexes
 */
export function nativeUserAnswer(
  labels: readonly string[],
  type: QuestionType,
): number | number[] | null {
  const indexes = labelIndexes(labels)
  if (indexes.length === 0) return null
  if (type === 'multiple') return indexes
  return indexes[0]
}

function fallbackQuestion(question: PracticeQuestion): Record<string, unknown> {
  return {
    id: question.id,
    title: question.title,
    type: question.type,
    globalAccuracy: 0,
    correctAnswer: labelIndexes(question.correctAnswer).join(','),
    options: question.options.join('#'),
    analysis: question.analysis,
    source: question.source ?? '',
    tag: question.tag ?? '',
    material: question.material ?? '',
    userAnswer: null,
    memorize: false,
  }
}

function timeSpentByQuestion(
  questions: readonly PracticeQuestion[],
  answers: Record<string, PracticeAnswer>,
  startedAt: number | undefined,
): Record<string, number> {
  const result: Record<string, number> = {}
  let previous = startedAt

  for (const question of questions) {
    const answer = answers[String(question.id)]
    if (!answer) continue

    if (previous === undefined) {
      previous = answer.answeredAt
    }

    const seconds = Math.max(0, Math.round((answer.answeredAt - previous) / 1000))
    result[String(question.id)] = seconds
    previous = answer.answeredAt
  }

  return result
}

/**
 * Builds the exact `/tk/addRecord` payload used by the live bundle:
 * `tag -> questionId[]` maps, flat `tkWrongAnswerIds` arrays, and each question
 * carrying `userAnswer` plus `timeSpent` inside the serialized `json` string.
 */
export function buildRecordPayload(input: BuildRecordInput): BuiltRecord {
  const stats: RecordStats = {
    total: input.questions.length,
    answered: 0,
    correct: 0,
    wrong: 0,
    unanswered: 0,
  }

  const correctByTag: Record<string, number[]> = {}
  const wrongByTag: Record<string, number[]> = {}
  const correctIds: number[] = []
  const wrongIds: number[] = []
  const spent = timeSpentByQuestion(input.questions, input.answers, input.startedAt)
  const serialized: Array<Record<string, unknown>> = []

  for (const question of input.questions) {
    const answer = input.answers[String(question.id)]
    const base: Record<string, unknown> = question.raw
      ? { ...question.raw }
      : fallbackQuestion(question)

    base.userAnswer = answer ? nativeUserAnswer(answer.labels, question.type) : null
    base.timeSpent = spent[String(question.id)] ?? 0
    serialized.push(base)

    if (!answer) continue

    stats.answered += 1
    if (answer.correct) stats.correct += 1
    else stats.wrong += 1

    const flatBucket = answer.correct ? correctIds : wrongIds
    flatBucket.push(question.id)

    const tag = question.tag?.trim()
    if (!tag) continue

    const tagged = answer.correct ? correctByTag : wrongByTag
    const ids = tagged[tag] ?? []
    ids.push(question.id)
    tagged[tag] = ids
  }

  stats.unanswered = Math.max(0, stats.total - stats.answered)

  const payload: PracticeRecordPayload = {
    tname: input.title,
    total: stats.total,
    timeTaken: Math.max(0, Math.round(input.timeTaken)),
    correct: stats.correct,
    wrong: stats.wrong,
    unanswered: stats.unanswered,
    json: JSON.stringify({
      model: input.model ?? [],
      questions: serialized,
    }),
    correctIds: JSON.stringify(correctByTag),
    errorIds: JSON.stringify(wrongByTag),
    tkWrongAnswerIds: {
      correctIds: correctIds.length > 0 ? correctIds : null,
      errorIds: wrongIds.length > 0 ? wrongIds : null,
    },
  }

  return {
    payload,
    stats,
    canSave: stats.total > 0 && stats.answered * 2 > stats.total,
  }
}
