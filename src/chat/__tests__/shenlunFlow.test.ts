import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ApiClient from '../../api/client'
import { useAuthStore } from '../../auth/authStore'
import { useSettingsStore } from '../../settings/settingsStore'
import { resetChatStore, useChatStore } from '../chatStore'
import type { ChatSession, ShenlunQuestionState } from '../chatTypes'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>()
  return { ...actual, post: postMock }
})

const PAPER_ID = 7904460
const QUESTION_TEXT = '请根据“给定资料1”，谈一谈H市是如何管理“城市用光”的。'

function envelope(result: unknown, message: string | null = null) {
  return { code: 0, message, timestamp: 0, result }
}

function shenlunQuestion(
  id: number,
  patch: Partial<ShenlunQuestionState> = {},
): ShenlunQuestionState {
  return {
    id,
    content: `<p>${QUESTION_TEXT}</p>`,
    requirement: '要求：全面准确，有条理，不超过250字。',
    plainContent: QUESTION_TEXT,
    answer: '',
    answerId: null,
    status: 'idle',
    ...patch,
  }
}

function shenlunSession(questions: ShenlunQuestionState[], index = 0): ChatSession {
  return {
    id: 'chat-shenlun',
    title: '聊聊申论',
    createdAt: 1,
    updatedAt: 1,
    messages: [],
    draft: '',
    scrollTop: 0,
    mode: 'shenlun',
    shenlun: { paperId: PAPER_ID, questions, index, status: 'active' },
  }
}

