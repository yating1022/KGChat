import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetChatStore, useChatStore } from '../../../chat/chatStore'
import { SettingsDialog } from '../SettingsDialog'

const FORBIDDEN_COPY = [
  '接口地址',
  '品牌样式',
  '无关联',
  '学习内容',
  '练习内容',
  '示例',
  '演示',
  '开发',
  '令牌',
  '保险库',
  '会员限制',
]

beforeEach(() => {
  localStorage.clear()
  resetChatStore()
  useChatStore.getState().openSettings('appearance')
})

afterEach(() => {
  cleanup()
})

describe('SettingsDialog', () => {
  it('contains no developer or demo copy across its tabs', async () => {
    const user = userEvent.setup()
    render(<SettingsDialog onOpenLogin={vi.fn()} />)

    await screen.findByRole('dialog', { name: '设置' })
    expect(screen.getByText('双击 Esc 遮盖当前页面内容')).toBeTruthy()

    const tabs = ['外观', '账号', '隐私与数据']
    for (const tab of tabs) {
      await user.click(screen.getByRole('tab', { name: tab }))
      const text = document.body.textContent ?? ''
      for (const forbidden of FORBIDDEN_COPY) {
        expect(text).not.toContain(forbidden)
      }
    }

    await user.click(screen.getByRole('tab', { name: '账号' }))
    expect(screen.getByText('登录后可以使用完整功能并保存进度。')).toBeTruthy()
  })
})
