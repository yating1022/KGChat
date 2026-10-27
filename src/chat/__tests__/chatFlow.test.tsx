import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../../app/App'
import { useAuthStore } from '../../auth/authStore'
import { useSettingsStore } from '../../settings/settingsStore'
import { TEST_PRACTICE_START, TEST_QUESTIONS } from '../../test/fixtures'
import { resetChatStore, useChatStore } from '../chatStore'
import { importHistoryJson } from '../historyTransfer'
import { loadSession } from '../sessionRepository'

const { memory } = vi.hoisted(() => ({
  memory: new Map<string, unknown>(),
}))

vi.mock('idb-keyval', () => ({
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: unknown) => {
    memory.set(key, value)
  },
  del: async (key: string) => {
    memory.delete(key)
  },
  keys: async () => [...memory.keys()],
}))

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  )
}

async function startFixturePractice() {
  await screen.findByText('你好，朋友')
  act(() => useChatStore.getState().startPractice(TEST_PRACTICE_START))
  await screen.findByText(TEST_QUESTIONS[0].title)
}

beforeEach(() => {
  memory.clear()
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
  document.documentElement.dataset.skin = 'gemini'
  document.documentElement.dataset.theme = 'light'
  document.documentElement.dataset.branding = 'official'
})

afterEach(() => {
  cleanup()
})

describe('chat flow', () => {
  it('runs an answer -> feedback -> next -> summary flow', async () => {
    const user = userEvent.setup()
    renderApp()
    await startFixturePractice()

    await user.click(screen.getByRole('button', { name: /一如既往/ }))
    await screen.findByText('答对了。')
    expect(screen.getByText(/你选的是：/)).toBeTruthy()

    await user.click(screen.getAllByRole('button', { name: '下一题' }).at(-1)!)

    await screen.findByText(TEST_QUESTIONS[1].title)
    await user.click(screen.getByRole('button', { name: /月光像流水/ }))
    await user.click(screen.getByRole('button', { name: /她的笑容像春天的阳光/ }))
    await user.click(screen.getByRole('button', { name: '提交答案' }))
    await waitFor(() => expect(screen.getAllByText('答对了。')).toHaveLength(2))

    await user.click(screen.getAllByRole('button', { name: '下一题' }).at(-1)!)

    await screen.findByText(TEST_QUESTIONS[2].title)
    await user.click(screen.getByRole('button', { name: /A\s*正确/ }))
    await waitFor(() => expect(screen.getAllByText('答对了。')).toHaveLength(3))

    await user.click(screen.getAllByRole('button', { name: '下一题' }).at(-1)!)

    await screen.findByText(/这组练习完成了/)
    expect(screen.getByText(/答对 3 题/)).toBeTruthy()
  })

  it('uses conversational wording for a wrong answer', async () => {
    const user = userEvent.setup()
    renderApp()
    await startFixturePractice()

    await user.click(screen.getByRole('button', { name: /迫不急待/ }))

    await screen.findByText('这题没选对。')
    expect(screen.getByText(/你选的是：B\. 迫不急待/)).toBeTruthy()
    expect(screen.getByText(/正确答案是：A\. 一如既往/)).toBeTruthy()
  })

  it('lists imported conversations in the rail', async () => {
    renderApp()
    await screen.findByRole('heading', { level: 1 })

    await act(async () => {
      await importHistoryJson(
        JSON.stringify({
          format: 'gemini-voyager.chat.v1',
          title: '周末闲聊',
          items: [{ user: 'hi', assistant: 'hello' }],
        }),
      )
      await useChatStore.getState().reloadFromStorage()
    })

    expect(await screen.findByText('周末闲聊')).toBeTruthy()
    // The quiz-page rail is a cover list; switching only exists in quick-hide.
    expect(screen.queryByRole('button', { name: '打开对话 周末闲聊' })).toBeNull()
  })

  it('does not modify an imported conversation when a command is sent', async () => {
    renderApp()
    await screen.findByRole('heading', { level: 1 })

    await importHistoryJson(
      JSON.stringify({
        format: 'gemini-voyager.chat.v1',
        title: '周末闲聊',
        items: [{ user: 'hi', assistant: 'hello' }],
      }),
    )
    await act(async () => {
      await useChatStore.getState().reloadFromStorage()
    })

    const importedId =
      useChatStore.getState().sessions.find((summary) => summary.origin === 'import')?.id ?? ''
    await act(async () => {
      await useChatStore.getState().selectSession(importedId)
    })

    const before = useChatStore.getState().session?.messages.length ?? 0
    expect(useChatStore.getState().session?.id).toBe(importedId)

    await act(async () => {
      useChatStore.getState().send('/help')
    })

    expect(useChatStore.getState().session?.id).not.toBe(importedId)
    const stored = await loadSession(importedId)
    expect(stored?.messages.length).toBe(before)
  })

  it('switches skin without losing the active practice session', async () => {
    const user = userEvent.setup()
    renderApp()
    await startFixturePractice()

    await user.click(screen.getByRole('button', { name: /一如既往/ }))
    await screen.findByText('答对了。')

    await user.click(screen.getByLabelText('打开设置'))
    await screen.findByRole('dialog', { name: '设置' })
    await user.click(screen.getByRole('radio', { name: '切换到 ChatGPT 皮肤' }))

    await waitFor(() => {
      expect(document.documentElement.dataset.skin).toBe('chatgpt')
    })
    expect(useChatStore.getState().session?.practice?.status).toBe('active')
    expect(screen.getByText('答对了。')).toBeTruthy()

    await user.click(screen.getByLabelText('关闭'))
    expect(screen.getByText(TEST_QUESTIONS[0].title)).toBeTruthy()
  })

  it('restores the draft and scroll position when switching sessions', async () => {
    const user = userEvent.setup()
    renderApp()
    await startFixturePractice()

    const composer = screen.getByLabelText('消息内容') as HTMLTextAreaElement
    await user.type(composer, '我的草稿')
    expect(useChatStore.getState().session?.draft).toBe('我的草稿')

    useChatStore.getState().setScrollTop(123)

    // Practice sessions stay out of the rail; switching happens through the store.
    const practiceId = useChatStore.getState().session?.id ?? ''
    expect(screen.queryByRole('button', { name: '打开对话 测试练习' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '发起新对话' }))
    await screen.findByText('你好，朋友')

    await act(async () => {
      await useChatStore.getState().selectSession(practiceId)
    })
    await screen.findByText(TEST_QUESTIONS[0].title)

    await waitFor(() => {
      const textarea = screen.getByLabelText('消息内容') as HTMLTextAreaElement
      expect(textarea.value).toBe('我的草稿')
    })

    await waitFor(() => {
      expect(document.querySelector('.chat-messages')?.scrollTop).toBe(123)
    })
  })
})
