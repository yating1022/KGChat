import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { QuickHideOverlay } from '../QuickHideOverlay'

afterEach(() => {
  cleanup()
})

describe('QuickHideOverlay input', () => {
  it('accepts typed text and answers locally', async () => {
    const user = userEvent.setup()
    render(<QuickHideOverlay skin="gemini" branding="official" />)

    const input = screen.getByLabelText('消息内容') as HTMLTextAreaElement
    await user.type(input, '帮我看看这段方案')
    expect(input.value).toBe('帮我看看这段方案')

    await user.keyboard('{Enter}')

    expect(await screen.findByText('帮我看看这段方案')).toBeTruthy()
    expect(input.value).toBe('')
    expect(
      await screen.findByText(/你可以再补充一点背景/, undefined, { timeout: 3000 }),
    ).toBeTruthy()
  })

  it('answers a greeting with a greeting', async () => {
    const user = userEvent.setup()
    render(<QuickHideOverlay skin="chatgpt" branding="official" />)

    const input = screen.getByLabelText('消息内容')
    await user.type(input, '你好')
    await user.keyboard('{Enter}')

    expect(await screen.findByText('你好！有什么可以帮你的？', undefined, { timeout: 3000 })).toBeTruthy()
  })
})
