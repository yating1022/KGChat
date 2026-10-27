import { del, get, keys, set } from 'idb-keyval'

import type {
  AnalyzeState,
  ChatAction,
  ChatMessage,
  ChatSession,
  PracticeAnswer,
  PracticeQuestion,
  PracticeState,
  SessionSummary,
  ShenlunQuestionStatus,
  ShenlunState,
  WordState,
} from './chatTypes'

export const SESSION_SCHEMA_VERSION = 1
export const MAX_SESSION_HISTORY = 100
export const SESSION_INDEX_KEY = 'saduck.chat.index'
export const ACTIVE_SESSION_KEY = 'saduck.chat.active'

const SESSION_PREFIX = 'session:'

interface StoredSession {
  schemaVersion: number
  savedAt: number
  session: ChatSession
}

export type SaveSessionResult =
  { ok: true } | { ok: false; reason: 'quota' | 'unavailable'; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isChatAction(value: unknown): value is ChatAction {
  return (
    isRecord(value) &&
    typeof value.label === 'string' &&
    typeof value.kind === 'string' &&
    (value.value === undefined || typeof value.value === 'string') &&
    (value.command === undefined || typeof value.command === 'string')
  )
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || typeof value.createdAt !== 'number') return false
  if (value.role !== 'user' && value.role !== 'assistant') return false

  switch (value.kind) {
    case 'text':
      return typeof value.content === 'string'
    case 'notice':
      return (
        typeof value.content === 'string' &&
        (value.tone === 'info' || value.tone === 'warning' || value.tone === 'error')
      )
    case 'question':
      return (
        typeof value.questionId === 'number' &&
        typeof value.index === 'number' &&
        typeof value.total === 'number'
      )
    case 'feedback':
      return (
        typeof value.questionId === 'number' &&
        typeof value.selected === 'string' &&
        typeof value.correct === 'boolean'
      )
    case 'actions':
      return Array.isArray(value.actions) && value.actions.every(isChatAction)
    case 'tool':
      return (
        typeof value.tool === 'string' &&
        value.tool.length > 0 &&
        (value.query === undefined || typeof value.query === 'string')
      )
    case 'analysis':
      return (
        typeof value.questionId === 'number' &&
        typeof value.content === 'string' &&
        (value.lead === undefined || typeof value.lead === 'string')
      )
    case 'shenlun-material':
      return typeof value.content === 'string'
    case 'shenlun-question':
      return (
        typeof value.questionId === 'number' &&
        typeof value.index === 'number' &&
        typeof value.total === 'number'
      )
    case 'shenlun-report':
      return typeof value.questionId === 'number'
    default:
      return false
  }
}

function isPracticeQuestion(value: unknown): value is PracticeQuestion {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    typeof value.title === 'string' &&
    (value.type === 'single' || value.type === 'multiple' || value.type === 'judge') &&
    isStringArray(value.options) &&
    isStringArray(value.correctAnswer) &&
    typeof value.analysis === 'string'
  )
}

function isPracticeAnswer(value: unknown): value is PracticeAnswer {
  return (
    isRecord(value) &&
    isStringArray(value.labels) &&
    typeof value.correct === 'boolean' &&
    typeof value.answeredAt === 'number'
  )
}

function isPracticeState(value: unknown): value is PracticeState {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.questions) || !value.questions.every(isPracticeQuestion)) return false
  if (typeof value.index !== 'number' || value.index < 0 || value.index >= value.questions.length) {
    return false
  }
  if (value.status !== 'active' && value.status !== 'completed') return false
  if (!isRecord(value.answers)) return false
  if (!Object.values(value.answers).every(isPracticeAnswer)) return false
  if (!isRecord(value.skipped) || !isRecord(value.revealed)) return false
  if (typeof value.startedAt !== 'number') return false
  const saveStates = ['idle', 'saving', 'saved', 'saved-local', 'error']
  if (!saveStates.includes(String(value.saveState))) return false

  return true
}

const SHENLUN_STATUSES: ShenlunQuestionStatus[] = [
  'idle',
  'saving',
  'saved',
  'sync-pending',
  'submitting',
  'polling',
  'report',
  'timeout',
  'error',
]

