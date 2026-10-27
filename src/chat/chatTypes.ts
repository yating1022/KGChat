import type {
  AnalyzeWord,
  Question,
  WordDetail,
  WordKind,
  WordSummary,
} from '../api/types'

export type ChatMode = 'chat' | 'practice' | 'shenlun' | 'analyze' | 'word'

export type ChatRole = 'user' | 'assistant'

export type NoticeTone = 'info' | 'warning' | 'error'

export type QuestionType = 'single' | 'multiple' | 'judge'

export type ToolKind =
  | 'practice'
  | 'paper'
  | 'special'
  | 'wrong'
  | 'favorites'
  | 'history'
  | 'shenlun'
  | 'analyze'
  | 'word'
  | 'settings'
  | 'help'

export type ChatActionKind =
  | 'answer'
  | 'command'
  | 'next'
  | 'reveal'
  | 'save'
  | 'retry'
  | 'favorite'
  | 'master'
  | 'open-settings'
  | 'open-tools'

export interface ChatAction {
  label: string
  kind: ChatActionKind
  /** Answer labels for `answer` actions, e.g. `["A"]`. */
  value?: string
  /** Slash command text for `command` actions, e.g. `/next`. */
  command?: string
  disabled?: boolean
}

interface BaseMessage {
  id: string
  role: ChatRole
  createdAt: number
}

export interface TextChatMessage extends BaseMessage {
  kind: 'text'
  content: string
}

export interface NoticeChatMessage extends BaseMessage {
  kind: 'notice'
  tone: NoticeTone
  content: string
}

export interface QuestionChatMessage extends BaseMessage {
  kind: 'question'
  questionId: number
  index: number
  total: number
}

export interface FeedbackChatMessage extends BaseMessage {
  kind: 'feedback'
  questionId: number
  /** Selected option labels, e.g. `A,C`. */
  selected: string
  correct: boolean
}

export interface ActionsChatMessage extends BaseMessage {
  kind: 'actions'
  prompt?: string
  actions: ChatAction[]
}

export interface ToolChatMessage extends BaseMessage {
  kind: 'tool'
  tool: ToolKind
  /** Prefilled text for a tool that accepts one, e.g. `/word 一蹴而就`. */
  query?: string
}

export interface AnalysisChatMessage extends BaseMessage {
  kind: 'analysis'
  questionId: number
  /** Sanitized at render time; never shown before the question is answered. */
  content: string
  /** Optional conversational lead-in; defaults to a practice-style line. */
  lead?: string
}

export interface ShenlunMaterialChatMessage extends BaseMessage {
  kind: 'shenlun-material'
  /** API HTML for one expanded material. Sanitized at render time. */
  content: string
}

export interface ShenlunQuestionChatMessage extends BaseMessage {
  kind: 'shenlun-question'
  questionId: number
  index: number
  total: number
}

export interface ShenlunReportChatMessage extends BaseMessage {
  kind: 'shenlun-report'
  questionId: number
}

export type ChatMessage =
  | TextChatMessage
  | NoticeChatMessage
  | QuestionChatMessage
  | FeedbackChatMessage
  | ActionsChatMessage
  | ToolChatMessage
  | AnalysisChatMessage
  | ShenlunMaterialChatMessage
  | ShenlunQuestionChatMessage
  | ShenlunReportChatMessage

export interface PracticeQuestion {
  id: number
  /** HTML from the API, or plain text for locally supplied questions. Sanitized on render. */
  title: string
  type: QuestionType
  /** Option HTML/text without their `A.` labels, split from `options`. */
  options: string[]
  /** Option labels, never rendered before submission. */
  correctAnswer: string[]
  /** Analysis HTML, only appended after an answer or explicit reveal. */
  analysis: string
  material?: string
  source?: string
  tag?: string
  /** Original API question, retained so record saving can round-trip it. */
  raw?: Question
}

export interface PracticeAnswer {
  labels: string[]
  correct: boolean
  answeredAt: number
}

export type PracticeSaveState = 'idle' | 'saved-local' | 'saving' | 'saved' | 'error'

/** Which completion semantics a practice state follows. */
export type PracticeFlow = 'practice' | 'analyze'

