import { Sparkles } from 'lucide-react'
import { useState } from 'react'

import { useAuthStore } from '../../auth/authStore'
import { useChatStore } from '../../chat/chatStore'
import { useSettingsStore } from '../../settings/settingsStore'
import {
  presetLeafTotal,
  SMART_PAPER_PRESETS,
  SMART_PAPER_REGIONS,
  type SmartPaperRegion,
} from './presets'
import { startSmartPaper } from './practiceService'
import { DifficultyChips, PickerHeader, PickerHint, type DifficultyValue } from './pickerUi'

export function SmartPicker() {
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)
  const token = useAuthStore((state) => state.token)
  const startPracticeFrom = useChatStore((state) => state.startPracticeFrom)
  const [region, setRegion] = useState<SmartPaperRegion>(SMART_PAPER_REGIONS[0])
  const [difficulty, setDifficulty] = useState<DifficultyValue>(null)
  const [pending, setPending] = useState(false)

  const modules = SMART_PAPER_PRESETS[region]

  const begin = () => {
    if (pending) return
    setPending(true)
    void startPracticeFrom(
      () => startSmartPaper(region, difficulty, { baseUrl: apiBaseUrl, token }),
      '/practice',
    ).finally(() => setPending(false))
  }

  return (
    <section className="practice-tool" aria-label="智能组卷">
      <PickerHeader
        title="找一组题练练"
        subtitle="选一个地区和难度，我帮你整理成一组对话式练习。"
        aside={<Sparkles size={16} aria-hidden="true" />}
      />

      <div>
        <p className="picker-label">地区</p>
        <div className="picker-grid" role="group" aria-label="选择地区">
          {SMART_PAPER_REGIONS.map((item) => (
            <button
              key={item}
              type="button"
              className={`picker-chip ${item === region ? 'is-active' : ''}`}
              onClick={() => setRegion(item)}
              disabled={pending}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="picker-label">难度</p>
        <DifficultyChips value={difficulty} onChange={setDifficulty} disabled={pending} />
      </div>

      <ul className="picker-module-list">
        {modules.map((module) => (
          <li key={module.name}>
            {module.name}
            <span className="picker-module-count">
              {module.son.reduce((sum, child) => sum + child.num, 0)} 题
            </span>
          </li>
        ))}
      </ul>

      <div className="picker-footer">
        <PickerHint>
          {region}预设约 {presetLeafTotal(region)} 题，实际题量以返回为准。
        </PickerHint>
        <button type="button" className="picker-primary" onClick={begin} disabled={pending}>
          {pending ? '正在组卷…' : '开始练习'}
        </button>
      </div>
    </section>
  )
}
