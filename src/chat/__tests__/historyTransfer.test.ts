import { beforeEach, describe, expect, it, vi } from 'vitest'

const { idbStore } = vi.hoisted(() => ({
  idbStore: new Map<string, unknown>(),
}))

vi.mock('idb-keyval', () => ({
  get: async (key: string) => idbStore.get(key),
  set: async (key: string, value: unknown) => {
    idbStore.set(key, value)
  },
  del: async (key: string) => {
    idbStore.delete(key)
  },
  keys: async () => [...idbStore.keys()],
}))

import type { ChatSession } from '../chatTypes'
import { exportHistoryJson, importHistoryJson } from '../historyTransfer'
import { loadSessions, saveSession } from '../sessionRepository'

const SESSION: ChatSession = {
  id: 'chat_history_test',
  title: '新对话',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
  messages: [
    {
      id: 'msg_1',
      role: 'user',
      kind: 'text',
      content: '帮我复习一下成语',
      createdAt: 1_700_000_000_000,
    },
  ],
  draft: '未发送的草稿',
  scrollTop: 24,
  mode: 'chat',
}

beforeEach(() => {
  localStorage.clear()
  idbStore.clear()
})

describe('historyTransfer', () => {
  it('exports conversations without credential-shaped fields', async () => {
    const tainted = {
      ...SESSION,
      token: 'super-secret-token',
      password: 'super-secret-password',
      meta: { authorization: 'Bearer still-secret' },
    } as unknown as ChatSession

    await saveSession(tainted)

    const json = await exportHistoryJson()
    expect(json).toContain(SESSION.id)
    expect(json).not.toContain('super-secret-token')
    expect(json).not.toContain('super-secret-password')
    expect(json).not.toContain('still-secret')

    const parsed = JSON.parse(json) as { sessions: Array<Record<string, unknown>> }
    expect(parsed.sessions[0].token).toBeUndefined()
    expect(parsed.sessions[0].password).toBeUndefined()
  })

  it('imports a valid backup and keeps only session data', async () => {
    const tainted = {
      ...SESSION,
      token: 'imported-token',
      nested: { password: 'imported-password' },
    }

    const result = await importHistoryJson(JSON.stringify({ sessions: [tainted] }))
    expect(result).toEqual({ imported: 1, skipped: 0 })

    const loaded = await loadSessions()
    expect(loaded.sessions).toHaveLength(1)
    expect(loaded.sessions[0].id).toBe(SESSION.id)
    expect('token' in loaded.sessions[0]).toBe(false)
    expect(JSON.stringify(loaded.sessions[0])).not.toContain('imported-token')
    expect(JSON.stringify(loaded.sessions[0])).not.toContain('imported-password')
  })

  it('imports a gemini-voyager chat export', async () => {
    const official = {
      format: 'gemini-voyager.chat.v1',
      title: '布局模块需求描述优化',
      count: 1,
      items: [{ user: '布局模块可以上传布局', assistant: '**自定义布局控制模块**' }],
    }

    const result = await importHistoryJson(JSON.stringify(official))
    expect(result).toEqual({ imported: 1, skipped: 0 })

    const loaded = await loadSessions()
    expect(loaded.sessions).toHaveLength(1)
    expect(loaded.sessions[0].title).toBe('布局模块需求描述优化')
    expect(loaded.sessions[0].messages).toHaveLength(2)
    expect(loaded.sessions[0].messages[0]).toMatchObject({
      role: 'user',
      kind: 'text',
      content: '布局模块可以上传布局',
    })
    expect(loaded.sessions[0].messages[1]).toMatchObject({
      role: 'assistant',
      kind: 'text',
      content: '**自定义布局控制模块**',
    })
  })

  it('uses a custom title when one is provided', async () => {
    const official = {
      format: 'gemini-voyager.chat.v1',
      title: '原始标题',
      items: [{ user: 'hi', assistant: 'hello' }],
    }

    const result = await importHistoryJson(JSON.stringify(official), { title: '我的备份' })
    expect(result).toEqual({ imported: 1, skipped: 0 })

    const loaded = await loadSessions()
    expect(loaded.sessions[0].title).toBe('我的备份')
  })

  it('numbers multiple conversations under one custom title', async () => {
    const payload = {
      conversations: [
        { format: 'gemini-voyager.chat.v1', title: 'A', items: [{ user: 'a', assistant: 'b' }] },
        { format: 'gemini-voyager.chat.v1', title: 'B', items: [{ user: 'c', assistant: 'd' }] },
      ],
    }

    const result = await importHistoryJson(JSON.stringify(payload), { title: ' 备份 ' })
    expect(result).toEqual({ imported: 2, skipped: 0 })

    const loaded = await loadSessions()
    expect(loaded.sessions.map((session) => session.title).sort()).toEqual([
      '备份 1',
      '备份 2',
    ])
  })

  it('keeps the file title when the custom title is blank', async () => {
    const official = {
      format: 'gemini-voyager.chat.v1',
      title: '原始标题',
      items: [{ user: 'hi', assistant: 'hello' }],
    }

    await importHistoryJson(JSON.stringify(official), { title: '   ' })
    const loaded = await loadSessions()
    expect(loaded.sessions[0].title).toBe('原始标题')
  })

  it('imports a list of chat exports', async () => {
    const payload = {
      conversations: [
        { format: 'gemini-voyager.chat.v1', title: '问候交流', items: [{ user: 'hi', assistant: 'hello' }] },
        { format: 'gemini-voyager.chat.v1', title: '空对话', items: [] },
      ],
    }

    const result = await importHistoryJson(JSON.stringify(payload))
    expect(result).toEqual({ imported: 1, skipped: 1 })
  })

  it('skips invalid entries instead of throwing', async () => {
    const result = await importHistoryJson(
      JSON.stringify({ sessions: [{ id: 'broken' }, SESSION] }),
    )

    expect(result).toEqual({ imported: 1, skipped: 1 })
  })

  it('rejects text that is not JSON or has no sessions', async () => {
    await expect(importHistoryJson('not-json')).rejects.toThrow('JSON')
    await expect(importHistoryJson(JSON.stringify({ hello: 'world' }))).rejects.toThrow(
      '没有可导入的对话',
    )
  })
})
