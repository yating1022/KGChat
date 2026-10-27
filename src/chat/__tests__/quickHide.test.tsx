import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../../app/App'
import { useAuthStore } from '../../auth/authStore'
import { useChatStore, resetChatStore } from '../../chat/chatStore'
import { importHistoryJson } from '../../chat/historyTransfer'
import { useSettingsStore } from '../../settings/settingsStore'
import { TEST_PRACTICE_START, TEST_QUESTIONS } from '../../test/fixtures'

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
  await screen.findByRole('heading', { level: 1 })
  act(() => useChatStore.getState().startPractice(TEST_PRACTICE_START))
  await screen.findByText(TEST_QUESTIONS[0].title)
}

function pressEscapeTwice() {
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.keyDown(window, { key: 'Escape' })
}

async function openDecoy() {
  pressEscapeTwice()
  return screen.findByRole('region', { name: '对话' })
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

describe('quick hide', () => {
  it('shows the imported conversation, keeps quiz content out, and restores the session', async () => {
    const user = userEvent.setup()
    const view = renderApp()
    await startFixturePractice()

    await importHistoryJson(
      JSON.stringify({
        format: 'gemini-voyager.chat.v1',
        title: '周末闲聊',
        items: [{ user: 'hello，你好', assistant: 'Hello！你好呀！😊' }],
      }),
    )

    const composer = screen.getByLabelText('消息内容') as HTMLTextAreaElement
    await user.type(composer, '还没发送的草稿')
    composer.focus()

    const overlay = await openDecoy()
    const shell = view.container.querySelector('.app-shell') as HTMLElement

    expect(screen.getAllByText('周末闲聊').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Hello！你好呀！😊').length).toBeGreaterThan(0)

    expect(overlay.textContent).not.toContain(TEST_QUESTIONS[0].title)
    expect(overlay.textContent).not.toContain('一如既往')
    expect(overlay.textContent).not.toContain('还没发送的草稿')
    expect(overlay.textContent).not.toContain('测试练习')
    expect(shell.getAttribute('aria-hidden')).toBe('true')
    expect(shell.hasAttribute('inert')).toBe(true)
    expect(document.title).toBe('Gemini')

    await waitFor(() => expect(document.activeElement).toBe(overlay))

    pressEscapeTwice()

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: '对话' })).toBeNull()
    })
    expect(shell.hasAttribute('inert')).toBe(false)
    expect(shell.getAttribute('aria-hidden')).toBeNull()
    expect(composer.value).toBe('还没发送的草稿')
    expect(screen.getByText(TEST_QUESTIONS[0].title)).toBeTruthy()
  })

  it('shows the same imported list for the ChatGPT skin', async () => {
    useSettingsStore.getState().setSkin('chatgpt')
    renderApp()
    await startFixturePractice()

    await importHistoryJson(
      JSON.stringify({
        format: 'gemini-voyager.chat.v1',
        title: '问候交流',
        items: [{ user: 'hello，你好', assistant: 'Hello！你好呀！😊' }],
      }),
    )

    const overlay = await openDecoy()

    expect(screen.getAllByText('问候交流').length).toBeGreaterThan(0)
    expect(overlay.textContent).toMatch(/Hello！你好呀/)
    expect(overlay.textContent).not.toContain(TEST_QUESTIONS[0].title)
    expect(document.title).toBe('ChatGPT')
  })

  it('does nothing when the setting is disabled', async () => {
    useSettingsStore.getState().setQuickHideEnabled(false)
    renderApp()
    await startFixturePractice()

    pressEscapeTwice()

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: '对话' })).toBeNull()
    })
  })

  it('lets Escape close a dialog without triggering quick hide', async () => {
    renderApp()
    await startFixturePractice()

    useChatStore.getState().openSettings('appearance')
    await screen.findByRole('dialog', { name: '设置' })

    pressEscapeTwice()

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '设置' })).toBeNull()
    })
    expect(screen.queryByRole('region', { name: '对话' })).toBeNull()
  })
})
