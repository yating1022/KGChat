import { del, get, set } from 'idb-keyval'

/**
 * Local credential vault.
 *
 * The API token is never stored here; it lives in its own auth storage. Only
 * the optional "remember password" payload is encrypted with AES-GCM using a
 * non-extractable key kept in IndexedDB. This protects against casual
 * inspection of localStorage, not against XSS or a compromised browser profile.
 */

const VAULT_KEY_ID = 'vault-key'
export const VAULT_STORAGE_KEY = 'saduck.vault'

export interface StoredCredentials {
  email: string
  password: string
}

interface VaultRecord {
  version: 1
  iv: string
  ciphertext: string
  savedAt: number
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = await get<CryptoKey>(VAULT_KEY_ID)
  if (existing) return existing

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])

  if (!('algorithm' in key)) {
    throw new Error('本地加密密钥生成失败')
  }

  await set(VAULT_KEY_ID, key)
  return key
}

function readRecord(): VaultRecord | null {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<VaultRecord>
    if (
      parsed.version !== 1 ||
      typeof parsed.iv !== 'string' ||
      typeof parsed.ciphertext !== 'string'
    ) {
      localStorage.removeItem(VAULT_STORAGE_KEY)
      return null
    }
    return {
      version: 1,
      iv: parsed.iv,
      ciphertext: parsed.ciphertext,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    }
  } catch {
    return null
  }
}

async function discardVault(): Promise<void> {
  try {
    localStorage.removeItem(VAULT_STORAGE_KEY)
  } catch {
    /* Storage can be unavailable in private mode; nothing else to do. */
  }
  try {
    await del(VAULT_KEY_ID)
  } catch {
    /* IndexedDB may be unavailable; the ciphertext is already gone. */
  }
}

/** Encrypts the email/password pair. Never call this with a token. */
export async function saveCredentials(credentials: StoredCredentials): Promise<void> {
  const key = await getOrCreateKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)

  const record: VaultRecord = {
    version: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    savedAt: Date.now(),
  }

  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(record))
}

/**
 * Non-secret status check for settings. Never decrypts the vault and never
 * returns the email or password itself.
 */
export function hasSavedCredentials(): boolean {
  return readRecord() !== null
}

/** Decrypts saved credentials for login-form prefill only. */
export async function loadCredentials(): Promise<StoredCredentials | null> {
  const record = readRecord()
  if (!record) return null

  try {
    const key = await get<CryptoKey>(VAULT_KEY_ID)
    if (!key) {
      await discardVault()
      return null
    }

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(record.iv) },
      key,
      base64ToBytes(record.ciphertext),
    )
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as StoredCredentials).email === 'string' &&
      typeof (parsed as StoredCredentials).password === 'string'
    ) {
      return {
        email: (parsed as StoredCredentials).email,
        password: (parsed as StoredCredentials).password,
      }
    }

    await discardVault()
    return null
  } catch {
    await discardVault()
    return null
  }
}

/** Removes both the ciphertext and the non-extractable key. */
export async function clearCredentials(): Promise<void> {
  await discardVault()
}
