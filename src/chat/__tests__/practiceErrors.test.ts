import { beforeEach, describe, expect, it } from 'vitest'

import { DecodeError } from '../../api/errors'
import { resetChatStore, useChatStore } from '../chatStore'

beforeEach(() => {
  localStorage.clear()
  resetChatStore()
  useChatStore.getState().createSession()
})

describe('reportPracticeError', () => {
  it('shows the specific decode label plus the retry action', () => {
    useChatStore
      .getState()
      .reportPracticeError(new DecodeError('专项练习的数据格式不正确'), '/special')

    const messages = useChatStore.getState().session?.messages ?? []
    const notice = messages.find(
      (message) => message.kind === 'notice' && message.tone === 'error',
    )
    expect(notice?.kind === 'notice' ? notice.content : '').toBe(
      '专项练习的数据格式不正确',
    )

    const actions = messages.find((message) => message.kind === 'actions')
    expect(actions?.kind === 'actions' ? actions.actions : []).toEqual([
      { label: '重试', kind: 'command', command: '/special' },
    ])
  })
})
