import { post, postOptions, type ApiContext } from '../client'
import {
  analyzeGroupSchema,
  parseWith,
  type AnalyzeWord,
} from '../types'

function queryId(id: number | string): string {
  return encodeURIComponent(String(id))
}

export async function getAnalyzeGroup(context: ApiContext): Promise<AnalyzeWord[]> {
  const envelope = await post<unknown>('/analyze/getBxCy', {}, postOptions(context))
  return parseWith(analyzeGroupSchema, envelope.result, '词语辨析')
}

/** Marks a group mastered. A non-VIP account surfaces `MembershipError` (102). */
export async function markAnalyzeGroupMastered(
  groupId: number | string,
  context: ApiContext,
): Promise<void> {
  await post(`/analyze/addZw?groupId=${queryId(groupId)}`, {}, postOptions(context))
}

export async function getAnalyzeHistory(
  pageNum = 1,
  context: ApiContext,
): Promise<unknown> {
  const envelope = await post<unknown>(
    `/analyze/myInfo?pageNum=${queryId(pageNum)}`,
    {},
    postOptions(context),
  )
  return envelope.result
}

export async function clearAnalyzeHistory(context: ApiContext): Promise<void> {
  await post('/analyze/removeAll', {}, postOptions(context))
}
