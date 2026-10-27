import { beforeEach, describe, expect, it, vi } from 'vitest'

const { idbStore } = vi.hoisted(() => ({
  idbStore: new Map<string, unknown>(),
}))

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idbStore.set(key, value)
  }),
  del: vi.fn(async (key: string) => {
    idbStore.delete(key)
  }),
}))

import {
  VAULT_STORAGE_KEY,
  clearCredentials,
  hasSavedCredentials,
  loadCredentials,
  saveCredentials,
} from '../credentialVault'

const CREDENTIALS = {
  email: 'user@example.com',
  password: 'correct horse battery staple',
}

beforeEach(() => {
  localStorage.clear()
  idbStore.clear()
})

describe('credentialVault', () => {
  it('returns null when nothing is stored', async () => {
    await expect(loadCredentials()).resolves.toBeNull()
  })

  it('round-trips credentials and stores only ciphertext', async () => {
    await saveCredentials(CREDENTIALS)

    const raw = localStorage.getItem(VAULT_STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(raw).not.toContain(CREDENTIALS.email)
    expect(raw).not.toContain(CREDENTIALS.password)

    const record = JSON.parse(raw ?? '{}') as Record<string, unknown>
    expect(record.version).toBe(1)
    expect(typeof record.iv).toBe('string')
    expect(typeof record.ciphertext).toBe('string')
    expect(typeof record.savedAt).toBe('number')

    await expect(loadCredentials()).resolves.toEqual(CREDENTIALS)
  })

  it('exposes a non-secret saved-credentials check', async () => {
    expect(hasSavedCredentials()).toBe(false)

    await saveCredentials(CREDENTIALS)
    expect(hasSavedCredentials()).toBe(true)

    await clearCredentials()
    expect(hasSavedCredentials()).toBe(false)
  })

  it('keeps the AES-GCM key non-extractable in IndexedDB', async () => {
    await saveCredentials(CREDENTIALS)

    const key = idbStore.get('vault-key') as CryptoKey | undefined
    expect(key).toBeDefined()
    expect(key?.extractable).toBe(false)
    expect(key?.algorithm.name).toBe('AES-GCM')
  })

  it('clears both the ciphertext and the key on sign-out', async () => {
    await saveCredentials(CREDENTIALS)
    await clearCredentials()

    expect(localStorage.getItem(VAULT_STORAGE_KEY)).toBeNull()
    expect(idbStore.has('vault-key')).toBe(false)
    await expect(loadCredentials()).resolves.toBeNull()
  })

  it('discards a corrupt vault record without throwing', async () => {
    localStorage.setItem(
      VAULT_STORAGE_KEY,
      JSON.stringify({ version: 1, iv: 'bad iv', ciphertext: 'bad ciphertext', savedAt: 1 }),
    )

    await expect(loadCredentials()).resolves.toBeNull()
    expect(localStorage.getItem(VAULT_STORAGE_KEY)).toBeNull()
  })

  it('discards ciphertext when the key is missing', async () => {
    await saveCredentials(CREDENTIALS)
    idbStore.delete('vault-key')

    await expect(loadCredentials()).resolves.toBeNull()
    expect(localStorage.getItem(VAULT_STORAGE_KEY)).toBeNull()
  })
})
