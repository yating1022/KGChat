import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ApiClient from '../../../api/client'
import { MembershipError } from '../../../api/errors'
import { useAuthStore } from '../../../auth/authStore'
import { resetChatStore, useChatStore } from '../../../chat/chatStore'
import type { ChatSession } from '../../../chat/chatTypes'
import { useSettingsStore } from '../../../settings/settingsStore'
import { buildAnalyzeRounds } from '../analyzeEngine'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('../../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>()
  return { ...actual, post: postMock }
})

const words = [
  {
    id: 451,
    groupId: 116,
    idiom: '奉为圭臬',
    definition: '把某种准则当作最高准则',
    keynote: '强调尊崇',
    meaning: '奉为圭臬的准则。',
  },
  {
    id: 452,
    groupId: 116,
    idiom: '亦步亦趋',
    definition: '没有主见地追随别人',
    keynote: '含贬义',
    meaning: '不能亦步亦趋。',
  },
]

function analyzeSession(): ChatSession {
  return {
    id: 'chat-analyze',
    title: '几组词语辨析',
    createdAt: 1,
    updatedAt: 1,
    messages: [],
    draft: '',
    scrollTop: 0,
    mode: 'analyze',
    practice: {
      questions: buildAnalyzeRounds(words, 'wordToDef'),
      index: 0,
      status: 'completed',
      answers: {},
      skipped: {},
      revealed: {},
      startedAt: 1,
      completedAt: 2,
      saveState: 'idle',
      remote: false,
      flow: 'analyze',
      groupId: 116,
    },
    analyze: { groupId: 116, words, mode: 'wordToDef', mastered: false },
  }
}

beforeEach(() => {
  postMock.mockReset()
  localStorage.clear()
  resetChatStore()
  useSettingsStore.setState({
    skin: 'gemini',
    theme: 'light',
    branding: 'official',
    apiBaseUrl: 'https://saduck.test/api',
    quickHideEnabled: true,
  })
  useAuthStore.setState({
    status: 'authenticated',
    token: 'test-token',
    profile: {
      email: 'learner@example.test',
      vipType: 1,
      vipStartTime: null,
      vipEndTime: null,
    },
    membershipExpired: false,
    loginPending: false,
    verifying: false,
    lastError: null,
  })
})

describe('markAnalyzeMastered', () => {
  it('marks the group through /analyze/addZw?groupId=', async () => {
    postMock.mockResolvedValue({ code: 0, message: null, timestamp: 0, result: null })
    const session = analyzeSession()
    useChatStore.setState({
      session,
      sessions: [{ id: session.id, title: session.title, updatedAt: session.updatedAt }],
      status: 'ready',
    })

    await useChatStore.getState().markAnalyzeMastered()

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock.mock.calls[0][0]).toBe('/analyze/addZw?groupId=116')
    expect(useChatStore.getState().session?.analyze?.mastered).toBe(true)
    expect(useChatStore.getState().session?.practice?.saveState).toBe('idle')
  })

  it('treats 102 as a membership notice and does not mark mastery', async () => {
    postMock.mockRejectedValue(new MembershipError('会员已到期'))
    const session = analyzeSession()
    useChatStore.setState({
      session,
      sessions: [{ id: session.id, title: session.title, updatedAt: session.updatedAt }],
      status: 'ready',
    })

    await useChatStore.getState().markAnalyzeMastered()

    expect(useChatStore.getState().session?.analyze?.mastered).toBe(false)
    expect(useAuthStore.getState().membershipExpired).toBe(true)

    const notices = (useChatStore.getState().session?.messages ?? []).filter(
      (message) => message.kind === 'notice',
    )
    expect(notices.some((notice) => notice.content.includes('会员'))).toBe(true)
  })
})
