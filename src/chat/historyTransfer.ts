import { createId } from '../lib/ids'
import { MAX_SESSION_HISTORY, isChatSession, loadSessions, saveSession } from './sessionRepository'
import type { ChatMessage, ChatSession } from './chatTypes'

/**
 * Local chat-history export/import.
 *
 * Backups contain conversations only. Tokens, passwords, and authorization
 * values are stripped on export and again on import, so a hand-edited or
 * malicious JSON file cannot introduce credentials into local storage.
 *
 * The importer also accepts the conversation exports produced by the
 * `gemini-voyager.chat.v1` format (a single conversation object, an array of
 * them, or `{ conversations: [...] }`), so a previously saved chat can be
 * restored without hand-editing.
 */

export const HISTORY_EXPORT_APP = 'ai-chat-study'
export const HISTORY_EXPORT_VERSION = 1

const OFFICIAL_CHAT_FORMAT = 'gemini-voyager.chat.v1'

const SENSITIVE_KEYS = new Set([
  'token',
  'password',
  'passwd',
  'authorization',
  'refreshtoken',
  'refresh_token',
  'accesstoken',
  'access_token',
])

export interface HistoryExport {
  app: typeof HISTORY_EXPORT_APP
  schemaVersion: typeof HISTORY_EXPORT_VERSION
  exportedAt: string
  sessions: ChatSession[]
}

export interface HistoryImportResult {
  imported: number
  skipped: number
}

export interface HistoryImportOptions {
  /** Optional title override applied to the imported conversation(s). */
  title?: string
}

export const MAX_IMPORT_TITLE_LENGTH = 60

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Recursively copies a value while dropping credential-shaped keys. */
export function stripSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveFields)
  if (!isRecord(value)) return value

  const clean: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue
    clean[key] = stripSensitiveFields(item)
  }
  return clean
}

/** Reads every valid local session and returns a credential-free JSON string. */
export async function exportHistoryJson(): Promise<string> {
  const { sessions } = await loadSessions()
  const clean = sessions.map((session) => stripSensitiveFields(session) as ChatSession)

  const payload: HistoryExport = {
    app: HISTORY_EXPORT_APP,
    schemaVersion: HISTORY_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sessions: clean,
  }

  return JSON.stringify(payload, null, 2)
}

/** Downloads the same backup file the privacy panel produces. */
export async function downloadHistoryBackup(): Promise<void> {
  const json = await exportHistoryJson()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `chat-history-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

function textMessage(role: 'user' | 'assistant', content: string, createdAt: number): ChatMessage {
  return { id: createId('msg'), role, kind: 'text', content, createdAt }
}

/** Converts one `gemini-voyager.chat.v1` export into an importable session. */
export function sessionFromOfficialExport(value: unknown): ChatSession | null {
  if (!isRecord(value) || value.format !== OFFICIAL_CHAT_FORMAT) return null
  if (!Array.isArray(value.items)) return null

  const title =
    typeof value.title === 'string' && value.title.trim() ? value.title.trim() : '导入的对话'

  const messages: ChatMessage[] = []
  const pairCount = Math.max(value.items.length, 1)
  const startedAt = Date.now() - pairCount * 6 * 60 * 1000 - 30 * 60 * 1000

  value.items.forEach((item, index) => {
    if (!isRecord(item)) return
    const at = startedAt + index * 6 * 60 * 1000
    if (typeof item.user === 'string' && item.user.trim()) {
      messages.push(textMessage('user', item.user, at))
    }
    if (typeof item.assistant === 'string' && item.assistant.trim()) {
      messages.push(textMessage('assistant', item.assistant, at + 60 * 1000))
    }
  })

  if (messages.length === 0) return null

  const createdAt = messages[0].createdAt
  const updatedAt = messages[messages.length - 1].createdAt

  return {
    id: createId('session'),
    title,
    createdAt,
    updatedAt,
    messages,
    draft: '',
    scrollTop: 0,
    mode: 'chat',
  }
}

function readSessionList(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed
  if (!isRecord(parsed)) return []

  if (parsed.format === OFFICIAL_CHAT_FORMAT) return [parsed]
  if (Array.isArray(parsed.sessions)) return parsed.sessions
  if (Array.isArray(parsed.conversations)) return parsed.conversations
  if (Array.isArray(parsed.chats)) return parsed.chats
  return []
}

/**
 * Validates and stores a backup. Invalid entries are skipped; valid sessions
 * are capped at the same history limit as normal persistence.
 */
export function normalizeImportTitle(title: string | undefined): string | null {
  if (typeof title !== 'string') return null
  const trimmed = title.trim().slice(0, MAX_IMPORT_TITLE_LENGTH).trim()
  return trimmed ? trimmed : null
}

export async function importHistoryJson(
  raw: string,
  options: HistoryImportOptions = {},
): Promise<HistoryImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error('这个文件不是有效的 JSON 备份。')
  }

  const items = readSessionList(parsed)
  if (items.length === 0) {
    throw new Error('备份文件里没有可导入的对话。')
  }

  const seen = new Set<string>()
  const prepared: ChatSession[] = []
  let skipped = 0

  for (const item of items) {
    if (prepared.length >= MAX_SESSION_HISTORY) {
      skipped += 1
      continue
    }

    const clean = stripSensitiveFields(item)
    const session = isChatSession(clean) ? clean : sessionFromOfficialExport(clean)

    if (!session || seen.has(session.id)) {
      skipped += 1
      continue
    }

    seen.add(session.id)
    prepared.push(session)
  }

  // A user-supplied title keeps multiple backups distinguishable in the rail.
  const customTitle = normalizeImportTitle(options.title)
  if (customTitle) {
    prepared.forEach((session, index) => {
      session.title = prepared.length > 1 ? `${customTitle} ${index + 1}` : customTitle
    })
  }

  // Only imported conversations surface in the rail.
  for (const session of prepared) {
    session.origin = 'import'
  }

  let imported = 0
  for (const session of prepared) {
    const result = await saveSession(session)
    if (result.ok) imported += 1
    else skipped += 1
  }

  return { imported, skipped }
}
