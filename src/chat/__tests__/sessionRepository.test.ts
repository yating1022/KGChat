import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatSession } from '../chatTypes'
import {
  ACTIVE_SESSION_KEY,
  MAX_SESSION_HISTORY,
  SESSION_INDEX_KEY,
  clearSessions,
  deleteSession,
  loadSession,
  loadSessions,
  readActiveSessionId,
  saveSession,
  writeActiveSessionId,
  writeSessionIndex,
} from '../sessionRepository'

const { memory } = vi.hoisted(() => ({
  memory: new Map<string, unknown>(),
}))

vi.mock('idb-keyval', () => ({
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: unknown) => {
    memory.set(key, value)
  },
  del: async (key: string) => {
    memory.delete(key)
  },
  keys: async () => [...memory.keys()],
}))

function makeSession(id: string, updatedAt = Date.now(), patch: Partial<ChatSession> = {}): ChatSession {
  return {
    id,
    title: '一组练习',
    createdAt: updatedAt,
    updatedAt,
    messages: [],
    draft: '',
    scrollTop: 0,
    mode: 'practice',
    ...patch,
  }
}

beforeEach(() => {
  memory.clear()
  localStorage.clear()
})

describe('sessionRepository', () => {
  it('stores and restores draft and scroll position', async () => {
    const session = makeSession('s1', 10, { draft: '还没发送的草稿', scrollTop: 320 })

    const result = await saveSession(session)
    expect(result.ok).toBe(true)

    const stored = memory.get('session:s1') as { schemaVersion: number }
    expect(stored.schemaVersion).toBe(1)

    const restored = await loadSession('s1')
    expect(restored?.draft).toBe('还没发送的草稿')
    expect(restored?.scrollTop).toBe(320)
    expect(restored?.title).toBe('一组练习')
  })

  it('writes a capped local index newest first', async () => {
    await saveSession(makeSession('old', 1))
    await saveSession(makeSession('new', 2))

    const index = JSON.parse(localStorage.getItem(SESSION_INDEX_KEY) ?? '[]') as Array<{
      id: string
    }>
    expect(index.map((item) => item.id)).toEqual(['new', 'old'])
  })

  it('caps history at 100 sessions and removes the oldest payload', async () => {
    for (let index = 0; index < MAX_SESSION_HISTORY + 5; index += 1) {
      await saveSession(makeSession(`s${index}`, index + 1))
    }

    const storedIndex = JSON.parse(localStorage.getItem(SESSION_INDEX_KEY) ?? '[]') as Array<{
      id: string
    }>

    expect(storedIndex).toHaveLength(MAX_SESSION_HISTORY)
    expect(storedIndex[0].id).toBe(`s${MAX_SESSION_HISTORY + 4}`)
    expect(memory.has('session:s0')).toBe(false)
    expect(memory.has(`session:s${MAX_SESSION_HISTORY + 4}`)).toBe(true)
  })

  it('skips and deletes sessions with an unknown schema version', async () => {
    writeSessionIndex([{ id: 'bad', title: '旧会话', updatedAt: 1 }])
    memory.set('session:bad', { schemaVersion: 99, session: makeSession('bad', 1) })

    const loaded = await loadSession('bad')
    expect(loaded).toBeNull()
    expect(memory.has('session:bad')).toBe(false)
    expect(localStorage.getItem(SESSION_INDEX_KEY)).toBe('[]')
  })

  it('skips structurally invalid sessions instead of throwing', async () => {
    writeSessionIndex([
      { id: 'bad', title: '坏会话', updatedAt: 2 },
      { id: 'good', title: '好会话', updatedAt: 1 },
    ])
    memory.set('session:bad', {
      schemaVersion: 1,
      session: { id: 'bad', title: '坏会话', messages: 'nope' },
    })
    memory.set('session:good', {
      schemaVersion: 1,
      session: makeSession('good', 1),
    })

    const result = await loadSessions()

    expect(result.skipped).toBe(1)
    expect(result.sessions.map((session) => session.id)).toEqual(['good'])
    expect(result.summaries.map((summary) => summary.id)).toEqual(['good'])
  })

  it('deletes a session and clears the active pointer', async () => {
    await saveSession(makeSession('s1', 1))
    writeActiveSessionId('s1')
    expect(readActiveSessionId()).toBe('s1')

    await deleteSession('s1')

    expect(memory.has('session:s1')).toBe(false)
    expect(readActiveSessionId()).toBeNull()
    expect(await loadSession('s1')).toBeNull()
  })

  it('clears every session without touching unrelated keys', async () => {
    await saveSession(makeSession('s1', 1))
    await saveSession(makeSession('s2', 2))
    memory.set('vault-key', 'not-a-session')

    await clearSessions()

    expect(memory.has('session:s1')).toBe(false)
    expect(memory.has('session:s2')).toBe(false)
    expect(memory.get('vault-key')).toBe('not-a-session')
    expect(localStorage.getItem(SESSION_INDEX_KEY)).toBe('[]')
    expect(localStorage.getItem(ACTIVE_SESSION_KEY)).toBeNull()
  })
})
