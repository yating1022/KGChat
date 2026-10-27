import { post, postOptions, type ApiContext } from '../client'
import { decryptAesPlain, encryptSourceId } from '../crypto'
import { DecodeError } from '../errors'
import { runOnce } from '../requestGate'
import {
  parseWith,
  paperCategoriesSchema,
  practiceRecordPageSchema,
  practiceSetSchema,
  questionArraySchema,
  questionSchema,
  recordDetailSchema,
  type PaperCategory,
  type PracticeRecordPage,
  type PracticeRecordPayload,
  type PracticeSet,
  type Question,
  type RecordDetail,
  type TagNode,
  type WrongQuestionGroup,
} from '../types'

const ITEMIZES_KEY = '7SyqrN6925ZYb636'

export interface SmartPaperChild {
  name: string
  num: number
}

export interface SmartPaperModule {
  name: string
  snum: number
  enum: number
  son: SmartPaperChild[]
}

export interface TagPaperRequest {
  name: string
  num: number
}

function decryptResult(value: unknown, key: string, label: string): unknown {
  if (typeof value !== 'string') {
    throw new DecodeError(`${label}的加密内容格式不正确`)
  }
  return decryptAesPlain(value, key)
}

function ensureArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new DecodeError(`${label}的数据格式不正确`)
  }
  return value
}

function queryId(id: number | string): string {
  return encodeURIComponent(String(id))
}

export async function listPaperCategories(context: ApiContext = {}): Promise<PaperCategory[]> {
  const envelope = await post<unknown>('/tk/itemizes?type=1', {}, postOptions(context))
  return parseWith(
    paperCategoriesSchema,
    decryptResult(envelope.result, ITEMIZES_KEY, '历年题分类'),
    '历年题分类',
  )
}

export function getPaperQuestions(
  sid: number | string,
  context: ApiContext,
): Promise<Question[]> {
  return runOnce(`tk:sourceInfo:${String(sid)}`, async () => {
    const envelope = await post<unknown>(
      '/tk/sourceInfo',
      { id: encryptSourceId(sid) },
      postOptions(context),
    )
    return parseWith(questionArraySchema, envelope.result, '历年题题目')
  })
}

export async function getTagTree(context: ApiContext): Promise<TagNode[]> {
  const envelope = await post<unknown>('/tk/problemTagNew?type=1', {}, postOptions(context))
  return ensureArray(envelope.result, '专项标签') as TagNode[]
}

export function startSmartPaper(
  reqs: readonly SmartPaperModule[],
  difficulty: string | number | null,
  context: ApiContext,
): Promise<Question[]> {
  const key = `tk:intelligence:${difficulty ?? 'null'}:${JSON.stringify(reqs)}`
  return runOnce(key, async () => {
    const envelope = await post<unknown>(
      '/tk/intelligence',
      { reqs, difficulty },
      postOptions(context),
    )
    return parseWith(questionArraySchema, envelope.result, '智能组卷')
  })
}

export function startTagPaper(
  reqs: TagPaperRequest[],
  difficulty: string | number | null,
  context: ApiContext,
): Promise<PracticeSet> {
  const key = `tk:tagInfo:${difficulty ?? 'null'}:${JSON.stringify(reqs)}`
  return runOnce(key, async () => {
    const envelope = await post<unknown>('/tk/tagInfo', { reqs, difficulty }, postOptions(context))
    return parseWith(practiceSetSchema, envelope.result, '专项练习')
  })
}

export async function getRecommendedPractice(context: ApiContext): Promise<PracticeSet> {
  const envelope = await post<unknown>('/tk/getPractice', {}, postOptions(context))
  return parseWith(practiceSetSchema, envelope.result, '推荐练习')
}

export async function getProblemById(id: number | string, context: ApiContext): Promise<Question> {
  const envelope = await post<unknown>(
    `/tk/getProblemById?id=${queryId(id)}`,
    {},
    postOptions(context),
  )
  return parseWith(questionSchema, envelope.result, '题目')
}

export async function listFavoriteIds(context: ApiContext): Promise<number[]> {
  const envelope = await post<unknown>('/tk/getMyMarkAll', {}, postOptions(context))
  return ensureArray(envelope.result, '收藏题目').map((value) => Number(value))
}

export function addFavorite(tkId: number, context: ApiContext): Promise<void> {
  return runOnce(`tk:addMyMark:${tkId}`, async () => {
    await post(`/tk/addMyMark?tkId=${queryId(tkId)}`, {}, postOptions(context))
  })
}

export function removeFavorite(tkId: number, context: ApiContext): Promise<void> {
  return runOnce(`tk:delMyMark:${tkId}`, async () => {
    await post(`/tk/delMyMark?tkId=${queryId(tkId)}`, {}, postOptions(context))
  })
}

export function savePracticeRecord(
  payload: PracticeRecordPayload,
  context: ApiContext,
): Promise<void> {
  const key = `tk:addRecord:${payload.tname}:${payload.total}`
  return runOnce(key, async () => {
    await post('/tk/addRecord', payload, postOptions(context))
  })
}

export async function listPracticeRecords(
  type: number | string = 1,
  context: ApiContext,
): Promise<PracticeRecordPage> {
  const envelope = await post<unknown>(
    `/tk/recordNew?type=${queryId(type)}`,
    {},
    postOptions(context),
  )
  return parseWith(practiceRecordPageSchema, envelope.result, '练习记录')
}

export async function getPracticeRecordDetail(
  id: number | string,
  context: ApiContext,
): Promise<RecordDetail> {
  const envelope = await post<unknown>(`/tk/recordInfo?id=${queryId(id)}`, {}, postOptions(context))

  let detail: unknown = envelope.result
  if (typeof detail === 'string') {
    try {
      detail = JSON.parse(detail) as unknown
    } catch (error) {
      throw new DecodeError('练习记录详情暂时无法解析', { cause: error })
    }
  }

  return parseWith(recordDetailSchema, detail, '练习记录详情')
}

export async function listWrongQuestionGroups(context: ApiContext): Promise<WrongQuestionGroup[]> {
  const envelope = await post<unknown>('/tk/getCt', {}, postOptions(context))
  return ensureArray(envelope.result, '错题列表') as WrongQuestionGroup[]
}

export async function getWrongQuestions(
  indexs: number[],
  name: string,
  context: ApiContext,
): Promise<PracticeSet> {
  const envelope = await post<unknown>('/tk/getCtInfo', { indexs, name }, postOptions(context))
  return parseWith(practiceSetSchema, envelope.result, '错题练习')
}
