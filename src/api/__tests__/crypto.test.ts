import CryptoJS from 'crypto-js'
import { describe, expect, it } from 'vitest'

import {
  decryptAesPlain,
  decryptPrefixed,
  encryptSourceId,
  normalizeBase64,
} from '../crypto'
import { DecodeError } from '../errors'

function encryptJson(value: unknown, key: string): string {
  return CryptoJS.AES.encrypt(JSON.stringify(value), CryptoJS.enc.Utf8.parse(key), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  }).toString()
}

describe('encryptSourceId', () => {
  it('matches the documented ciphertext for its actual plaintext', () => {
    // The API reference labels this ciphertext as `encryptParam(19463)`, but
    // decrypting it with the documented key yields 7904460. The algorithm is
    // unambiguous, so the test pins the verifiable pair and records the
    // reference typo in the research notes.
    expect(encryptSourceId(7904460)).toBe('-yhntFjoaMpTJJ8-qLpMyw==')
    expect(decryptAesPlain(encryptSourceId(7904460), 'kxZ17XQ8z6957n3S')).toBe(7904460)
  })

  it('is reversible with the fixed source-info key', () => {
    const cipher = encryptSourceId(19463)
    expect(decryptAesPlain(cipher, 'kxZ17XQ8z6957n3S')).toBe(19463)
  })
})

describe('decryptAesPlain', () => {
  it('decrypts an AES-ECB/PKCS7 JSON payload', () => {
    const key = '7SyqrN6925ZYb636'
    const cipher = encryptJson([{ id: 1, title: '国考' }], key)
    expect(decryptAesPlain(cipher, key)).toEqual([{ id: 1, title: '国考' }])
  })

  it('normalizes URL-safe Base64 characters', () => {
    const key = 'kxZ17XQ8z6957n3S'
    // The source-id cipher is documented with `-` and `_` substitutions.
    const cipher = encryptSourceId(19463)
    expect(cipher).toContain('-')
    expect(normalizeBase64(cipher)).toContain('+')
    expect(decryptAesPlain(cipher, key)).toBe(19463)
  })

  it('throws a DecodeError for undecryptable input', () => {
    expect(() => decryptAesPlain('not-a-cipher', 'kxZ17XQ8z6957n3S')).toThrow(DecodeError)
  })

  it('throws a DecodeError when the plaintext is not JSON', () => {
    const key = 'kxZ17XQ8z6957n3S'
    const cipher = CryptoJS.AES.encrypt('plain text', CryptoJS.enc.Utf8.parse(key), {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    }).toString()

    expect(() => decryptAesPlain(cipher, key)).toThrow(DecodeError)
  })
})

describe('decryptPrefixed', () => {
  it('uses the first 16 characters as the key', () => {
    const key = 'abcdefghijklmnop'
    const payload = key + encryptJson({ ok: true }, key)
    expect(decryptPrefixed(payload)).toEqual({ ok: true })
  })

  it('rejects a payload without a key prefix', () => {
    expect(() => decryptPrefixed('short')).toThrow(DecodeError)
    expect(() => decryptPrefixed(123)).toThrow(DecodeError)
  })
})
