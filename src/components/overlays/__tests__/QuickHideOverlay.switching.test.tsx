import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }))

vi.mock('idb-keyval', () => ({
  get: async (key: string) => store.get(key),
  set: async (key: string, value: unknown) => {
    store.set(key, value)
  },
  del: async (key: string) => {
    store.delete(key)
  },
  keys: async () => [...store.keys()],
}))

import { importHistoryJson } from '../../../chat/historyTransfer'
import { QuickHideOverlay } from '../QuickHideOverlay'

beforeEach(() => {
  store.clear()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('QuickHideOverlay switching', () => {
  it('switches between imported conversations from the rail', async () => {
    const user = userEvent.setup()

    await importHistoryJson(
      JSON.stringify({
        format: 'gemini-voyager.chat.v1',
        title: '第一段',
        items: [{ user: 'a', assistant: '第一段回复' }],
      }),
    )
    await importHistoryJson(
      JSON.stringify({
        format: 'gemini-voyager.chat.v1',
        title: '第二段',
        items: [{ user: 'b', assistant: '第二段回复' }],
      }),
    )

    render(<QuickHideOverlay skin="gemini" branding="official" />)

    // The newest import opens by default.
    expect(await screen.findByText('第二段回复')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '打开对话 第一段' }))

    expect(await screen.findByText('第一段回复')).toBeTruthy()
    expect(screen.queryByText('第二段回复')).toBeNull()
  })

  it('keeps typed messages per conversation', async () => {
    const user = userEvent.setup()

    await importHistoryJson(
      JSON.stringify({
        format: 'gemini-voyager.chat.v1',
        title: '第一段',
        items: [{ user: 'a', assistant: '第一段回复' }],
      }),
    )
    await importHistoryJson(
      JSON.stringify({
        format: 'gemini-voyager.chat.v1',
        title: '第二段',
        items: [{ user: 'b', assistant: '第二段回复' }],
      }),
    )

    render(<QuickHideOverlay skin="gemini" branding="official" />)
    await screen.findByText('第二段回复')

    const input = screen.getByLabelText('消息内容')
    await user.type(input, '临时问题')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('临时问题')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '打开对话 第一段' }))
    await screen.findByText('第一段回复')
    expect(screen.queryByText('临时问题')).toBeNull()

    await user.click(screen.getByRole('button', { name: '打开对话 第二段' }))
    expect(await screen.findByText('临时问题')).toBeTruthy()
  })
})
