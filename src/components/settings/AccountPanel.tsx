import { KeyRound, LogIn, LogOut, RefreshCw, ShieldOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useAuthStore } from '../../auth/authStore'
import type { AuthStatus } from '../../auth/authStore'
import { clearCredentials, hasSavedCredentials } from '../../auth/credentialVault'
import { useChatStore } from '../../chat/chatStore'

export interface AccountPanelProps {
  onOpenLogin: () => void
}

const STATUS_LABELS: Record<AuthStatus, string> = {
  booting: '正在刷新登录状态…',
  anonymous: '未登录',
  authenticated: '已登录',
  'authenticated-offline': '已登录（离线）',
}

export function AccountPanel({ onOpenLogin }: AccountPanelProps) {
  const status = useAuthStore((state) => state.status)
  const profile = useAuthStore((state) => state.profile)
  const membershipExpired = useAuthStore((state) => state.membershipExpired)
  const verifying = useAuthStore((state) => state.verifying)
  const lastError = useAuthStore((state) => state.lastError)
  const verify = useAuthStore((state) => state.verify)
  const logout = useAuthStore((state) => state.logout)
  const clearChatHistory = useChatStore((state) => state.clearChatHistory)

  const [savedCredentials, setSavedCredentials] = useState(() => hasSavedCredentials())
  const [clearSavedOnLogout, setClearSavedOnLogout] = useState(true)
  const [clearChatOnLogout, setClearChatOnLogout] = useState(false)
  const [clearingCredentials, setClearingCredentials] = useState(false)
  const [credentialNotice, setCredentialNotice] = useState<string | null>(null)

  const authenticated = status === 'authenticated' || status === 'authenticated-offline'

  useEffect(() => {
    setSavedCredentials(hasSavedCredentials())
  }, [status])

  const clearVault = async () => {
    if (clearingCredentials) return
    setClearingCredentials(true)
    setCredentialNotice(null)

    try {
      await clearCredentials()
      setSavedCredentials(false)
      setCredentialNotice('已清除记住的登录信息。')
    } finally {
      setClearingCredentials(false)
    }
  }

  const signOut = async () => {
    await logout({ clearCredentials: clearSavedOnLogout })
    if (clearChatOnLogout) await clearChatHistory()
    setSavedCredentials(hasSavedCredentials())
    setCredentialNotice(
      [
        clearSavedOnLogout
          ? '已退出登录，并清除记住的密码。'
          : '已退出登录，记住的密码仍然保留。',
        clearChatOnLogout ? '本机聊天记录已清空。' : '本机聊天记录仍然保留。',
      ].join(''),
    )
  }

  return (
    <div className="settings-panel">
      <section className="settings-section">
        <h3 className="settings-heading">账号状态</h3>
        <div className="account-summary">
          <span className={`account-status-dot account-status-dot--${status}`} aria-hidden="true" />
          <div>
            <p className="account-status-label">{STATUS_LABELS[status]}</p>
            {profile ? (
              <p className="account-meta">
                {profile.email}
                <span className="account-sep">·</span>
                {profile.vipType === 1 ? 'VIP 会员' : '普通账号'}
                {profile.vipEndTime ? (
                  <>
                    <span className="account-sep">·</span>
                    到期 {profile.vipEndTime}
                  </>
                ) : null}
              </p>
            ) : (
              <p className="account-meta">登录后可以使用完整功能并保存进度。</p>
            )}
          </div>
        </div>

        {membershipExpired ? (
          <p className="settings-warning">当前账号的部分服务不可用（102）。</p>
        ) : null}

        {lastError ? <p className="settings-error">{lastError}</p> : null}

        {authenticated ? (
          <>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={clearSavedOnLogout}
                onChange={(event) => setClearSavedOnLogout(event.target.checked)}
              />
              <span>
                退出登录时同时清除记住的密码
                <span className="settings-hint">只清除记住的密码；聊天记录由下一项决定。</span>
              </span>
            </label>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={clearChatOnLogout}
                onChange={(event) => setClearChatOnLogout(event.target.checked)}
              />
              <span>
                退出登录时同时清空本机聊天记录
                <span className="settings-hint">不可撤销；如有需要，先在「隐私与数据」导出备份。</span>
              </span>
            </label>
          </>
        ) : null}

        <div className="settings-actions">
          {authenticated ? (
            <>
              <button
                type="button"
                className="settings-button"
                onClick={() => void verify()}
                disabled={verifying}
              >
                <RefreshCw size={15} aria-hidden="true" />
                {verifying ? '正在刷新…' : '刷新登录状态'}
              </button>
              <button
                type="button"
                className="settings-button settings-button--quiet"
                onClick={() => void signOut()}
              >
                <LogOut size={15} aria-hidden="true" />
                退出登录
              </button>
            </>
          ) : (
            <button
              type="button"
              className="settings-button settings-button--primary"
              onClick={onOpenLogin}
            >
              <LogIn size={15} aria-hidden="true" />
              登录
            </button>
          )}
        </div>

        <p className="settings-hint">
          登录状态只保存在本机。退出登录不会删除本机聊天记录。
        </p>
      </section>

      <section className="settings-section">
        <h3 className="settings-heading">记住的登录信息</h3>
        <div className="account-summary">
          <span className="account-credential-icon" aria-hidden="true">
            {savedCredentials ? <KeyRound size={15} /> : <ShieldOff size={15} />}
          </span>
          <div>
            <p className="account-status-label">
              {savedCredentials ? '已记住（仅用于预填登录）' : '未记住登录信息'}
            </p>
            <p className="account-meta">
              只有登录时勾选「记住密码」才会保存，仅用于下次登录时填写表单。
            </p>
          </div>
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="settings-button settings-button--quiet"
            onClick={() => void clearVault()}
            disabled={!savedCredentials || clearingCredentials}
          >
            <ShieldOff size={15} aria-hidden="true" />
            {clearingCredentials ? '正在清除…' : '清除记住的登录信息'}
          </button>
        </div>

        {credentialNotice ? <p className="settings-success">{credentialNotice}</p> : null}

        <p className="settings-hint">
          请不要在共享设备上勾选「记住密码」；清除后需要重新输入。
        </p>
      </section>

      <section className="settings-section">
        <h3 className="settings-heading">本机数据</h3>
        <p className="settings-hint">
          聊天记录、对话备份与清空操作在「隐私与数据」标签里。所有数据只保存在当前浏览器。
        </p>
      </section>
    </div>
  )
}
