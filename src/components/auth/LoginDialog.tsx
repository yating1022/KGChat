import { useEffect, useRef, useState, type FormEvent } from 'react'

import { sendEmailCode } from '../../api/endpoints/auth'
import { toUserMessage } from '../../api/errors'
import { useAuthStore } from '../../auth/authStore'
import { loadCredentials } from '../../auth/credentialVault'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useSettingsStore } from '../../settings/settingsStore'
import { Brand } from '../../skins/Brand'
import type { SkinName } from '../../skins/types'

export type { SkinName } from '../../skins/types'

export interface LoginDialogProps {
  open: boolean
  onClose: () => void
  skin: SkinName
}

type LoginMode = 'password' | 'code'

export function LoginDialog({ open, onClose, skin }: LoginDialogProps) {
  const login = useAuthStore((state) => state.login)
  const loginPending = useAuthStore((state) => state.loginPending)
  const storeError = useAuthStore((state) => state.lastError)
  const clearError = useAuthStore((state) => state.clearError)

  const [mode, setMode] = useState<LoginMode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [remember, setRemember] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sendingCode, setSendingCode] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const cardRef = useRef<HTMLElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  useDialogFocus({ open, onClose, containerRef: cardRef, initialFocusRef: emailRef })

  useEffect(() => {
    if (!open) return
    clearError()
    setValidationError(null)
    setNotice(null)
  }, [open, clearError])

  // Do not keep a typed password in component memory after the dialog closes.
  useEffect(() => {
    if (open) return
    setPassword('')
    setCode('')
    setValidationError(null)
  }, [open])

  useEffect(() => {
    if (!open) return

    let active = true
    void loadCredentials().then((saved) => {
      if (!active || !saved) return
      setEmail(saved.email)
      setPassword(saved.password)
      setRemember(true)
      setNotice('已填入上次保存在本机的账号，可直接登录。')
    })

    return () => {
      active = false
    }
  }, [open])

  useEffect(() => {
    if (cooldown <= 0) return

    const timer = window.setTimeout(() => {
      setCooldown((value) => Math.max(0, value - 1))
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [cooldown])

  if (!open) return null

  const displayError = validationError ?? storeError

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setValidationError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setValidationError('请输入邮箱。')
      return
    }

    if (mode === 'password' && !password) {
      setValidationError('请输入密码。')
      return
    }

    if (mode === 'code' && !/^\d{4}$/.test(code.trim())) {
      setValidationError('请输入 4 位邮箱验证码。')
      return
    }

    const success = await login({
      email: trimmedEmail,
      password: mode === 'password' ? password : undefined,
      code: mode === 'code' ? code.trim() : undefined,
      mode,
      rememberPassword: remember,
    })

    if (success) {
      setPassword('')
      setCode('')
      onClose()
    }
  }

  const handleSendCode = async () => {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setValidationError('请先输入邮箱。')
      return
    }

    setValidationError(null)
    setSendingCode(true)

    try {
      await sendEmailCode(trimmedEmail, {
        baseUrl: useSettingsStore.getState().apiBaseUrl,
      })
      setCooldown(60)
      setNotice('验证码已发送，请检查邮箱。')
    } catch (error) {
      setValidationError(toUserMessage(error))
    } finally {
      setSendingCode(false)
    }
  }

  const switchMode = () => {
    setValidationError(null)
    setNotice(null)
    clearError()
    setMode((current) => (current === 'password' ? 'code' : 'password'))
  }

  return (
    <div
      className="login-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={cardRef}
        className={`login-card login-card--${skin}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        tabIndex={-1}
      >
        <div className="login-brand">
          <Brand skin={skin} size={22} showWordmark />
        </div>

        <h2 id="login-title" className="login-title">
          登录以继续
        </h2>
        <p className="login-subtitle">使用你的账号。密码默认不会保存在本机。</p>

        <form onSubmit={(event) => void handleSubmit(event)} className="login-form">
          <label className="login-field">
            <span className="login-label">邮箱</span>
            <input
              ref={emailRef}
              className="login-input"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loginPending}
            />
          </label>

          {mode === 'password' ? (
            <label className="login-field">
              <span className="login-label">密码</span>
              <input
                className="login-input"
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="请输入密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loginPending}
              />
            </label>
          ) : (
            <label className="login-field">
              <span className="login-label">邮箱验证码</span>
              <span className="login-code-row">
                <input
                  className="login-input"
                  type="text"
                  name="code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="4 位验证码"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  disabled={loginPending}
                />
                <button
                  type="button"
                  className="login-secondary"
                  onClick={() => void handleSendCode()}
                  disabled={sendingCode || cooldown > 0 || loginPending}
                >
                  {sendingCode ? '发送中…' : cooldown > 0 ? `${cooldown} 秒` : '发送验证码'}
                </button>
              </span>
            </label>
          )}

          <label className="login-check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              disabled={loginPending}
            />
            <span>
              记住密码
              <span className="login-check-hint">（仅保存在本机，用于下次登录）</span>
            </span>
          </label>

          {displayError ? (
            <p className="login-error" role="alert">
              {displayError}
            </p>
          ) : null}

          {notice ? <p className="login-hint">{notice}</p> : null}

          <button type="submit" className="login-primary" disabled={loginPending}>
            {loginPending ? '正在登录…' : '登录'}
          </button>
        </form>

        <div className="login-footer">
          <button type="button" className="login-link" onClick={switchMode}>
            {mode === 'password' ? '使用邮箱验证码登录' : '使用密码登录'}
          </button>
          <button type="button" className="login-link" onClick={onClose}>
            取消
          </button>
        </div>
      </section>
    </div>
  )
}
