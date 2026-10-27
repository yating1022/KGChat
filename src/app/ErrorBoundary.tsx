import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Last-resort render guard.
 *
 * Malformed local sessions or an unexpected API shape must not leave a blank
 * page. The fallback is deliberately neutral: it shows no question, answer,
 * analysis, source, or error payload, and only offers a reload.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error" role="alert">
          <div className="app-error-card">
            <h1 className="app-error-title">页面遇到了一点问题</h1>
            <p className="app-error-text">可以重新加载后继续。本机保存的对话不会受影响。</p>
            <button
              type="button"
              className="app-error-action"
              onClick={() => window.location.reload()}
            >
              重新加载
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
