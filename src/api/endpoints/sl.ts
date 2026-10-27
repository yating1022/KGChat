import { post, postOptions, type ApiContext } from '../client'
import { DecodeError } from '../errors'
import { runOnce } from '../requestGate'
import {
  parseWith,
  shenlunCategoriesSchema,
  shenlunPaperSchema,
  shenlunRecordListSchema,
  type ShenlunCategory,
  type ShenlunCorrectionInput,
  type ShenlunPaper,
  type ShenlunRecord,
  type ShenlunSaveInput,
} from '../types'

function queryId(id: number | string): string {
  return encodeURIComponent(String(id))
}

export async function listShenlunPapers(context: ApiContext = {}): Promise<ShenlunCategory[]> {
  const envelope = await post<unknown>('/sl/getSlList', {}, postOptions(context))
  return parseWith(shenlunCategoriesSchema, envelope.result, '申论试卷分类')
}

export async function getShenlunPaper(
  id: number | string,
  context: ApiContext,
): Promise<ShenlunPaper> {
  const envelope = await post<unknown>(
    `/sl/getSlContextNew?id=${queryId(id)}`,
    {},
    postOptions(context),
  )
  return parseWith(shenlunPaperSchema, envelope.result, '申论试卷')
}

export function saveShenlunAnswer(
  input: ShenlunSaveInput,
  context: ApiContext,
): Promise<void> {
  const key = `sl:saveMy:${String(input.paperId)}:${String(input.problemId)}`
  return runOnce(key, async () => {
    await post(
      '/sl/saveMy',
      {
        problemId: input.problemId,
        answer: input.answer,
        answerId: input.paperId,
      },
      postOptions(context),
    )
  })
}

export async function listMyShenlunRecords(context: ApiContext): Promise<ShenlunRecord[]> {
  const envelope = await post<unknown>('/sl/getMySl', {}, postOptions(context))
  return parseWith(shenlunRecordListSchema, envelope.result, '申论记录')
}

/** Submits the AI correction task. The report is polled separately. */
export function submitShenlunCorrection(
  input: ShenlunCorrectionInput,
  context: ApiContext,
): Promise<void> {
  const key = `sl:correctEssay:${String(input.userAnswerId)}`
  return runOnce(key, async () => {
    await post(
      '/extraFunctions/correctEssay',
      {
        testId: input.testId,
        userAnswerId: input.userAnswerId,
        problem: input.problem,
        r: input.answer,
      },
      postOptions(context),
    )
  })
}

/** The report JSON is carried in `message`; `result` is always null. */
export function getShenlunReport(
  sid: number | string,
  context: ApiContext,
): Promise<unknown> {
  return runOnce(`sl:pgResp:${String(sid)}`, async () => {
    const envelope = await post<null>(
      `/sl/pgResp?id=${queryId(sid)}`,
      {},
      postOptions(context),
    )

    if (!envelope.message) {
      return null
    }

    try {
      return JSON.parse(envelope.message) as unknown
    } catch (error) {
      throw new DecodeError('批改报告暂时无法解析', { cause: error })
    }
  })
}

export async function deleteShenlunRecord(
  sid: number | string,
  context: ApiContext,
): Promise<void> {
  await post(`/sl/delMySl?id=${queryId(sid)}`, {}, postOptions(context))
}
