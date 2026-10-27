import { create } from 'zustand'

import {
  login as loginRequest,
  verify as verifyRequest,
  type LoginInput,
} from '../api/endpoints/auth'
import { AuthError, toUserMessage } from '../api/errors'
import type { AuthProfile } from '../api/types'
import { useSettingsStore } from '../settings/settingsStore'
import {
  clearCredentials,
  saveCredentials,
  type StoredCredentials,
} from './credentialVault'

export const AUTH_STORAGE_KEY = 'saduck.auth'

export type AuthStatus = 'booting' | 'anonymous' | 'authenticated' | 'authenticated-offline'

export interface StoredAuth {
  token: string
  email: string
  vipType: number
  vipStartTime: string | null
  vipEndTime: string | null
}

export interface LoginWithRemember extends LoginInput {
  rememberPassword?: boolean
}

export interface LogoutOptions {
  clearCredentials?: boolean
}

interface AuthState {
  status: AuthStatus
  token: string | null
  profile: AuthProfile | null
  membershipExpired: boolean
  loginPending: boolean
  verifying: boolean
  lastError: string | null
  login(input: LoginWithRemember): Promise<boolean>
  logout(options?: LogoutOptions): Promise<void>
  verify(tokenOverride?: string): Promise<void>
  bootstrap(): Promise<void>
  handleAuthFailure(): void
  handleMembershipExpired(message?: string | null): void
  clearError(): void
}

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined'
}

/** Reads the persisted session. Passwords/tokens from other layers are ignored. */
export function readStoredAuth(): StoredAuth | null {
  if (!storageAvailable()) return null

  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<StoredAuth>
    if (
      typeof parsed.token !== 'string' ||
      !parsed.token ||
      typeof parsed.email !== 'string' ||
      !parsed.email
    ) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }

    return {
      token: parsed.token,
      email: parsed.email,
      vipType: typeof parsed.vipType === 'number' ? parsed.vipType : 0,
      vipStartTime: typeof parsed.vipStartTime === 'string' ? parsed.vipStartTime : null,
      vipEndTime: typeof parsed.vipEndTime === 'string' ? parsed.vipEndTime : null,
    }
  } catch {
    return null
  }
}

function persistAuth(session: StoredAuth | null): void {
  if (!storageAvailable()) return
  try {
    if (session) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  } catch {
    /* Keep the in-memory session if storage is full or blocked. */
  }
}

function profileFromSession(session: StoredAuth): AuthProfile {
  return {
    email: session.email,
    vipType: session.vipType,
    vipStartTime: session.vipStartTime,
    vipEndTime: session.vipEndTime,
  }
}

function sessionFromProfile(profile: AuthProfile, token: string): StoredAuth {
  return {
    token,
    email: profile.email,
    vipType: profile.vipType,
    vipStartTime: profile.vipStartTime,
    vipEndTime: profile.vipEndTime,
  }
}

const initialSession = readStoredAuth()

let bootstrapPromise: Promise<void> | null = null
let authRevision = 0

const nextRevision = () => {
  authRevision += 1
  return authRevision
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: initialSession ? 'booting' : 'anonymous',
  token: initialSession?.token ?? null,
  profile: initialSession ? profileFromSession(initialSession) : null,
  membershipExpired: false,
  loginPending: false,
  verifying: false,
  lastError: null,

  async login(input) {
    set({ loginPending: true, lastError: null })

    try {
      const result = await loginRequest(
        {
          email: input.email,
          password: input.password,
          code: input.code,
          mode: input.mode,
        },
        { baseUrl: useSettingsStore.getState().apiBaseUrl },
      )

      const session = sessionFromProfile(
        {
          email: result.email,
          vipType: result.vipType,
          vipStartTime: result.vipStartTime,
          vipEndTime: result.vipEndTime,
        },
        result.token,
      )

      persistAuth(session)
      nextRevision()
      set({
        status: 'authenticated',
        token: session.token,
        profile: profileFromSession(session),
        membershipExpired: false,
        loginPending: false,
        verifying: false,
        lastError: null,
      })

      await syncRememberedCredentials(
        {
          email: result.email,
          password: input.password ?? '',
        },
        input,
      )

      return true
    } catch (error) {
      set({ loginPending: false, verifying: false, lastError: toUserMessage(error) })
      return false
    }
  },

  async logout(options = {}) {
    const shouldClear = options.clearCredentials ?? true

    nextRevision()
    persistAuth(null)
    set({
      status: 'anonymous',
      token: null,
      profile: null,
      membershipExpired: false,
      verifying: false,
      lastError: null,
    })

    if (shouldClear) {
      await clearCredentials()
    }
  },

  async verify(tokenOverride) {
    const current = get()
    const stored = readStoredAuth()
    const token = tokenOverride ?? current.token ?? stored?.token ?? null

    if (!token) {
      persistAuth(null)
      set({
        status: 'anonymous',
        token: null,
        profile: null,
        membershipExpired: false,
        verifying: false,
        lastError: null,
      })
      return
    }

    set({ verifying: true })

    const revision = authRevision

    try {
      const outcome = await verifyRequest({
        token,
        baseUrl: useSettingsStore.getState().apiBaseUrl,
      })
      if (revision !== authRevision) return

      const nextToken = outcome.profile.token ?? token
      const profile: AuthProfile = {
        email: outcome.profile.email,
        vipType: outcome.profile.vipType,
        vipStartTime: outcome.profile.vipStartTime,
        vipEndTime: outcome.profile.vipEndTime,
      }
      const session = sessionFromProfile(profile, nextToken)

      persistAuth(session)
      set({
        status: 'authenticated',
        token: nextToken,
        profile,
        membershipExpired: outcome.code === 102,
        verifying: false,
        lastError: null,
      })
    } catch (error) {
      if (revision !== authRevision) return

      if (error instanceof AuthError) {
        persistAuth(null)
        set({
          status: 'anonymous',
          token: null,
          profile: null,
          membershipExpired: false,
          verifying: false,
          lastError: '登录状态已失效，请重新登录',
        })
        return
      }

      const offlineProfile = get().profile ?? (stored ? profileFromSession(stored) : null)

      set({
        status: 'authenticated-offline',
        token: get().token ?? stored?.token ?? token,
        profile: offlineProfile,
        verifying: false,
        lastError: toUserMessage(error),
      })
    }
  },

  bootstrap() {
    if (bootstrapPromise) return bootstrapPromise

    bootstrapPromise = get()
      .verify()
      .finally(() => {
        bootstrapPromise = null
      })

    return bootstrapPromise
  },

  handleAuthFailure() {
    nextRevision()
    persistAuth(null)
    set({
      status: 'anonymous',
      token: null,
      profile: null,
      membershipExpired: false,
      verifying: false,
      lastError: '登录状态已失效，请重新登录',
    })
  },

  handleMembershipExpired(message) {
    set({
      membershipExpired: true,
      lastError: message?.trim() || '当前账号的会员状态不可用',
    })
  },

  clearError() {
    set({ lastError: null })
  },
}))

async function syncRememberedCredentials(
  credentials: StoredCredentials,
  input: LoginWithRemember,
): Promise<void> {
  if (!input.rememberPassword) {
    await clearCredentials()
    return
  }

  // Code-mode logins have no password to remember.
  if (input.mode === 'code' || !credentials.password) {
    return
  }

  try {
    await saveCredentials(credentials)
  } catch {
    /* The login itself succeeded; failing to save the password is non-fatal. */
  }
}
