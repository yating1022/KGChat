import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Modal } from '../Modal'

function Harness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        打开弹窗
      </button>
      <Modal open={open} title="测试弹窗" onClose={() => setOpen(false)}>
        <button type="button">内部按钮</button>
      </Modal>
    </>
  )
}

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('Modal accessibility', () => {
  it('focuses inside, traps Tab, locks scroll, and restores focus on close', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const opener = screen.getByRole('button', { name: '打开弹窗' })
    opener.focus()
    await user.click(opener)

    const dialog = await screen.findByRole('dialog', { name: '测试弹窗' })
    const close = screen.getByRole('button', { name: '关闭' })
    const inner = screen.getByRole('button', { name: '内部按钮' })

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    await waitFor(() => expect(document.activeElement).toBe(close))
    expect(document.body.style.overflow).toBe('hidden')

    inner.focus()
    await user.tab()
    expect(document.activeElement).toBe(close)

    await user.tab({ shift: true })
    expect(document.activeElement).toBe(inner)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(opener)
  })

  it('closes only the topmost open dialog on Escape', async () => {
    const closeFirst = vi.fn()
    const closeSecond = vi.fn()

    render(
      <>
        <Modal open title="第一层" onClose={closeFirst}>
          <span>第一层内容</span>
        </Modal>
        <Modal open title="第二层" onClose={closeSecond}>
          <span>第二层内容</span>
        </Modal>
      </>,
    )

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(closeSecond).toHaveBeenCalledTimes(1)
    expect(closeFirst).not.toHaveBeenCalled()
  })

  it('keeps Tab focus inside the topmost of two open dialogs', async () => {
    const user = userEvent.setup()

    render(
      <>
        <Modal open title="第一层" onClose={vi.fn()}>
          <button type="button">第一层按钮</button>
        </Modal>
        <Modal open title="第二层" onClose={vi.fn()}>
          <button type="button">第二层按钮</button>
        </Modal>
      </>,
    )

    const second = await screen.findByRole('dialog', { name: '第二层' })
    await waitFor(() => expect(second.contains(document.activeElement)).toBe(true))

    const inner = within(second).getByRole('button', { name: '第二层按钮' })
    inner.focus()
    await user.tab()

    expect(second.contains(document.activeElement)).toBe(true)
    expect(within(second).getByRole('button', { name: '关闭' })).toBe(document.activeElement)
  })
})
