import { post, postOptions, type ApiContext } from '../client'
import { AuthError } from '../errors'
import {
  loginResultSchema,
  parseWith,
  verifyResultSchema,
  type LoginResult,
  type VerifyResult,
} from '../types'

export type LoginMode = 'password' | 'code'

export interface LoginInput {
  email: string
  password?: string
  code?: string
  mode?: LoginMode
}

export interface LoginRequestBody {
  email: string
  password: string
  code: string
  sign: string
  k: string
}

export interface VerifyOutcome {
  profile: VerifyResult
  code: number
}

/** The API expects a random 10-digit string; it carries no server meaning. */
export function createSign(): string {
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  return String(random[0] % 10_000_000_000).padStart(10, '0')
}

export function buildLoginBody(input: LoginInput): LoginRequestBody {
  const mode = input.mode ?? 'password'
  return {
    email: input.email.trim(),
    password: mode === 'password' ? (input.password ?? '') : '',
    code: mode === 'code' ? (input.code ?? '') : '',
    sign: createSign(),
    k: '',
  }
}

export async function login(input: LoginInput, context: ApiContext = {}): Promise<LoginResult> {
  const envelope = await post<unknown>(
    '/user/login',
    buildLoginBody(input),
    postOptions({ baseUrl: context.baseUrl, signal: context.signal }),
  )
  return parseWith(loginResultSchema, envelope.result, '登录结果')
}

/**
 * Validates the stored token. Codes 0 and 102 both mean the session is valid;
 * 102 additionally means the membership has expired.
 */
export async function verify(context: ApiContext): Promise<VerifyOutcome> {
  if (!context.token) {
    throw new AuthError(100, '登录状态已失效，请重新登录')
  }

  const envelope = await post<unknown>(
    '/user/verify',
    {},
    postOptions(context, [0, 102]),
  )

  return {
    profile: parseWith(verifyResultSchema, envelope.result, '登录状态'),
    code: envelope.code,
  }
}

/** Sends the 4-digit email code used by the code-login mode. */
export async function sendEmailCode(email: string, context: ApiContext = {}): Promise<void> {
  await post('/code/register', { email: email.trim() }, postOptions(context))
}
