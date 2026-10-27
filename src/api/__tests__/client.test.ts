import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_API_BASE_URL, normalizeBaseUrl, post } from '../client'
import {
  AuthError,
  DecodeError,
  HttpError,
  MembershipError,
  NetworkError,
} from '../errors'

const fetchMock = vi.fn()

function jsonResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }
}

function envelopeBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    code: 0,
    message: '成功',
    timestamp: 0,
    result: { ok: true },
    ...overrides,
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeBaseUrl', () => {
  it('defaults to the SaDuck API', () => {
    expect(normalizeBaseUrl()).toBe(DEFAULT_API_BASE_URL)
    expect(normalizeBaseUrl('  ')).toBe(DEFAULT_API_BASE_URL)
  })

  it('strips trailing slashes and keeps the path', () => {
    expect(normalizeBaseUrl('https://saduck.top/api/')).toBe('https://saduck.top/api')
    expect(normalizeBaseUrl('http://localhost:5173/saduck-api')).toBe(
      'http://localhost:5173/saduck-api',
    )
  })

  it('rejects relative and non-HTTP URLs', () => {
    expect(() => normalizeBaseUrl('/saduck-api')).toThrow(DecodeError)
    expect(() => normalizeBaseUrl('ftp://saduck.top/api')).toThrow(DecodeError)
  })
})

describe('post', () => {
  it('uses the exact token header and never Authorization', async () => {
    fetchMock.mockResolvedValue(jsonResponse(envelopeBody()))

    const result = await post(
      '/user/verify',
      {},
      { token: 'jwt-token', baseUrl: 'https://example.test/api/' },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>

    expect(url).toBe('https://example.test/api/user/verify')
    expect(init.method).toBe('POST')
    expect(headers.token).toBe('jwt-token')
    expect(headers.Authorization).toBeUndefined()
    expect(headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{}')
    expect(result.result).toEqual({ ok: true })
  })

  it('omits the token header when no token is supplied', async () => {
    fetchMock.mockResolvedValue(jsonResponse(envelopeBody()))

    await post('/tk/itemizes?type=1', undefined, { baseUrl: 'https://example.test/api' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.token).toBeUndefined()
    expect(init.body).toBe('{}')
  })

  it('throws AuthError for codes 100 and 101', async () => {
    fetchMock.mockResolvedValue(jsonResponse(envelopeBody({ code: 100 })))
    await expect(post('/user/verify')).rejects.toBeInstanceOf(AuthError)

    fetchMock.mockResolvedValue(jsonResponse(envelopeBody({ code: 101 })))
    await expect(post('/user/verify')).rejects.toBeInstanceOf(AuthError)
  })

  it('throws MembershipError for 102 unless accepted', async () => {
    fetchMock.mockResolvedValue(jsonResponse(envelopeBody({ code: 102, message: '会员过期' })))
    await expect(post('/analyze/addZw')).rejects.toBeInstanceOf(MembershipError)

    fetchMock.mockResolvedValue(
      jsonResponse(envelopeBody({ code: 102, message: '会员过期', result: [{ id: 1 }] })),
    )
    const accepted = await post('/myWord/list', {}, { acceptedCodes: [0, 102] })
    expect(accepted.code).toBe(102)
    expect(accepted.result).toEqual([{ id: 1 }])
  })

  it('throws HttpError for non-2xx responses', async () => {
    fetchMock.mockResolvedValue(jsonResponse('oops', 503))
    await expect(post('/user/login')).rejects.toBeInstanceOf(HttpError)
  })

  it('throws DecodeError for invalid JSON and malformed envelopes', async () => {
    fetchMock.mockResolvedValue(jsonResponse('not json'))
    await expect(post('/user/login')).rejects.toBeInstanceOf(DecodeError)

    fetchMock.mockResolvedValue(jsonResponse(JSON.stringify({ message: 'missing code' })))
    await expect(post('/user/login')).rejects.toBeInstanceOf(DecodeError)
  })

  it('wraps network failures and rethrows aborts untouched', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(post('/user/login')).rejects.toBeInstanceOf(NetworkError)

    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    fetchMock.mockRejectedValue(abortError)
    await expect(post('/user/login')).rejects.toBe(abortError)
  })
})