function isShenlunQuestion(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    typeof value.content === 'string' &&
    typeof value.requirement === 'string' &&
    typeof value.plainContent === 'string' &&
    typeof value.answer === 'string' &&
    (value.answerId === null || typeof value.answerId === 'string') &&
    SHENLUN_STATUSES.includes(value.status as ShenlunQuestionStatus)
  )
}

function isShenlunState(value: unknown): value is ShenlunState {
  if (!isRecord(value)) return false
  if (typeof value.paperId !== 'string' && typeof value.paperId !== 'number') return false
  if (!Array.isArray(value.questions) || !value.questions.every(isShenlunQuestion)) return false
  if (value.questions.length === 0) return false
  if (
    typeof value.index !== 'number' ||
    value.index < 0 ||
    value.index >= value.questions.length
  ) {
    return false
  }
  return value.status === 'active' || value.status === 'completed'
}

function isAnalyzeState(value: unknown): value is AnalyzeState {
  if (!isRecord(value)) return false
  if (typeof value.groupId !== 'number') return false
  if (value.mode !== 'wordToDef' && value.mode !== 'defToWord') return false
  if (typeof value.mastered !== 'boolean') return false
  return (
    Array.isArray(value.words) &&
    value.words.every(
      (word) =>
        isRecord(word) &&
        typeof word.id === 'number' &&
        typeof word.groupId === 'number' &&
        typeof word.idiom === 'string' &&
        typeof word.definition === 'string' &&
        typeof word.keynote === 'string' &&
        typeof word.meaning === 'string',
    )
  )
}

function isWordState(value: unknown): value is WordState {
  if (!isRecord(value)) return false
  if (value.kind !== 'idiom' && value.kind !== 'term') return false
  if (typeof value.query !== 'string') return false
  if (!Array.isArray(value.savedIds) || !value.savedIds.every((id) => typeof id === 'number')) {
    return false
  }
  if (typeof value.highFrequency !== 'boolean') return false
  if (value.current !== undefined && !isRecord(value.current)) return false
  return (
    Array.isArray(value.results) &&
    value.results.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === 'number' &&
        typeof item.value === 'string' &&
        typeof item.hot === 'boolean',
    )
  )
}

export function isChatSession(value: unknown): value is ChatSession {
  if (!isRecord(value)) return false
  if (
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.createdAt !== 'number' ||
    typeof value.updatedAt !== 'number' ||
    !Array.isArray(value.messages) ||
    !value.messages.every(isChatMessage) ||
    typeof value.draft !== 'string' ||
    typeof value.scrollTop !== 'number'
  ) {
    return false
  }

  if (!['chat', 'practice', 'shenlun', 'analyze', 'word'].includes(String(value.mode))) {
    return false
  }

  if (value.practice !== undefined && value.practice !== null && !isPracticeState(value.practice)) {
    return false
  }

  if (value.shenlun !== undefined && value.shenlun !== null && !isShenlunState(value.shenlun)) {
    return false
  }

  if (value.analyze !== undefined && value.analyze !== null && !isAnalyzeState(value.analyze)) {
    return false
  }

  if (value.word !== undefined && value.word !== null && !isWordState(value.word)) {
    return false
  }

  return true
}

function isSessionSummary(value: unknown): value is SessionSummary {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.updatedAt === 'number' &&
    (value.origin === undefined || value.origin === 'import')
  )
}

function sanitizeIndex(items: unknown): SessionSummary[] {
  if (!Array.isArray(items)) return []

  const seen = new Set<string>()
  const result: SessionSummary[] = []

  for (const item of items) {
    if (!isSessionSummary(item) || seen.has(item.id)) continue
    seen.add(item.id)
    result.push(item)
  }

  result.sort((left, right) => right.updatedAt - left.updatedAt)
  return result.slice(0, MAX_SESSION_HISTORY)
}

export function readSessionIndex(): SessionSummary[] {
  if (typeof localStorage === 'undefined') return []

  try {
    const raw = localStorage.getItem(SESSION_INDEX_KEY)
    return raw ? sanitizeIndex(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export function writeSessionIndex(items: readonly SessionSummary[]): void {
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(sanitizeIndex(items)))
  } catch {
    /* The in-memory list remains usable if localStorage is unavailable. */
  }
}

export function readActiveSessionId(): string | null {
  if (typeof localStorage === 'undefined') return null

  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY)
  } catch {
    return null
  }
}

