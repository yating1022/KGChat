import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ApiClient from '../../api/client'
import { useAuthStore } from '../../auth/authStore'
import { useSettingsStore } from '../../settings/settingsStore'
import { resetChatStore, useChatStore } from '../chatStore'
import type { ShenlunStart } from '../../features/shenlun/shenlunService'
import { prepareAnalyzeStart } from '../../features/analyze/analyzeService'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>()
  return { ...actual, post: postMock }
})

const shenlunStart: ShenlunStart = {
  paperId: 7904460,
  materials: ['<p>给定资料一。</p>'],
  questions: [
    {
      id: 10011,
      content: '<p>请根据“给定资料1”概括做法。</p>',
      requirement: '要求：不超过250字。',
      plainContent: '请根据“给定资料1”概括做法。',
    },
  ],
  intro: '我找到一份申论材料，一共 1 道题。',
}

const analyzeWords = [
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

function envelope(result: unknown) {
  return { code: 0, message: null, timestamp: 0, result }
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

describe('shenlun mode routing', () => {
  it('renders materials and the first question with a neutral title', () => {
    useChatStore.getState().createSession()
    useChatStore.getState().startShenlun(shenlunStart)

    const session = useChatStore.getState().session
    expect(session?.mode).toBe('shenlun')
    expect(session?.title).toBe('聊聊申论')
    expect(session?.title).not.toContain('申论题')
    expect(session?.messages.map((message) => message.kind)).toEqual([
      'text',
      'shenlun-material',
      'shenlun-question',
    ])
  })

  it('treats short composer text as an answer attempt, not a command', () => {
    useChatStore.getState().createSession()
    useChatStore.getState().startShenlun(shenlunStart)

    useChatStore.getState().send('只写一点点')

    expect(postMock).not.toHaveBeenCalled()
    const messages = useChatStore.getState().session?.messages ?? []
    expect(messages.at(-2)).toMatchObject({ kind: 'text', role: 'user', content: '只写一点点' })
    expect(messages.at(-1)).toMatchObject({ kind: 'notice' })
    const notice = messages.at(-1)
    expect(notice?.kind === 'notice' ? notice.content : '').toContain('至少需要 100 个字')
  })

  it('submits a long answer through saveMy and keeps commands working', async () => {
    postMock.mockImplementation(async (path: string) => {
      if (path === '/sl/getMySl') return envelope([])
      return envelope(null)
    })

    useChatStore.getState().createSession()
    useChatStore.getState().startShenlun(shenlunStart)

    useChatStore.getState().send('字'.repeat(100))

    await vi.waitFor(() => {
      expect(postMock.mock.calls.some((call) => call[0] === '/sl/saveMy')).toBe(true)
    })
    await vi.waitFor(() => {
      expect(useChatStore.getState().session?.shenlun?.questions[0]?.status).toBe('sync-pending')
    })

    const saveCall = postMock.mock.calls.find((call) => call[0] === '/sl/saveMy')
    expect(saveCall?.[1]).toMatchObject({ problemId: 10011, answerId: 7904460 })

    useChatStore.getState().send('/help')
    const messages = useChatStore.getState().session?.messages ?? []
    expect(
      messages.some(
        (message) => message.kind === 'text' && message.content.includes('/shenlun'),
      ),
    ).toBe(true)
  })
})

describe('tool commands', () => {
  it('opens the word tool with a prefilled query', () => {
    useChatStore.getState().createSession()
    useChatStore.getState().send('/word 一蹴而就')

    const session = useChatStore.getState().session
    const tool = session?.messages.find((message) => message.kind === 'tool')
    expect(tool).toMatchObject({ kind: 'tool', tool: 'word', query: '一蹴而就' })
    expect(session?.word).toMatchObject({ kind: 'idiom', query: '一蹴而就' })
  })

  it('opens the analyze and shenlun panels from their tool commands', () => {
    useChatStore.getState().createSession()
    useChatStore.getState().send('/analyze tool')

    const analyzeTool = useChatStore
      .getState()
      .session?.messages.find((message) => message.kind === 'tool')
    expect(analyzeTool).toMatchObject({ kind: 'tool', tool: 'analyze' })

    useChatStore.getState().send('/shenlun')
    const shenlunTool = useChatStore
      .getState()
      .session?.messages.find(
        (message) => message.kind === 'tool' && message.tool === 'shenlun',
      )
    expect(shenlunTool).toBeTruthy()
  })
})

describe('practice and analyze routing', () => {
  it('still parses option letters for an active practice', () => {
    useChatStore.getState().createSession()
    useChatStore.getState().startPractice({
      questions: [
        {
          id: 101,
          title: '<p>测试题</p>',
          type: 'single',
          options: ['甲', '乙'],
          correctAnswer: ['A'],
          analysis: '<p>解析</p>',
        },
      ],
      title: '一组练习',
      intro: '先看第一道。',
      remote: false,
    })

    useChatStore.getState().send('A')

    const session = useChatStore.getState().session
    expect(session?.practice?.answers['101']).toMatchObject({ labels: ['A'], correct: true })
    expect(
      session?.messages.some((message) => message.kind === 'feedback'),
    ).toBe(true)
  })

  it('reveals the analyze difference immediately after a typed answer', () => {
    useChatStore.getState().createSession()
    useChatStore.getState().startAnalyze(prepareAnalyzeStart(analyzeWords, 'wordToDef'))

    const question = useChatStore.getState().session?.practice?.questions[0]
    expect(question).toBeTruthy()

    useChatStore.getState().send('A')

    const session = useChatStore.getState().session
    expect(session?.practice?.answers[String(question?.id)]).toBeTruthy()
    const analysis = session?.messages.find((message) => message.kind === 'analysis')
    expect(analysis).toMatchObject({ lead: '这组词的区别是这样的：' })
    expect(session?.practice?.flow).toBe('analyze')
  })
})
