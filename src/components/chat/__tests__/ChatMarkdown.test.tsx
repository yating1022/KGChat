import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ChatMarkdown } from '../ChatMarkdown'

afterEach(() => {
  cleanup()
})

describe('ChatMarkdown', () => {
  it('renders bold, blockquotes, lists, and line breaks', () => {
    const { container } = render(
      <ChatMarkdown
        text={
          '第一行**加粗**\n第二行\n\n> 引用内容\n>\n> - **列表项**\n\n- 甲\n- 乙'
        }
      />,
    )

    expect(screen.getByText('加粗').tagName).toBe('STRONG')
    expect(container.querySelector('br')).not.toBeNull()

    const quote = container.querySelector('blockquote')
    expect(quote?.textContent).toContain('引用内容')
    expect(quote?.querySelector('strong')?.textContent).toBe('列表项')

    const lists = container.querySelectorAll('ul.chat-md-list')
    expect(lists).toHaveLength(2)
    expect(lists[0].querySelector('strong')?.textContent).toBe('列表项')
    expect(lists[1].querySelectorAll('li')).toHaveLength(2)
  })

  it('splits a blockquote from a following paragraph without a blank line', () => {
    const { container } = render(
      <ChatMarkdown text={'> **引用标题**\n> 引用正文\n**下一段标题**\n\n正文'} />,
    )

    expect(container.textContent).not.toContain('>')
    expect(container.querySelector('blockquote')?.textContent).toContain('引用正文')
    expect(screen.getByText('下一段标题').tagName).toBe('STRONG')
  })

  it('never injects raw HTML', () => {
    const { container } = render(
      <ChatMarkdown text={'<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>'} />,
    )

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
    expect(container.textContent).toContain('<img src=x onerror=alert(2)>')
  })
})
