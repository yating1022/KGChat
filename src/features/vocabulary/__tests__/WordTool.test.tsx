import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CryptoJS from 'crypto-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ApiClient from '../../../api/client'
import { useAuthStore } from '../../../auth/authStore'
import { resetChatStore, useChatStore } from '../../../chat/chatStore'
import { useSettingsStore } from '../../../settings/settingsStore'
import { WordTool } from '../WordTool'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('../../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClient>()
  return { ...actual, post: postMock }
})

const PREFIX_KEY = 'AbCdEfGh12345678'

function encryptPrefixed(value: unknown): string {
  const cipher = CryptoJS.AES.encrypt(
    JSON.stringify(value),
    CryptoJS.enc.Utf8.parse(PREFIX_KEY),
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
  ).toString()
  return `${PREFIX_KEY}${cipher}`
}

function envelope(result: unknown, code = 0) {
  return { code, message: null, timestamp: 0, result }
}

const termDetail = {
  id: 9001,
  wordType: 2,
  wordContent: '斡旋',
  explanation: '调解争端。',
  pinyin: 'wò xuán',
  similar: '调停',
  opposite: '',
  wordSex: '',
  hot: false,
}

beforeEach(() => {
  postMock.mockReset()
  localStorage.clear()
  resetChatStore()
  useChatStore.getState().createSession()
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

afterEach(() => {
  cleanup()
})

describe('WordTool personal-word detail', () => {
  it('uses the term endpoint for a personal word whose wordType is 2', async () => {
    postMock.mockImplementation(async (path: string) => {
      if (path === '/word/getHWordEncryption') {
        return envelope({ myWordId: [], hword: encryptPrefixed([]) })
      }
      if (path === '/myWord/list') {
        return envelope([{ ...termDetail, createTime: '2026-10-26 10:00:00' }])
      }
      if (path === '/word/getTermsEncryption') {
        return envelope(encryptPrefixed(termDetail))
      }
      return envelope(null)
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const user = userEvent.setup()

    render(
      <QueryClientProvider client={queryClient}>
        <WordTool />
      </QueryClientProvider>,
    )

    const summary = await screen.findByText('生词本')
    await user.click(summary)

    const row = await screen.findByRole('button', { name: /斡旋/ })
    await user.click(row)

    await waitFor(() => {
      expect(
        postMock.mock.calls.some((call) => call[0] === '/word/getTermsEncryption'),
      ).toBe(true)
    })

    const termCall = postMock.mock.calls.find(
      (call) => call[0] === '/word/getTermsEncryption',
    )
    expect(termCall?.[1]).toEqual({ id: 9001 })
    expect(
      postMock.mock.calls.some((call) => call[0] === '/word/getWordEncryption'),
    ).toBe(false)
  })
})
