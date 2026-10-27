import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from '../ErrorBoundary'

function Boom(): never {
  throw new Error('render failed')
}

afterEach(() => {
  cleanup()
})

describe('ErrorBoundary', () => {
  it('renders a neutral fallback instead of a blank page', () => {
    // React reports caught render errors; silence that expected output.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      )
    } finally {
      consoleSpy.mockRestore()
    }

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/题目|答案|解析|试卷/)
  })

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>正常内容</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('正常内容')).toBeTruthy()
  })
})
