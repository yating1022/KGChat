/**
 * Typed transport and decode errors shared by every API call.
 *
 * The API returns a business `code` inside a successful HTTP envelope, so a
 * non-zero business code is not an HTTP failure. These classes keep the two
 * layers separate for callers and for conversational error notices.
 */

export class ApiError extends Error {
  readonly code: number

  constructor(code: number, message: string, options?: ErrorOptions) {
    super(message || '请求没有成功', options)
    this.name = 'ApiError'
    this.code = code
  }
}

export class AuthError extends ApiError {
  constructor(code: number, message = '登录状态已失效', options?: ErrorOptions) {
    super(code, message, options)
    this.name = 'AuthError'
  }
}

export class MembershipError extends ApiError {
  constructor(message = '当前账号的会员状态不可用', options?: ErrorOptions) {
    super(102, message, options)
    this.name = 'MembershipError'
  }
}

export class HttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`请求失败（HTTP ${status}）`)
    this.name = 'HttpError'
    this.status = status
  }
}

export class DecodeError extends Error {
  constructor(message = '这条内容暂时无法解析', options?: ErrorOptions) {
    super(message, options)
    this.name = 'DecodeError'
  }
}

export class NetworkError extends Error {
  constructor(message = '网络似乎断开了，请检查网络后重试', options?: ErrorOptions) {
    super(message, options)
    this.name = 'NetworkError'
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g
const JSON_SECRET_PATTERN =
  /("(?:password|passwd|token|authorization|code)"\s*:\s*")[^"]*(")/gi
const QUERY_SECRET_PATTERN = /((?:password|passwd|token|authorization|code)=)[^&\s]+/gi

/**
 * Removes tokens, passwords, email codes, and Authorization values from any
 * text that might reach a log or an error report.
 */
export function redactSensitive(input: string): string {
  return input
    .replace(JWT_PATTERN, '[redacted]')
    .replace(JSON_SECRET_PATTERN, '$1[redacted]$2')
    .replace(QUERY_SECRET_PATTERN, '$1[redacted]')
}

export interface EnvelopeStatus {
  code: number
  message?: string | null
}

/**
 * Throws the typed error for a rejected envelope, unless the caller explicitly
 * accepted that code (for example 102 on data-bearing endpoints).
 */
export function assertAcceptedCodes(
  envelope: EnvelopeStatus,
  acceptedCodes: readonly number[] = [0],
): void {
  if (acceptedCodes.includes(envelope.code)) return

  const message = envelope.message ? redactSensitive(envelope.message) : ''

  if (envelope.code === 100 || envelope.code === 101) {
    throw new AuthError(envelope.code, message || '登录状态已失效，请重新登录')
  }

  if (envelope.code === 102) {
    throw new MembershipError(message || '当前账号的会员状态不可用')
  }

  throw new ApiError(envelope.code, message || '请求没有成功，请稍后再试')
}

/** Converts any thrown value into skin-neutral Chinese copy for the UI. */
export function toUserMessage(error: unknown): string {
  if (error instanceof DecodeError) return error.message
  if (error instanceof NetworkError) return error.message
  if (error instanceof AuthError) return '登录状态已失效，请重新登录'
  if (error instanceof MembershipError) {
    return redactSensitive(error.message) || '当前账号的会员状态不可用'
  }
  if (error instanceof HttpError) return '服务暂时不可用，请稍后再试'
  if (error instanceof ApiError) {
    return redactSensitive(error.message) || '请求没有成功，请稍后再试'
  }
  return '出了点问题，请稍后再试'
}
