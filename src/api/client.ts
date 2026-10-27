import {
  DecodeError,
  HttpError,
  NetworkError,
  assertAcceptedCodes,
  isAbortError,
} from './errors'

export interface ApiEnvelope<T> {
  code: number
  message: string | null
  timestamp: number
  result: T
}

/** A caller-supplied transport context. The API never reads UI state itself. */
export interface ApiContext {
  baseUrl?: string
  token?: string | null
  signal?: AbortSignal
}

export interface PostOptions extends ApiContext {
  /** Business codes the caller wants to handle itself, e.g. `[0, 102]`. */
  acceptedCodes?: readonly number[]
}

export const DEFAULT_API_BASE_URL = 'https://saduck.top/api'

/**
 * Validates and normalizes the configured API base URL. Only absolute HTTP(S)
 * origins are accepted so a typo cannot silently post credentials elsewhere.
 */
export function normalizeBaseUrl(value?: string | null): string {
  const candidate = value?.trim() || DEFAULT_API_BASE_URL

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new DecodeError('服务地址无效，请检查设置')
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new DecodeError('服务地址必须以 http:// 或 https:// 开头')
  }

  return candidate.replace(/\/+$/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * POSTs a JSON body to the SaDuck API and returns the business envelope.
 * Authentication uses the exact `token` header, never `Authorization`.
 */
export async function post<T>(
  path: string,
  body: unknown = {},
  options: PostOptions = {},
): Promise<ApiEnvelope<T>> {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (options.token) {
    headers.token = options.token
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body ?? {}),
      signal: options.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new NetworkError('网络似乎断开了，请检查网络后重试', { cause: error })
  }

  if (!response.ok) {
    throw new HttpError(response.status)
  }

  let parsed: unknown
  try {
    const text = await response.text()
    parsed = text ? JSON.parse(text) : null
  } catch (error) {
    throw new DecodeError('接口返回的内容不是有效的 JSON', { cause: error })
  }

  if (!isRecord(parsed) || typeof parsed.code !== 'number') {
    throw new DecodeError('接口返回格式不正确')
  }

  const envelope: ApiEnvelope<T> = {
    code: parsed.code,
    message: typeof parsed.message === 'string' ? parsed.message : null,
    timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : 0,
    result: parsed.result as T,
  }

  assertAcceptedCodes(envelope, options.acceptedCodes ?? [0])
  return envelope
}

/** Builds transport options from an endpoint context. */
export function postOptions(
  context: ApiContext = {},
  acceptedCodes?: readonly number[],
): PostOptions {
  return {
    baseUrl: context.baseUrl,
    token: context.token,
    signal: context.signal,
    ...(acceptedCodes ? { acceptedCodes } : {}),
  }
}
