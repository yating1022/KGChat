import CryptoJS from 'crypto-js'

import { DecodeError } from './errors'

/**
 * SaDuck encrypts some payloads with AES-ECB/PKCS7. WebCrypto intentionally
 * does not expose ECB, so crypto-js is the only browser implementation used
 * here. The 16-character string is a raw UTF-8 key, not a passphrase that
 * should be run through a KDF.
 */

const SOURCE_ID_KEY = 'kxZ17XQ8z6957n3S'

/** Restores the Base64 alphabet after SaDuck's URL-safe transformation. */
export function normalizeBase64(input: string): string {
  return input.replace(/-/g, '+').replace(/_/g, '/')
}

/** Decrypts a Base64 payload with a raw 16-character key and parses JSON. */
export function decryptAesPlain(cipherText: string, key: string): unknown {
  if (!cipherText) {
    throw new DecodeError('加密内容为空，暂时无法解析')
  }

  let text: string
  try {
    const decrypted = CryptoJS.AES.decrypt(normalizeBase64(cipherText), CryptoJS.enc.Utf8.parse(key), {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    })
    text = decrypted.toString(CryptoJS.enc.Utf8)
  } catch (error) {
    throw new DecodeError('加密内容无法解析', { cause: error })
  }

  if (!text) {
    throw new DecodeError('加密内容无法解析，可能是密钥不匹配')
  }

  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new DecodeError('解密后的内容不是有效的 JSON', { cause: error })
  }
}

/** Decrypts the `<16-char key><ciphertext>` format used by word endpoints. */
export function decryptPrefixed(payload: unknown): unknown {
  if (typeof payload !== 'string' || payload.length <= 16) {
    throw new DecodeError('加密内容格式不正确，暂时无法解析')
  }

  return decryptAesPlain(payload.slice(16), payload.slice(0, 16))
}

/** Encrypts a paper `sid` for `/tk/sourceInfo` with the fixed API key. */
export function encryptSourceId(sid: number | string): string {
  const cipher = CryptoJS.AES.encrypt(
    String(sid),
    CryptoJS.enc.Utf8.parse(SOURCE_ID_KEY),
    {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    },
  ).toString()

  return cipher.replace(/\//g, '_').replace(/\+/g, '-')
}
