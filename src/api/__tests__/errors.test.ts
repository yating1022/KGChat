import { describe, expect, it } from 'vitest'

import {
  ApiError,
  AuthError,
  DecodeError,
  HttpError,
  MembershipError,
  NetworkError,
  assertAcceptedCodes,
  redactSensitive,
  toUserMessage,
} from '../errors'

describe('assertAcceptedCodes', () => {
  it('accepts code 0 by default', () => {
    expect(() => assertAcceptedCodes({ code: 0, message: '成功' })).not.toThrow()
  })

  it('maps 100 and 101 to AuthError', () => {
    expect(() => assertAcceptedCodes({ code: 100 })).toThrow(AuthError)
    expect(() => assertAcceptedCodes({ code: 101, message: '请先登录' })).toThrow(AuthError)
  })

  it('maps 102 to MembershipError', () => {
    expect(() => assertAcceptedCodes({ code: 102, message: '需要会员' })).toThrow(
      MembershipError,
    )
  })

  it('allows 102 when explicitly accepted', () => {
    expect(() =>
      assertAcceptedCodes({ code: 102, message: '会员已过期' }, [0, 102]),
    ).not.toThrow()
  })

  it('maps other non-zero codes to ApiError with the API message', () => {
    try {
      assertAcceptedCodes({ code: 1, message: '参数错误' })
      expect.unreachable('expected an ApiError')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).code).toBe(1)
      expect((error as ApiError).message).toBe('参数错误')
    }
  })

  it('falls back to neutral copy when the API message is empty', () => {
    expect(() => assertAcceptedCodes({ code: 1, message: null })).toThrow(ApiError)
  })
})

describe('redactSensitive', () => {
  it('removes tokens, passwords, and codes from query strings', () => {
    const input =
      'GET /user?token=eyJhbGciOi.eyJzdWIi.sig&password=hunter2&code=1234&keep=yes'
    const output = redactSensitive(input)

    expect(output).not.toContain('hunter2')
    expect(output).not.toContain('1234')
    expect(output).not.toContain('eyJhbGciOi')
    expect(output).toContain('keep=yes')
  })

  it('removes secrets from JSON fragments', () => {
    const input = '{"email":"a@b.c","password":"hunter2","token":"abc"}'
    const output = redactSensitive(input)

    expect(output).not.toContain('hunter2')
    expect(output).not.toContain('"abc"')
    expect(output).toContain('[redacted]')
  })
})

describe('toUserMessage', () => {
  it('returns conversational Chinese copy for each error class', () => {
    expect(toUserMessage(new AuthError(100))).toBe('登录状态已失效，请重新登录')
    expect(toUserMessage(new MembershipError('会员已过期'))).toBe('会员已过期')
    expect(toUserMessage(new NetworkError())).toContain('网络')
    expect(toUserMessage(new DecodeError('内容无法解析'))).toBe('内容无法解析')
    expect(toUserMessage(new HttpError(503))).toContain('服务')
    expect(toUserMessage(new ApiError(1, '密码错误'))).toBe('密码错误')
    expect(toUserMessage(new Error('boom'))).toBe('出了点问题，请稍后再试')
  })

  it('redacts secrets that appear in API messages', () => {
    const message = toUserMessage(new ApiError(1, 'token=secret-token-value'))
    expect(message).not.toContain('secret-token-value')
  })
})
