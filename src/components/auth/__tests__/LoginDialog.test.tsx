import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '../../../auth/authStore'
import { LoginDialog } from '../LoginDialog'

beforeEach(() => {
  localStorage.clear()
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

afterEach(() => {
  cleanup()
})

describe('LoginDialog privacy', () => {
  it('does not keep a typed password in memory after the dialog closes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(<LoginDialog open onClose={onClose} skin="gemini" />)

    const password = screen.getByLabelText('密码') as HTMLInputElement
    await user.type(password, 'only-in-the-form')
    expect(password.value).toBe('only-in-the-form')

    rerender(<LoginDialog open={false} onClose={onClose} skin="gemini" />)
    rerender(<LoginDialog open onClose={onClose} skin="gemini" />)

    await waitFor(() => {
      expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe('')
    })
  })
})
