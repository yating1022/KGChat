import { useChatStore } from '../../chat/chatStore'
import { Modal } from '../common/Modal'
import { AccountPanel } from './AccountPanel'
import { AppearancePanel } from './AppearancePanel'
import { PrivacyPanel } from './PrivacyPanel'

export interface SettingsDialogProps {
  onOpenLogin: () => void
}

export function SettingsDialog({ onOpenLogin }: SettingsDialogProps) {
  const open = useChatStore((state) => state.ui.settingsOpen)
  const tab = useChatStore((state) => state.ui.settingsTab)
  const openSettings = useChatStore((state) => state.openSettings)
  const closeSettings = useChatStore((state) => state.closeSettings)

  return (
    <Modal
      open={open}
      title="设置"
      onClose={closeSettings}
      size="md"
      footer={<span className="settings-footer">设置只保存在本机。</span>}
    >
      <div className="settings-tabs" role="tablist" aria-label="设置分类">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'appearance'}
          className={`settings-tab ${tab === 'appearance' ? 'is-active' : ''}`}
          onClick={() => openSettings('appearance')}
        >
          外观
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'account'}
          className={`settings-tab ${tab === 'account' ? 'is-active' : ''}`}
          onClick={() => openSettings('account')}
        >
          账号
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'privacy'}
          className={`settings-tab ${tab === 'privacy' ? 'is-active' : ''}`}
          onClick={() => openSettings('privacy')}
        >
          隐私与数据
        </button>
      </div>

      {tab === 'appearance' ? <AppearancePanel /> : null}
      {tab === 'account' ? (
        <AccountPanel
          onOpenLogin={() => {
            closeSettings()
            onOpenLogin()
          }}
        />
      ) : null}
      {tab === 'privacy' ? <PrivacyPanel /> : null}
    </Modal>
  )
}
