import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '../../auth/authStore'
import { useSettingsStore } from '../../settings/settingsStore'
import { resetChatStore, useChatStore } from '../chatStore'
import type { PracticeQuestion } from '../chatTypes'

const questions: PracticeQuestion[] = [
  {
    id: 101,
    title: '<p>测试题</p>',
    type: 'single',
    options: ['甲', '乙'],
    correctAnswer: ['A'],
    analysis: '<p>解析</p>',
    tag: '常识判断',
  },
]

const start = {
  questions,
  title: '一组历年题',
  intro: '这套历年题一共 1 道，我们一道一道来。',
  remote: true,
}

beforeEach(() => {
  localStorage.clear()
  resetChatStore()
  useSettingsStore.setState({
    skin: 'gemini',
    theme: 'light',
    branding: 'official',
    apiBaseUrl: 'https://saduck.top/api',
    quickHideEnabled: true,
  })
  useAuthStore.setState({
    status: 'anonymous',
    token: null,
    profile: null,
    membershipExpired: false,
    loginPending: false,
    verifying: false,
    lastError: null,
  })
})

describe('practice transition', () => {
  it('reuses a transient picker chat instead of leaving a junk session', () => {
    const store = useChatStore.getState()
    const created = store.createSession()

    store.send('/paper')

    const pickerSession = useChatStore.getState().session
    expect(pickerSession?.id).toBe(created.id)
    expect(pickerSession?.messages.some((message) => message.kind === 'tool')).toBe(true)

    useChatStore.getState().startPractice(start)

    const session = useChatStore.getState().session
    expect(session?.id).toBe(created.id)
    expect(session?.title).toBe('一组历年题')
    expect(session?.mode).toBe('practice')
    expect(session?.messages).toHaveLength(2)
    expect(session?.messages[0]).toMatchObject({ kind: 'text', content: start.intro })
    expect(session?.messages[1]).toMatchObject({ kind: 'question', questionId: 101 })
    expect(
      session?.messages.some(
        (message) =>
          message.kind === 'tool' ||
          (message.kind === 'text' && message.role === 'user' && message.content === '/paper'),
      ),
    ).toBe(false)

    const summaries = useChatStore.getState().sessions
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({ id: created.id, title: '一组历年题' })
  })

  it('creates a new session when the current chat already has a real reply', () => {
    const store = useChatStore.getState()
    const created = store.createSession()
    store.send('/help')

    useChatStore.getState().startPractice({ ...start, title: '一组行测练习' })

    const session = useChatStore.getState().session
    expect(session?.id).not.toBe(created.id)
    expect(session?.title).toBe('一组行测练习')
    expect(useChatStore.getState().sessions).toHaveLength(2)
  })
})