function setSession(session: ChatSession) {
  useChatStore.setState({
    session,
    sessions: [{ id: session.id, title: session.title, updatedAt: session.updatedAt }],
    status: 'ready',
  })
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

describe('shenlun answer flow', () => {
  it('saves, resolves the sid, submits correction, then polls the matching report', async () => {
    postMock.mockImplementation(async (path: string) => {
      if (path === '/sl/saveMy') return envelope(null)
      if (path === '/sl/getMySl') {
        return envelope([
          {
            sid: 80974,
            tid: PAPER_ID,
            name: '申论材料',
            wt: QUESTION_TEXT,
            ctime: '2026-10-26 10:00:00',
            utime: '2026-10-26 10:05:00',
            pgStatus: 1,
            r: '用户作答',
          },
        ])
      }
      if (path === '/extraFunctions/correctEssay') return envelope(null)
      if (path.startsWith('/sl/pgResp')) {
        return envelope(
          null,
          JSON.stringify({
            finalScore: { actualScore: 12, level: '中等', scoreRate: '60%' },
            baseInfo: { totalScore: 20 },
          }),
        )
      }
      return envelope(null)
    })

    setSession(shenlunSession([shenlunQuestion(10011)]))

    const answer = '字'.repeat(100)
    await useChatStore.getState().submitShenlunAnswer(answer)

    const paths = postMock.mock.calls.map((call) => call[0] as string)
    expect(paths).toEqual(['/sl/saveMy', '/sl/getMySl', '/extraFunctions/correctEssay'])

    const correctEssay = postMock.mock.calls[2][1] as Record<string, unknown>
    expect(correctEssay).toMatchObject({
      testId: PAPER_ID,
      userAnswerId: 80974,
      problem: QUESTION_TEXT,
      r: answer,
    })

    const pending = useChatStore.getState().session
    expect(pending?.shenlun?.questions[0]).toMatchObject({
      status: 'polling',
      answerId: '80974',
    })
    expect(pending?.messages.some((message) => message.kind === 'shenlun-report')).toBe(true)

    await useChatStore.getState().refreshShenlunReport(10011, { manual: true })

    const lastPath = postMock.mock.calls.at(-1)?.[0] as string
    expect(lastPath).toBe('/sl/pgResp?id=80974')

    const reported = useChatStore.getState().session
    expect(reported?.shenlun?.questions[0]?.status).toBe('report')
    expect(reported?.shenlun?.questions[0]?.report).toBeTruthy()
    expect(
      reported?.messages.some(
        (message) => message.kind === 'text' && message.content === '批改结果出来了。',
      ),
    ).toBe(true)
  })

  it('shows a conversational notice instead of calling the API for short answers', async () => {
    setSession(shenlunSession([shenlunQuestion(10011)]))

    await useChatStore.getState().submitShenlunAnswer('写得太短了')

    expect(postMock).not.toHaveBeenCalled()

    const messages = useChatStore.getState().session?.messages ?? []
    expect(
      messages.some(
        (message) => message.kind === 'notice' && message.content.includes('至少需要 100 个字'),
      ),
    ).toBe(true)
  })

  it('reuses the saved sid instead of saving the same answer twice', async () => {
    postMock.mockResolvedValue(envelope(null))

    const answer = '字'.repeat(100)
    setSession(
      shenlunSession([shenlunQuestion(10011, { answer, answerId: '80974', status: 'saved' })]),
    )

    await useChatStore.getState().submitShenlunAnswer(answer)

    const paths = postMock.mock.calls.map((call) => call[0] as string)
    expect(paths).toEqual(['/extraFunctions/correctEssay'])
    expect(postMock.mock.calls[0][1]).toMatchObject({
      testId: PAPER_ID,
      userAnswerId: 80974,
      r: answer,
    })

    const question = useChatStore.getState().session?.shenlun?.questions[0]
    expect(question).toMatchObject({ status: 'polling', answerId: '80974' })
  })

  it('does not re-save an unchanged answer through the save-only action', async () => {
    const answer = '字'.repeat(100)
    setSession(
      shenlunSession([shenlunQuestion(10011, { answer, answerId: '80974', status: 'saved' })]),
    )

    await useChatStore.getState().saveShenlunAnswer(answer)

    expect(postMock).not.toHaveBeenCalled()

    const messages = useChatStore.getState().session?.messages ?? []
    expect(
      messages.some((message) => message.kind === 'text' && message.content.includes('已经保存过')),
    ).toBe(true)
  })

  it('clears the previous sid when the answer text changes', async () => {
    postMock.mockImplementation(async (path: string) => {
      if (path === '/sl/saveMy') return envelope(null)
      return envelope([])
    })

    setSession(
      shenlunSession([
        shenlunQuestion(10011, {
          answer: '旧'.repeat(100),
          answerId: '80974',
          status: 'saved',
        }),
      ]),
    )

    await useChatStore.getState().submitShenlunAnswer('新'.repeat(100))

    const paths = postMock.mock.calls.map((call) => call[0] as string)
    expect(paths).toEqual(['/sl/saveMy', '/sl/getMySl'])

    const question = useChatStore.getState().session?.shenlun?.questions[0]
    expect(question).toMatchObject({ status: 'sync-pending', answerId: null })
  })

  it('finishes a pending save after the user switches to another chat', async () => {
    let releaseSave!: (value: unknown) => void
    const saveGate = new Promise<unknown>((resolve) => {
      releaseSave = resolve
    })

    postMock.mockImplementation(async (path: string) => {
      if (path === '/sl/saveMy') return saveGate
      return envelope([])
    })

    useChatStore.getState().startShenlun({
      paperId: PAPER_ID,
      materials: [],
      questions: [
        {
          id: 10011,
          content: `<p>${QUESTION_TEXT}</p>`,
          requirement: '要求：全面准确。',
          plainContent: QUESTION_TEXT,
        },
      ],
      intro: '我找到一份申论材料。',
    })

    const sessionId = useChatStore.getState().session?.id
    expect(sessionId).toBeTruthy()

    const answer = '字'.repeat(100)
    const submission = useChatStore.getState().submitShenlunAnswer(answer)

    // The user leaves the Shenlun chat before the save response arrives.
    const other: ChatSession = {
      id: 'other-chat',
      title: '另一个对话',
      createdAt: 2,
      updatedAt: 2,
      messages: [{ id: 'message-1', role: 'user', kind: 'text', content: '你好', createdAt: 2 }],
      draft: '',
      scrollTop: 0,
      mode: 'chat',
    }
    useChatStore.setState({
      session: other,
      sessions: [
        { id: other.id, title: other.title, updatedAt: other.updatedAt },
        { id: sessionId!, title: '聊聊申论', updatedAt: 1 },
      ],
    })

    releaseSave(envelope(null))
    await submission

    await useChatStore.getState().selectSession(sessionId!)

    const question = useChatStore.getState().session?.shenlun?.questions[0]
    expect(question).toMatchObject({ answer, status: 'sync-pending', answerId: null })
    expect(
      useChatStore
        .getState()
        .session?.messages.some(
          (message) => message.kind === 'notice' && message.content.includes('记录同步中'),
        ),
    ).toBe(true)
  })

  it('keeps the record sync pending when getMySl has no matching record', async () => {
    postMock.mockImplementation(async (path: string) => {
      if (path === '/sl/saveMy') return envelope(null)
      return envelope([])
    })

    setSession(shenlunSession([shenlunQuestion(10011)]))

    await useChatStore.getState().submitShenlunAnswer('字'.repeat(100))

    const question = useChatStore.getState().session?.shenlun?.questions[0]
    expect(question?.status).toBe('sync-pending')
    expect(question?.answerId).toBeNull()

    const messages = useChatStore.getState().session?.messages ?? []
    expect(
      messages.some(
        (message) => message.kind === 'notice' && message.content.includes('记录同步中'),
      ),
    ).toBe(true)
  })

  it('refreshes the report card that was clicked, not the current question', async () => {
    postMock.mockResolvedValue(envelope(null, JSON.stringify({ finalScore: { actualScore: 8 } })))

    setSession(
      shenlunSession(
        [
          shenlunQuestion(10011, { answerId: '111', status: 'polling', pollStartedAt: Date.now() }),
          shenlunQuestion(10012, { answerId: '222', status: 'polling', pollStartedAt: Date.now() }),
        ],
        1,
      ),
    )

    await useChatStore.getState().refreshShenlunReport(10011, { manual: true })

    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock.mock.calls[0][0]).toBe('/sl/pgResp?id=111')

    const questions = useChatStore.getState().session?.shenlun?.questions ?? []
    expect(questions[0].status).toBe('report')
    expect(questions[1].status).toBe('polling')
  })

  it('syncs the record for the clicked question only', async () => {
    postMock.mockResolvedValue(
      envelope([
        {
          sid: 80975,
          tid: PAPER_ID,
          name: '申论材料',
          wt: QUESTION_TEXT,
          ctime: '2026-10-26 10:00:00',
          utime: '2026-10-26 10:05:00',
          pgStatus: 1,
          r: '用户作答',
        },
      ]),
    )

    setSession(
      shenlunSession(
        [
          shenlunQuestion(10011, { answer: '第一题作答', status: 'sync-pending' }),
          shenlunQuestion(10012, { answer: '第二题作答', status: 'sync-pending' }),
        ],
        1,
      ),
    )

    await useChatStore.getState().syncShenlunRecord(10011)

    const questions = useChatStore.getState().session?.shenlun?.questions ?? []
    expect(questions[0]).toMatchObject({ status: 'saved', answerId: '80975' })
    expect(questions[1]).toMatchObject({ status: 'sync-pending', answerId: null })
  })
})
