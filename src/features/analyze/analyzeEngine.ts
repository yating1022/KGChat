import type { AnalyzeWord } from '../../api/types'
import { optionLabel, type AnalyzeMode, type PracticeQuestion } from '../../chat/chatTypes'

export type { AnalyzeMode }

/** A short group keeps one assistant turn per round and reads well in chat. */
export const ANALYZE_ROUND_CAP = 6

export function isAnalyzeMode(value: unknown): value is AnalyzeMode {
  return value === 'wordToDef' || value === 'defToWord'
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function hashSeed(value: string): number {
  let hash = 2_166_136_261
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

/** Fisher-Yates with a seeded LCG so a round looks the same after refresh. */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const result = [...items]
  let state = seed || 1

  const next = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 4_294_967_296
  }

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(next() * (index + 1))
    const current = result[index]
    result[index] = result[swapWith]
    result[swapWith] = current
  }

  return result
}

export function analyzeQuestionId(wordId: number, mode: AnalyzeMode): number {
  return wordId * 10 + (mode === 'wordToDef' ? 1 : 2)
}

export function analyzeQuestionTitle(word: AnalyzeWord, mode: AnalyzeMode): string {
  return mode === 'wordToDef'
    ? `<p>“${escapeHtml(word.idiom)}”的意思是：</p>`
    : `<p>“${escapeHtml(word.definition)}”说的是哪个词？</p>`
}

export function analyzeAnalysisHtml(word: AnalyzeWord): string {
  return [
    `<p>释义：${escapeHtml(word.definition)}</p>`,
    `<p>辨析：${escapeHtml(word.keynote)}</p>`,
    `<p>例句：${escapeHtml(word.meaning)}</p>`,
  ].join('')
}

/**
 * Builds one single-choice round per word.
 *
 * Options are the group's own definitions (`wordToDef`) or idioms
 * (`defToWord`), so every option stays inside the words just learned. Labels
 * are 0-based indexes into the shuffled option list.
 */
export function buildAnalyzeRounds(
  words: readonly AnalyzeWord[],
  mode: AnalyzeMode,
): PracticeQuestion[] {
  const seen = new Set<number>()
  const pool = words
    .filter((word) => {
      if (seen.has(word.id)) return false
      if (!word.idiom.trim() || !word.definition.trim()) return false
      seen.add(word.id)
      return true
    })
    .slice(0, ANALYZE_ROUND_CAP)

  return pool.map((word, index) => {
    const options = pool.map((item) => ({
      id: item.id,
      text: mode === 'wordToDef' ? item.definition : item.idiom,
    }))

    const shuffled = shuffleWithSeed(options, hashSeed(`${mode}:${word.id}:${index}`))
    const correctIndex = shuffled.findIndex((option) => option.id === word.id)

    return {
      id: analyzeQuestionId(word.id, mode),
      title: analyzeQuestionTitle(word, mode),
      type: 'single',
      options: shuffled.map((option) => option.text),
      correctAnswer: [optionLabel(Math.max(0, correctIndex))],
      analysis: analyzeAnalysisHtml(word),
      tag: '',
    }
  })
}
