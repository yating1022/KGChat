import type { ApiContext } from '../../api/client'
import * as sl from '../../api/endpoints/sl'
import { DecodeError } from '../../api/errors'
import type { ShenlunRecord } from '../../api/types'
import { useAuthStore } from '../../auth/authStore'
import { useSettingsStore } from '../../settings/settingsStore'

export const SHENLUN_MIN_ANSWER_LENGTH = 100
export const SHENLUN_POLL_INTERVAL_MS = 5_000
export const SHENLUN_POLL_TIMEOUT_MS = 3 * 60 * 1_000
export const SHENLUN_SESSION_TITLE = '聊聊申论'
export const SHENLUN_SYNC_NOTICE = '记录同步中'

export function currentShenlunContext(signal?: AbortSignal): ApiContext {
  return {
    baseUrl: useSettingsStore.getState().apiBaseUrl,
    token: useAuthStore.getState().token,
    signal,
  }
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

const NAMED_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&hellip;': '…',
  '&mdash;': '—',
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&[a-z][a-z0-9]*;/gi, (entity) => NAMED_ENTITIES[entity.toLowerCase()] ?? ' ')
}

/** Converts API question HTML into the plain text `correctEssay` expects. */
export function stripHtml(value: string | null | undefined): string {
  if (!value) return ''

  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Counts user-perceived characters so emoji/CJK are not double counted. */
export function shenlunAnswerLength(value: string): number {
  return Array.from(value.trim()).length
}

export function remainingShenlunCharacters(value: string): number {
  return Math.max(0, SHENLUN_MIN_ANSWER_LENGTH - shenlunAnswerLength(value))
}

export function isShenlunAnswerLongEnough(value: string): boolean {
  return shenlunAnswerLength(value) >= SHENLUN_MIN_ANSWER_LENGTH
}

/* ------------------------------------------------------------------ */
/* Paper loading                                                       */
/* ------------------------------------------------------------------ */

export interface ShenlunQuestionDraft {
  id: number
  content: string
  requirement: string
  plainContent: string
}

export interface ShenlunStart {
  paperId: string | number
  materials: string[]
  questions: ShenlunQuestionDraft[]
  intro: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** `expandedMaterials` is documented as HTML strings; tolerate wrapper objects. */
export function toShenlunMaterials(raw: readonly unknown[]): string[] {
  const materials: string[] = []

  for (const item of raw) {
    if (typeof item === 'string') {
      if (item.trim()) materials.push(item)
      continue
    }

    if (!isRecord(item)) continue

    for (const key of ['content', 'html', 'text', 'material']) {
      const value = item[key]
      if (typeof value === 'string' && value.trim()) {
        materials.push(value)
        break
      }
    }
  }

  return materials
}

export async function loadShenlunPaper(
  paperId: string | number,
  context: ApiContext = currentShenlunContext(),
): Promise<ShenlunStart> {
  const paper = await sl.getShenlunPaper(paperId, context)

  const questions: ShenlunQuestionDraft[] = paper.questions.map((question) => ({
    id: question.id,
    content: question.content,
    requirement: question.require,
    plainContent: stripHtml(question.content),
  }))

  if (questions.length === 0) {
    throw new DecodeError('这份材料暂时没有可作答的题目')
  }

  return {
    paperId,
    materials: toShenlunMaterials(paper.expandedMaterials),
    questions,
    intro: `我找到一份申论材料，一共 ${questions.length} 道题。读完材料后直接在下方写完整作答，写满 ${SHENLUN_MIN_ANSWER_LENGTH} 字就可以保存并送去批改。`,
  }
}

export async function listShenlunPapers(context: ApiContext = currentShenlunContext()) {
  return sl.listShenlunPapers(context)
}

export async function listShenlunRecords(context: ApiContext = currentShenlunContext()) {
  return sl.listMyShenlunRecords(context)
}

export async function removeShenlunRecord(
  sid: string | number,
  context: ApiContext = currentShenlunContext(),
): Promise<void> {
  await sl.deleteShenlunRecord(sid, context)
}

/* ------------------------------------------------------------------ */
/* Answer record matching                                              */
/* ------------------------------------------------------------------ */

const MATCH_PUNCTUATION = /[\s，。、“”‘’（）()【】\]：:；;！!？?—\-·…,.]/g

export function normalizeShenlunMatchText(value: string | null | undefined): string {
  return stripHtml(value).replace(MATCH_PUNCTUATION, '')
}

function recordTimestamp(record: ShenlunRecord): number {
  // `utime` is normalized to '' when absent, so `??` would hide `ctime`.
  const raw = record.utime || record.ctime
  if (!raw) return 0
  const parsed = Date.parse(raw.replace(/-/g, '/'))
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Finds the saved record for a saved answer.
 *
 * `correctEssay` needs the record's `sid`, and the API only exposes it through
 * `/sl/getMySl`. Match on paper id (`tid`) plus the question text (`wt`) and
 * prefer the newest record.
 */
export function findShenlunRecord(
  records: readonly ShenlunRecord[],
  paperId: string | number,
  questionText: string | null | undefined,
): ShenlunRecord | null {
  const target = normalizeShenlunMatchText(questionText)
  if (!target) return null

  const tid = String(paperId)
  const matches = records.filter((record) => {
    if (String(record.tid) !== tid) return false
    const wt = normalizeShenlunMatchText(record.wt)
    if (!wt) return false
    return wt === target || wt.includes(target) || target.includes(wt)
  })

  if (matches.length === 0) return null

  // When a paper contains overlapping question stems (e.g. "谈谈 A" and
  // "谈谈 A 和 B"), a substring match alone could submit the correction for
  // the wrong record. Prefer an exact normalized match, then the newest
  // containment match when the server truncated the stored stem.
  const exactMatches = matches.filter((record) => normalizeShenlunMatchText(record.wt) === target)
  const pool = exactMatches.length > 0 ? exactMatches : matches

  return [...pool].sort((left, right) => recordTimestamp(right) - recordTimestamp(left))[0]
}

export function shenlunRecordSid(record: ShenlunRecord): string {
  return String(record.sid)
}

/** Keeps numeric ids numeric so the correction body matches the live payload. */
export function numericShenlunId(value: string | number): string | number {
  if (typeof value === 'number') return value
  const trimmed = value.trim()
  return /^\d+$/.test(trimmed) ? Number(trimmed) : value
}

/* ------------------------------------------------------------------ */
/* Save -> resolve -> submit -> report                                 */
/* ------------------------------------------------------------------ */

export interface ShenlunAnswerInput {
  paperId: string | number
  question: Pick<ShenlunQuestionDraft, 'id' | 'content' | 'plainContent'>
  answer: string
  context: ApiContext
}

export async function saveShenlunAnswer(input: ShenlunAnswerInput): Promise<void> {
  const answer = input.answer.trim()
  if (!answer) throw new DecodeError('还没有写入作答内容')

  await sl.saveShenlunAnswer(
    {
      paperId: input.paperId,
      problemId: input.question.id,
      answer,
    },
    input.context,
  )
}

export async function resolveShenlunRecord(
  input: ShenlunAnswerInput,
): Promise<ShenlunRecord | null> {
  const records = await sl.listMyShenlunRecords(input.context)
  return findShenlunRecord(
    records,
    input.paperId,
    input.question.plainContent || input.question.content,
  )
}

export async function saveAndResolveShenlun(
  input: ShenlunAnswerInput,
): Promise<ShenlunRecord | null> {
  await saveShenlunAnswer(input)
  return resolveShenlunRecord(input)
}

export async function submitShenlunCorrection(
  input: ShenlunAnswerInput & { sid: string | number },
): Promise<void> {
  const answer = input.answer.trim()

  await sl.submitShenlunCorrection(
    {
      testId: numericShenlunId(input.paperId),
      userAnswerId: numericShenlunId(input.sid),
      problem: input.question.plainContent || stripHtml(input.question.content),
      answer,
    },
    input.context,
  )
}

export async function loadShenlunReport(
  sid: string | number,
  context: ApiContext = currentShenlunContext(),
): Promise<unknown | null> {
  return sl.getShenlunReport(sid, context)
}

export function shenlunPollingExpired(startedAt: number | undefined, now = Date.now()): boolean {
  if (!startedAt) return false
  return now - startedAt >= SHENLUN_POLL_TIMEOUT_MS
}

/* ------------------------------------------------------------------ */
/* Report rendering                                                    */
/* ------------------------------------------------------------------ */

export interface ShenlunReportInfoLine {
  label: string
  value: string
}

export interface ShenlunReportSection {
  title: string
  body?: string
  items?: string[]
  tone?: 'neutral' | 'good' | 'bad'
}

export interface ShenlunReportView {
  headline: string | null
  info: ShenlunReportInfoLine[]
  subScores: Array<{ itemName: string; itemScore: string; deductReason: string }>
  advantages: string[]
  errors: Array<{ errorDesc: string; deductScore: string }>
  suggestions: string[]
  sections: ShenlunReportSection[]
  raw: unknown
}

const FIELD_LABELS: Record<string, string> = {
  questionType: '题型',
  answerWordCount: '作答字数',
  wordCountCheck: '字数检查',
  totalScore: '总分',
  actualScore: '实际得分',
  level: '等级',
  scoreRate: '得分率',
  itemName: '评分项',
  itemScore: '得分',
  deductReason: '扣分原因',
  errorDesc: '问题',
  deductScore: '扣分',
  summary: '总评',
  comment: '点评',
  suggestion: '建议',
  problem: '问题',
  answer: '作答',
}

function labelFor(key: string): string {
  return FIELD_LABELS[key] ?? key
}

function scalarText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? '是' : '否'
  return null
}

function pickScalar(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const text = scalarText(source[key])
    if (text) return text
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text.startsWith('{') && !text.startsWith('[')) return null
    try {
      const parsed: unknown = JSON.parse(text)
      return isRecord(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  const record = asRecord(value)
  if (record && Array.isArray(record.list)) return record.list
  return []
}

function parseReportRoot(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null
  const record = asRecord(raw)
  if (record) return record
  if (typeof raw === 'string' && raw.trim()) return { summary: raw.trim() }
  if (Array.isArray(raw)) return { list: raw }
  const scalar = scalarText(raw)
  return scalar ? { summary: scalar } : null
}

function buildSubScores(root: Record<string, unknown>) {
  return asArray(root.subScoreList)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((item) => ({
      itemName: scalarText(item.itemName) ?? '评分项',
      itemScore: scalarText(item.itemScore) ?? '—',
      deductReason: scalarText(item.deductReason) ?? '',
    }))
}

function buildErrors(root: Record<string, unknown>) {
  return asArray(root.errorList)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null)
    .map((item) => ({
      errorDesc: scalarText(item.errorDesc) ?? '',
      deductScore: scalarText(item.deductScore) ?? '',
    }))
    .filter((item) => item.errorDesc || item.deductScore)
}

function stringItems(value: unknown): string[] {
  return asArray(value)
    .map((item) => scalarText(item) ?? scalarText(asRecord(item)?.text))
    .filter((item): item is string => Boolean(item))
}

function genericSections(root: Record<string, unknown>, skip: ReadonlySet<string>) {
  const sections: ShenlunReportSection[] = []

  for (const [key, value] of Object.entries(root)) {
    if (skip.has(key) || value === null || value === undefined) continue

    const title = labelFor(key)
    const scalar = scalarText(value)
    if (scalar) {
      sections.push({ title, body: scalar })
      continue
    }

    if (Array.isArray(value)) {
      const items = stringItems(value)
      if (items.length > 0) {
        sections.push({ title, items })
        continue
      }

      for (const [index, entry] of value.entries()) {
        const entryRecord = asRecord(entry)
        if (!entryRecord) continue
        const lines = Object.entries(entryRecord)
          .map(([entryKey, entryValue]) => {
            const text = scalarText(entryValue)
            return text ? `${labelFor(entryKey)}：${text}` : ''
          })
          .filter(Boolean)
        if (lines.length > 0) {
          sections.push({ title: `${title} ${index + 1}`, items: lines })
        }
      }
      continue
    }

    if (isRecord(value)) {
      for (const [childKey, childValue] of Object.entries(value)) {
        const childScalar = scalarText(childValue)
        if (childScalar) {
          sections.push({ title: `${title} · ${labelFor(childKey)}`, body: childScalar })
          continue
        }
        const childItems = stringItems(childValue)
        if (childItems.length > 0) {
          sections.push({ title: `${title} · ${labelFor(childKey)}`, items: childItems })
        }
      }
    }
  }

  return sections.slice(0, 16)
}

/** Turns the live `pgResp` JSON into a readable, chat-sized report. */
export function buildShenlunReport(raw: unknown): ShenlunReportView {
  const view: ShenlunReportView = {
    headline: null,
    info: [],
    subScores: [],
    advantages: [],
    errors: [],
    suggestions: [],
    sections: [],
    raw,
  }

  let root = parseReportRoot(raw)
  if (!root) return view

  // A report can arrive double-encoded: `message` JSON containing JSON text.
  if (Object.keys(root).length === 1 && typeof root.report === 'string') {
    const nested = parseReportRoot(root.report)
    if (nested) root = nested
  }

  const finalScore = asRecord(root.finalScore)
  const baseInfo = asRecord(root.baseInfo)

  if (finalScore) {
    const actual = pickScalar(finalScore, ['actualScore'])
    const total = baseInfo ? pickScalar(baseInfo, ['totalScore']) : null
    const level = pickScalar(finalScore, ['level'])
    const rate = pickScalar(finalScore, ['scoreRate'])

    const pieces: string[] = []
    if (actual) pieces.push(total ? `实际得分 ${actual} / ${total}` : `实际得分 ${actual}`)
    if (level) pieces.push(`等级 ${level}`)
    if (rate) pieces.push(`得分率 ${rate}`)
    if (pieces.length > 0) view.headline = pieces.join(' · ')
  }

  if (baseInfo) {
    for (const key of ['questionType', 'answerWordCount', 'wordCountCheck', 'totalScore']) {
      const value = pickScalar(baseInfo, [key])
      if (value) view.info.push({ label: labelFor(key), value })
    }
  }

  view.subScores = buildSubScores(root)
  view.advantages = stringItems(root.advantageList)
  view.errors = buildErrors(root)
  view.suggestions = stringItems(root.suggestList)

  const known = new Set([
    'baseInfo',
    'finalScore',
    'subScoreList',
    'advantageList',
    'errorList',
    'suggestList',
  ])

  view.sections = genericSections(root, known)

  return view
}

export function hasShenlunReportContent(report: ShenlunReportView): boolean {
  return Boolean(
    report.headline ||
    report.info.length > 0 ||
    report.subScores.length > 0 ||
    report.advantages.length > 0 ||
    report.errors.length > 0 ||
    report.suggestions.length > 0 ||
    report.sections.length > 0,
  )
}