export function writeActiveSessionId(id: string | null): void {
  if (typeof localStorage === 'undefined') return

  try {
    if (id) localStorage.setItem(ACTIVE_SESSION_KEY, id)
    else localStorage.removeItem(ACTIVE_SESSION_KEY)
  } catch {
    /* Non-fatal. */
  }
}

export function buildSessionSummary(session: ChatSession): SessionSummary {
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    ...(session.origin === 'import' ? { origin: 'import' as const } : {}),
  }
}

export function upsertSessionSummary(
  items: readonly SessionSummary[],
  session: ChatSession,
): SessionSummary[] {
  const summary = buildSessionSummary(session)
  const merged = [summary, ...items.filter((item) => item.id !== session.id)]
  merged.sort((left, right) => right.updatedAt - left.updatedAt)
  return merged
}

function sessionStorageKey(id: string): string {
  return `${SESSION_PREFIX}${id}`
}

function removeFromIndex(id: string): void {
  writeSessionIndex(readSessionIndex().filter((item) => item.id !== id))
}

export async function loadSession(id: string): Promise<ChatSession | null> {
  let stored: unknown

  try {
    stored = await get(sessionStorageKey(id))
  } catch {
    return null
  }

  if (
    !isRecord(stored) ||
    stored.schemaVersion !== SESSION_SCHEMA_VERSION ||
    !isChatSession(stored.session)
  ) {
    try {
      await del(sessionStorageKey(id))
    } catch {
      /* Best effort cleanup. */
    }
    removeFromIndex(id)
    return null
  }

  return stored.session
}

export interface LoadedSessions {
  sessions: ChatSession[]
  summaries: SessionSummary[]
  skipped: number
}

/**
 * Loads every session referenced by the local index. Invalid or future-schema
 * sessions are deleted and skipped instead of crashing the app.
 */
export async function loadSessions(): Promise<LoadedSessions> {
  const summaries = readSessionIndex()
  const sessions: ChatSession[] = []
  let skipped = 0

  for (const summary of summaries) {
    const session = await loadSession(summary.id)
    if (session) {
      // Backfill conversations saved before `origin` existed so previously
      // imported chats keep showing up in the rail.
      if (!session.origin && session.mode === 'chat' && session.messages.length > 0) {
        session.origin = 'import'
      }
      sessions.push(session)
    } else {
      skipped += 1
    }
  }

  sessions.sort((left, right) => right.updatedAt - left.updatedAt)
  const cleaned = sanitizeIndex(sessions.map(buildSessionSummary))
  writeSessionIndex(cleaned)

  return { sessions, summaries: cleaned, skipped }
}

export async function saveSession(session: ChatSession): Promise<SaveSessionResult> {
  const stored: StoredSession = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    savedAt: Date.now(),
    session,
  }

  try {
    await set(sessionStorageKey(session.id), stored)
  } catch {
    return {
      ok: false,
      reason: 'unavailable',
      message: '本机聊天存储暂时不可用，当前对话仍保留在内存中。',
    }
  }

  const all = upsertSessionSummary(readSessionIndex(), session)
  const kept = all.slice(0, MAX_SESSION_HISTORY)
  const removed = all.slice(MAX_SESSION_HISTORY)
  writeSessionIndex(kept)

  for (const summary of removed) {
    try {
      await del(sessionStorageKey(summary.id))
    } catch {
      /* Best effort pruning. */
    }
  }

  return { ok: true }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    await del(sessionStorageKey(id))
  } catch {
    /* The index cleanup below still runs. */
  }

  removeFromIndex(id)
  if (readActiveSessionId() === id) {
    writeActiveSessionId(null)
  }
}

export async function clearSessions(): Promise<void> {
  try {
    const allKeys = await keys()
    const sessionKeys = allKeys.filter(
      (key): key is string => typeof key === 'string' && key.startsWith(SESSION_PREFIX),
    )
    await Promise.all(sessionKeys.map((key) => del(key)))
  } catch {
    /* Nothing else to clear if IndexedDB is unavailable. */
  }

  writeSessionIndex([])
  writeActiveSessionId(null)
}
