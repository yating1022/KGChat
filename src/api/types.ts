import { z } from 'zod'

import { DecodeError } from './errors'

/** Structural contract so every Zod schema can be validated in one place. */
interface SafeParser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown }
}

/**
 * Parses a trust-boundary payload and converts schema failures into the typed
 * decode error the UI already knows how to present conversationally.
 */
export function parseWith<T>(schema: SafeParser<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new DecodeError(`${label}的数据格式不正确`)
  }
  return result.data
}

/** Data returned alongside a business code that the caller may need to inspect. */
export interface DataWithCode<T> {
  data: T
  code: number
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const authProfileSchema = z.object({
  email: z.string(),
  vipType: z
    .union([z.number(), z.string()])
    .nullish()
    .transform((value) => Number(value ?? 0)),
  vipStartTime: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  vipEndTime: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
})

export const loginResultSchema = authProfileSchema.extend({
  token: z.string(),
})

export const verifyResultSchema = authProfileSchema.extend({
  token: z.string().optional(),
})

export type AuthProfile = z.infer<typeof authProfileSchema>
export type LoginResult = z.infer<typeof loginResultSchema>
export type VerifyResult = z.infer<typeof verifyResultSchema>

/* ------------------------------------------------------------------ */
/* Question bank                                                       */
/* ------------------------------------------------------------------ */

export const paperSourceSchema = z.object({
  sid: z.coerce.number(),
  source: z.string(),
  type: z.coerce
    .number()
    .nullish()
    .transform((value) => value ?? 0),
  difficulty: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  model: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  fraction: z.coerce
    .number()
    .nullish()
    .transform((value) => value ?? 0),
})

export const paperCategorySchema = z.object({
  id: z.coerce.number(),
  title: z.string(),
  tkSources: z
    .array(paperSourceSchema)
    .nullish()
    .transform((value) => value ?? []),
})

export const paperCategoriesSchema = z.array(paperCategorySchema)

export type PaperSource = z.infer<typeof paperSourceSchema>
export type PaperCategory = z.infer<typeof paperCategorySchema>

export const questionSchema = z.object({
  id: z.coerce.number(),
  title: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  type: z
    .string()
    .nullish()
    .transform((value) => value ?? 'single'),
  globalAccuracy: z.coerce
    .number()
    .nullish()
    .transform((value) => value ?? null),
  correctAnswer: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((value) => (value === null || value === undefined ? '' : String(value))),
  options: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  analysis: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  source: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  tag: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  material: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  // The live record JSON stores the native answer shape (0-based number or an
  // array of numbers), while freshly fetched questions usually return null.
  userAnswer: z
    .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
    .nullish()
    .transform((value) => value ?? null),
  memorize: z
    .boolean()
    .nullish()
    .transform((value) => value ?? false),
})

export const questionArraySchema = z.array(questionSchema)
export type Question = z.infer<typeof questionSchema>

export const practiceSetSchema = z.object({
  resps: questionArraySchema,
  testName: z
    .string()
    .nullish()
    .transform((value) => value ?? '专项练习'),
  // `/tk/tagInfo`, `/tk/getCtInfo`, and `/tk/getPractice` return `tl` as an
  // array of module objects; older/alternate payloads use a JSON string.
  tl: z
    .union([z.string(), z.array(z.unknown())])
    .nullish()
    .transform((value) => value ?? []),
})

export type PracticeSet = z.infer<typeof practiceSetSchema>

export const recordDetailSchema = z.object({
  questions: questionArraySchema,
  model: z.unknown().nullish(),
})

export type RecordDetail = z.infer<typeof recordDetailSchema>

export const practiceRecordSummarySchema = z.object({
  id: z.coerce.number(),
  tname: z.string(),
  timeTaken: z.union([z.string(), z.number()]).transform(String),
  total: z.coerce.number(),
  correct: z.coerce.number(),
  wrong: z.coerce.number(),
  unanswered: z.coerce
    .number()
    .nullish()
    .transform((value) => value ?? 0),
  createTime: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  correctIds: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  errorIds: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  tkWrongAnswerIds: z.unknown().nullish(),
})

export const practiceRecordPageSchema = z.object({
  tkMyRecords: z.array(practiceRecordSummarySchema),
  myNodes: z
    .array(z.unknown())
    .nullish()
    .transform((value) => value ?? []),
})

export type PracticeRecordSummary = z.infer<typeof practiceRecordSummarySchema>
export type PracticeRecordPage = z.infer<typeof practiceRecordPageSchema>

export interface PracticeRecordPayload {
  tname: string
  total: number
  timeTaken: number
  correct: number
  wrong: number
  unanswered: number
  json: string
  correctIds: string
  errorIds: string
  tkWrongAnswerIds: {
    correctIds: number[] | null
    errorIds: number[] | null
  }
}

export interface TagNode {
  id: string
  parentId: string | null
  sort: number
  zqc: number
  cwc: number
  count: number
  ise: boolean
  children: TagNode[]
}

export interface WrongQuestionGroup {
  tag: string
  item: Array<{ id: number; title: string }>
}

/* ------------------------------------------------------------------ */
/* Shenlun                                                             */
/* ------------------------------------------------------------------ */

export const shenlunPaperSummarySchema = z.object({
  id: z.union([z.string(), z.number()]),
  testName: z.string(),
})

export const shenlunCategorySchema = z.object({
  id: z.coerce.number(),
  typeName: z.string(),
  list: z
    .array(shenlunPaperSummarySchema)
    .nullish()
    .transform((value) => value ?? []),
})

export const shenlunCategoriesSchema = z.array(shenlunCategorySchema)

export const shenlunAnswerSchema = z.object({
  id: z.coerce.number(),
  answer: z.string(),
  organ: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  good: z.number().optional(),
  noGood: z.number().optional(),
  assess: z.unknown().nullish(),
})

export const shenlunQuestionSchema = z.object({
  id: z.coerce.number(),
  content: z.string(),
  require: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  userAnswers: z
    .union([z.string(), z.array(z.string()), z.null()])
    .nullish()
    .transform((value) => value ?? null),
  answers: z
    .array(shenlunAnswerSchema)
    .nullish()
    .transform((value) => value ?? []),
})

export const shenlunPaperSchema = z.object({
  questions: z.array(shenlunQuestionSchema),
  expandedMaterials: z
    .array(z.unknown())
    .nullish()
    .transform((value) => value ?? []),
})

export const shenlunRecordSchema = z
  .object({
    sid: z.union([z.string(), z.number()]),
    tid: z.union([z.string(), z.number()]),
    name: z
      .string()
      .nullish()
      .transform((value) => value ?? ''),
    wt: z
      .string()
      .nullish()
      .transform((value) => value ?? ''),
    ctime: z
      .string()
      .nullish()
      .transform((value) => value ?? ''),
    utime: z.string().nullish(),
    pgStatus: z.union([z.string(), z.number()]).nullish(),
    r: z.string().nullish(),
  })
  .catchall(z.unknown())

export type ShenlunPaperSummary = z.infer<typeof shenlunPaperSummarySchema>
export type ShenlunCategory = z.infer<typeof shenlunCategorySchema>
export type ShenlunAnswer = z.infer<typeof shenlunAnswerSchema>
export type ShenlunQuestion = z.infer<typeof shenlunQuestionSchema>
export type ShenlunPaper = z.infer<typeof shenlunPaperSchema>
export type ShenlunRecord = z.infer<typeof shenlunRecordSchema>

export const shenlunRecordListSchema = z.array(shenlunRecordSchema)

export interface ShenlunSaveInput {
  paperId: string | number
  problemId: number
  answer: string
}

export interface ShenlunCorrectionInput {
  testId: string | number
  userAnswerId: string | number
  problem: string
  answer: string
}

/* ------------------------------------------------------------------ */
/* Word analysis                                                       */
/* ------------------------------------------------------------------ */

export const analyzeWordSchema = z.object({
  id: z.coerce.number(),
  groupId: z.coerce.number(),
  idiom: z.string(),
  definition: z.string(),
  keynote: z.string(),
  meaning: z.string(),
})

export const analyzeGroupSchema = z.array(analyzeWordSchema)
export type AnalyzeWord = z.infer<typeof analyzeWordSchema>

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

export const wordSummarySchema = z.object({
  id: z.coerce.number(),
  value: z.string(),
  hot: z
    .boolean()
    .nullish()
    .transform((value) => value ?? false),
})

export const wordSummaryListSchema = z.array(wordSummarySchema)

export const wordDetailSchema = z.object({
  id: z.coerce.number(),
  wordType: z.coerce
    .number()
    .nullish()
    .transform((value) => value ?? 0),
  wordContent: z.string(),
  abbreviation: z.string().nullish(),
  derivation: z.string().nullish(),
  example: z.string().nullish(),
  explanation: z.string().nullish(),
  pinyin: z.string().nullish(),
  similar: z.string().nullish(),
  opposite: z.string().nullish(),
  wordSex: z.string().nullish(),
  hot: z.boolean().nullish(),
  xcProblemResp: z.unknown().nullish(),
})

export const personalWordSchema = wordDetailSchema.extend({
  similarArry: z.array(z.string()).nullish(),
  oppositeArry: z.array(z.string()).nullish(),
  grouping: z.string().nullish(),
  createTime: z.string().nullish(),
})

export const wordDetailListSchema = z.array(wordDetailSchema)
export const personalWordListSchema = z.array(personalWordSchema)

export const highFrequencyRawSchema = z.object({
  myWordId: z
    .array(z.coerce.number())
    .nullish()
    .transform((value) => value ?? []),
  hword: z.string(),
})

export type WordKind = 'idiom' | 'term'
export type WordSummary = z.infer<typeof wordSummarySchema>
export type WordDetail = z.infer<typeof wordDetailSchema>
export type PersonalWord = z.infer<typeof personalWordSchema>
export type HighFrequencyRaw = z.infer<typeof highFrequencyRawSchema>

export interface HighFrequencyResult {
  myWordId: number[]
  hword: WordDetail[]
}

export interface PersonalWordInput {
  wordContent: string
  explanation?: string
  pinyin?: string
  similar?: string
  similarArry?: string[]
  opposite?: string
  oppositeArry?: string[]
  wordSex?: string
  abbreviation?: string
  example?: string
  grouping?: string
}

export interface PersonalWordUpdateInput extends PersonalWordInput {
  id: number
}
