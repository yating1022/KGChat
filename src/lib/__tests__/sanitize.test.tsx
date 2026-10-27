import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HtmlContent } from '../../components/common/HtmlContent'
import { containsHtml, sanitizeHtml } from '../sanitize'

afterEach(() => {
  cleanup()
})

describe('sanitizeHtml', () => {
  it('removes executable markup and event handlers', () => {
    const clean = sanitizeHtml(
      '<p>安全内容</p><script>alert(1)</script><iframe src="https://evil.test"></iframe>' +
        '<form action="/steal"><input value="x"></form>' +
        '<img src="/media/a.png" onerror="alert(1)">',
    )

    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('<iframe')
    expect(clean).not.toContain('<form')
    expect(clean).not.toContain('<input')
    expect(clean).not.toContain('onerror')
    expect(clean).toContain('安全内容')
  })

  it('resolves relative images against the SaDuck origin', () => {
    const clean = sanitizeHtml('<img src="/media/question.png" alt="题图">')

    expect(clean).toContain('src="https://saduck.top/media/question.png"')
    expect(clean).toContain('loading="lazy"')
    expect(clean).toContain('referrerpolicy="no-referrer"')
  })

  it('preserves tables, font colors, mark, and ins', () => {
    const clean = sanitizeHtml(
      '<table><tr><td><font color="#fc5531">红</font><mark>高亮</mark><ins>新增</ins></td></tr></table>',
    )

    expect(clean).toContain('<table')
    expect(clean).toContain('<td')
    expect(clean).toContain('<font color="#fc5531">')
    expect(clean).toContain('<mark>')
    expect(clean).toContain('<ins>')
  })

  it('returns an empty string for missing content', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml('   ')).toBe('')
  })

  it('detects whether a small label contains HTML', () => {
    expect(containsHtml('A. 普通文本')).toBe(false)
    expect(containsHtml('A. <font color="#f00">红色</font>')).toBe(true)
  })
})

describe('HtmlContent', () => {
  it('renders sanitized HTML and never executes scripts', () => {
    const { container } = render(
      <HtmlContent html={'<p>第一行</p><script>alert(1)</script><img src="a.png">'} />,
    )

    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('第一行')
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://saduck.top/a.png')
  })
})
