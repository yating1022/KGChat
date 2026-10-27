import { useSettingsStore } from '../../settings/settingsStore'
import { Brand } from '../../skins/Brand'
import type { SkinName, ThemePreference } from '../../skins/types'

const THEMES: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

const SKINS: SkinName[] = ['gemini', 'chatgpt']

export function AppearancePanel() {
  const skin = useSettingsStore((state) => state.skin)
  const theme = useSettingsStore((state) => state.theme)
  const quickHideEnabled = useSettingsStore((state) => state.quickHideEnabled)
  const setSkin = useSettingsStore((state) => state.setSkin)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const setQuickHideEnabled = useSettingsStore((state) => state.setQuickHideEnabled)

  return (
    <div className="settings-panel">
      <section className="settings-section" aria-labelledby="settings-skin">
        <h3 id="settings-skin" className="settings-heading">
          界面皮肤
        </h3>
        <p className="settings-hint">切换皮肤不会退出登录，也不会丢失当前对话。</p>
        <div className="skin-options" role="radiogroup" aria-label="界面皮肤">
          {SKINS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={skin === option}
              aria-label={`切换到 ${option === 'gemini' ? 'Gemini' : 'ChatGPT'} 皮肤`}
              className={`skin-option ${skin === option ? 'is-selected' : ''}`}
              onClick={() => setSkin(option)}
            >
              <span className="skin-option-head">
                <Brand skin={option} showWordmark={false} size={22} />
                <span className="skin-option-name">
                  {option === 'gemini' ? 'Gemini' : 'ChatGPT'}
                </span>
              </span>
              <span className="skin-option-meta">
                {option === 'gemini' ? '暖白画布 · 淡蓝渐变' : '中性白 · 黑色主操作'}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-theme">
        <h3 id="settings-theme" className="settings-heading">
          主题
        </h3>
        <div className="segmented" role="group" aria-label="主题">
          {THEMES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`segmented-item ${theme === option.value ? 'is-active' : ''}`}
              aria-pressed={theme === option.value}
              onClick={() => setTheme(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-quick-hide">
        <h3 id="settings-quick-hide" className="settings-heading">
          快速隐藏
        </h3>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={quickHideEnabled}
            onChange={(event) => setQuickHideEnabled(event.target.checked)}
          />
          <span>
            双击 Esc 遮盖当前页面内容
            <span className="settings-hint">
              连续按两次 Esc 可随时遮盖当前内容，再次双击恢复。关闭后不会拦截快捷键；登录、设置或确认弹窗打开时也不会触发。
            </span>
          </span>
        </label>
      </section>
    </div>
  )
}
