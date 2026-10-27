import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as AuthEndpoints from '../../api/endpoints/auth'
import { AuthError, MembershipError, NetworkError } from '../../api/errors'
import { handleQueryError } from '../queryErrorHandler'

const { verifyMock, loginMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  loginMock: vi.fn(),
}))

vi.mock('../../api/endpoints/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthEndpoints>()
  return { ...actual, verify: verifyMock, login: loginMock }
})

import { AUTH_STORAGE_KEY, useAuthStore } from '../authStore'

const PROFILE = {
  email: 'learner@example.test',
  vipType: 1,
  vipStartTime: null,
  vipEndTime: '2027-01-01',
}

function storeStoredToken(token: string) {
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      token,
      email: PROFILE.email,
      vipType: 1,
      vipStartTime: null,
      vipEndTime: PROFILE.vipEndTime,
    }),
  )
}

function setAuthenticated(token = 'old-token') {
  useAuthStore.setState({
    status: 'authenticated',
    token,
    profile: { ...PROFILE },
    membershipExpired: false,
    loginPending: false,
    verifying: false,
    lastError: null,
  })
}

beforeEach(() => {
  localStorage.clear()
  verifyMock.mockReset()
  loginMock.mockReset()
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

describe('auth lifecycle', () => {
  it('persists a rotated token returned by /user/verify', async () => {
    storeStoredToken('old-token')
    setAuthenticated('old-token')
    verifyMock.mockResolvedValue({
      profile: { ...PROFILE, token: 'rotated-token' },
      code: 0,
    })

    await useAuthStore.getState().verify()

    const state = useAuthStore.getState()
    expect(state.status).toBe('authenticated')
    expect(state.token).toBe('rotated-token')
    expect(state.verifying).toBe(false)
    expect(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? '{}')).toMatchObject({
      token: 'rotated-token',
    })
  })

  it('clears the token and returns to anonymous on 100/101', async () => {
    storeStoredToken('old-token')
    setAuthenticated('old-token')
    verifyMock.mockRejectedValue(new AuthError(101))

    await useAuthStore.getState().verify()

    const state = useAuthStore.getState()
    expect(state.status).toBe('anonymous')
    expect(state.token).toBeNull()
    expect(state.profile).toBeNull()
    expect(state.lastError).toContain('登录状态已失效')
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('keeps the session and marks membership expired on code 102', async () => {
    storeStoredToken('old-token')
    setAuthenticated('old-token')
    verifyMock.mockResolvedValue({ profile: { ...PROFILE }, code: 102 })

    await useAuthStore.getState().verify()

    const state = useAuthStore.getState()
    expect(state.status).toBe('authenticated')
    expect(state.token).toBe('old-token')
    expect(state.membershipExpired).toBe(true)
  })

  it('stays signed in offline when verification fails on the network', async () => {
    storeStoredToken('old-token')
    setAuthenticated('old-token')
    verifyMock.mockRejectedValue(new NetworkError())

    await useAuthStore.getState().verify()

    const state = useAuthStore.getState()
    expect(state.status).toBe('authenticated-offline')
    expect(state.token).toBe('old-token')
    expect(state.lastError).toContain('网络')
  })

  it('does not call the API when no token exists', async () => {
    await useAuthStore.getState().verify()

    expect(verifyMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().status).toBe('anonymous')
  })
})

describe('background query auth errors', () => {
  it('clears the token when a list query reports 100/101', () => {
    storeStoredToken('old-token')
    setAuthenticated('old-token')

    handleQueryError(new AuthError(100))

    expect(useAuthStore.getState().status).toBe('anonymous')
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('marks membership expired when a list query reports 102', () => {
    setAuthenticated('old-token')

    handleQueryError(new MembershipError('会员已过期'))

    expect(useAuthStore.getState().membershipExpired).toBe(true)
    expect(useAuthStore.getState().lastError).toBe('会员已过期')
  })

  it('leaves unrelated query errors to the inline picker copy', () => {
    setAuthenticated('old-token')

    handleQueryError(new Error('network hiccup'))

    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().membershipExpired).toBe(false)
  })
})