export interface PracticeState {
  questions: PracticeQuestion[]
  index: number
  status: 'active' | 'completed'
  answers: Record<string, PracticeAnswer>
  skipped: Record<string, true>
  revealed: Record<string, true>
  startedAt: number
  completedAt?: number
  saveState: PracticeSaveState
  /** Model metadata for the practice record JSON. */
  model?: unknown
  /** False for read-only or local-only sessions; only remote sessions call `/tk/addRecord`. */
  remote?: boolean
  /** Read-only history review; options stay locked and saving is disabled. */
  review?: boolean
  /** `analyze` swaps record saving for "标记已掌握". */
  flow?: PracticeFlow
  /** `/analyze/addZw?groupId=` target for word-analysis rounds. */
  groupId?: number
}

export type AnalyzeMode = 'wordToDef' | 'defToWord'

export interface AnalyzeState {
  groupId: number
  words: AnalyzeWord[]
  mode: AnalyzeMode
  mastered: boolean
}

export type ShenlunQuestionStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'sync-pending'
  | 'submitting'
  | 'polling'
  | 'report'
  | 'timeout'
  | 'error'

export interface ShenlunQuestionState {
  id: number
  /** Question HTML from the API; sanitized at render time. */
  content: string
  /** Requirement text, usually plain. */
  requirement: string
  /** Plain text sent as `problem` to `correctEssay`. */
  plainContent: string
  answer: string
  /** Saved answer record `sid`, once `/sl/getMySl` returns a match. */
  answerId: string | null
  status: ShenlunQuestionStatus
  /** Parsed `pgResp` report when available. */
  report?: unknown
  error?: string
  /** When polling started, used for the 3-minute cap. */
  pollStartedAt?: number
}

export interface ShenlunState {
  paperId: string | number
  questions: ShenlunQuestionState[]
  index: number
  status: 'active' | 'completed'
}

export interface WordState {
  kind: WordKind
  query: string
  results: WordSummary[]
  /** The word currently shown, if any. */
  current?: WordDetail
  /** High-frequency word ids the user has saved. */
  savedIds: number[]
  /** Whether the high-frequency list has been read at least once. */
  highFrequency: boolean
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  draft: string
  scrollTop: number
  mode: ChatMode
  practice?: PracticeState
  shenlun?: ShenlunState
  analyze?: AnalyzeState
  word?: WordState
  lastError?: string
  /** Imported conversations are the only ones listed in the rail. */
  origin?: 'import'
}

export interface SessionSummary {
  id: string
  title: string
  updatedAt: number
  origin?: 'import'
}

/**
 * A question projection used by the question card. It deliberately omits
 * `correctAnswer` and `analysis` so the render path cannot leak them.
 */
export interface QuestionView {
  id: number
  title: string
  type: QuestionType
  options: string[]
  material?: string
  source?: string
  tag?: string
}

export function toQuestionView(question: PracticeQuestion): QuestionView {
  return {
    id: question.id,
    title: question.title,
    type: question.type,
    options: question.options,
    ...(question.material ? { material: question.material } : {}),
    ...(question.source ? { source: question.source } : {}),
    ...(question.tag ? { tag: question.tag } : {}),
  }
}

export function optionLabel(index: number): string {
  return String.fromCharCode(65 + index)
}

export function optionLabels(options: readonly string[]): string[] {
  return options.map((_, index) => optionLabel(index))
}

/**
 * The live bundle uses `multiple`; older notes and some payloads say `multi`.
 * Both normalize to `multiple`. Anything unrecognized is treated as `single`.
 */
export function normalizeQuestionType(value: unknown): QuestionType {
  if (value === 'multiple' || value === 'multi') return 'multiple'
  if (value === 'judge') return 'judge'
  return 'single'
}

/**
 * Maps a raw API `correctAnswer` to internal option labels.
 *
 * Live semantics (verified against the answerQuestions bundle):
 * - single/multiple: values are 0-based option indexes (`3` -> `D`).
 * - judge: `0` means 正确, any non-zero value means 错误.
 */
export function correctLabelsFromRaw(
  raw: string | number | null | undefined,
  optionCount: number,
  type: QuestionType,
): string[] {
  if (raw === null || raw === undefined || optionCount <= 0) return []

  const tokens = String(raw)
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)

  const labels = new Set<string>()

  for (const token of tokens) {
    if (type === 'judge') {
      const index = token === '0' || token === '对' || token === '正确' ? 0 : 1
      if (index < optionCount) labels.add(optionLabel(index))
      continue
    }

    const index = Number(token)
    if (Number.isInteger(index) && index >= 0 && index < optionCount) {
      labels.add(optionLabel(index))
    }
  }

  return [...labels].sort()
}
