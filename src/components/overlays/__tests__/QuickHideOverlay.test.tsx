import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { isDecoySafeChat, QuickHideOverlay } from '../QuickHideOverlay'

afterEach(() => {
  cleanup()
})

describe('QuickHideOverlay fallback', () => {
  it('renders a neutral empty chat when nothing has been imported', () => {
    const { container } = render(<QuickHideOverlay skin="gemini" branding="official" />)

    expect(screen.getByRole('region', { name: '对话' })).toBeTruthy()
    expect(screen.getByText('发起新对话')).toBeTruthy()
    expect(screen.getByText('有什么可以帮你？')).toBeTruthy()
    expect(container.textContent).not.toContain('无法')
    expect(container.textContent).not.toContain('错误')
  })

  it('rejects conversations that contain quiz UI', () => {
    const base = {
      id: 'chat',
      title: '周末闲聊',
      createdAt: 1,
      updatedAt: 1,
      messages: [
        { id: 'm1', role: 'user' as const, kind: 'text' as const, content: 'hi', createdAt: 1 },
        {
          id: 'm2',
          role: 'assistant' as const,
          kind: 'text' as const,
          content: 'hello',
          createdAt: 2,
        },
      ],
      draft: '',
      scrollTop: 0,
      mode: 'chat' as const,
      origin: 'import' as const,
    }

    expect(isDecoySafeChat(base)).toBe(true)
    expect(
      isDecoySafeChat({
        ...base,
        messages: [
          ...base.messages,
          {
            id: 'm3',
            role: 'assistant' as const,
            kind: 'tool' as const,
            tool: 'practice' as const,
            createdAt: 3,
          },
        ],
      }),
    ).toBe(false)
    expect(isDecoySafeChat({ ...base, mode: 'practice' as const })).toBe(false)
  })
})
