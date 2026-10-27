import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { MembershipError, toUserMessage } from '../../api/errors'
import { useAuthStore } from '../../auth/authStore'
import { useChatStore } from '../../chat/chatStore'
import type { AnalyzeMode } from '../../chat/chatTypes'
import { useSettingsStore } from '../../settings/settingsStore'
import { LoginPrompt, PickerEmpty, PickerError, PickerHeader, PickerLoading } from '../practice/pickerUi'
import {
  analyzeHistoryCount,
  clearAnalyzeHistory,
  loadAnalyzeHistory,
  loadAnalyzeStart,
} from './analyzeService'

const MODE_OPTIONS: Array<{ value: AnalyzeMode; label: string; hint: string }> = [
  { value: 'wordToDef', label: '看成语选释义', hint: '给出成语，从几个释义里挑一个' },
  { value: 'defToWord', label: '看释义选成语', hint: '给出释义，从几个成语里挑一个' },
]

export function AnalyzeTool({ onOpenLogin }: { onOpenLogin?: () => void }) {
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)
  const token = useAuthStore((state) => state.token)
  const startAnalyzeFrom = useChatStore((state) => state.startAnalyzeFrom)
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<AnalyzeMode>('wordToDef')
  const [pending, setPending] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [membershipNote, setMembershipNote] = useState<string | null>(null)

  const history = useQuery({
    queryKey: ['analyze', 'history', apiBaseUrl, token],
    queryFn: ({ signal }) => loadAnalyzeHistory({ baseUrl: apiBaseUrl, token, signal }),
    staleTime: 30 * 1000,
    enabled: Boolean(token),
    retry: false,
  })

  const historyCount = history.isSuccess ? analyzeHistoryCount(history.data) : null
  const historyBlocked = history.error instanceof MembershipError

  const start = (nextMode: AnalyzeMode) => {
    if (pending) return
    if (!token) {
      onOpenLogin?.()
      return
    }
    setMode(nextMode)
    setPending(true)
    void startAnalyzeFrom(
      () => loadAnalyzeStart(nextMode, { baseUrl: apiBaseUrl, token }),
      '/analyze',
    ).finally(() => setPending(false))
  }

  const clear = async () => {
    if (clearing) return
    setClearing(true)
    setClearError(null)
    setMembershipNote(null)

    try {
      await clearAnalyzeHistory({ baseUrl: apiBaseUrl, token })
      setConfirmingClear(false)
      await queryClient.invalidateQueries({ queryKey: ['analyze', 'history'] })
      await history.refetch()
    } catch (error) {
      if (error instanceof MembershipError) {
        setMembershipNote('清空辨析历史需要有效的会员状态，本次没有做任何改动。')
      } else {
        setClearError(toUserMessage(error))
      }
    } finally {
      setClearing(false)
    }
  }

  return (
    <section className="practice-tool analyze-tool" aria-label="词语辨析">
      <PickerHeader
        title="词语辨析"
        subtitle="一组词放在一起比一比，选完会告诉你每个词的释义、辨析和例句。"
        aside={<Sparkles size={16} aria-hidden="true" />}
      />

      <div className="picker-chips" role="group" aria-label="辨析方式">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`picker-chip ${mode === option.value ? 'is-active' : ''}`}
            onClick={() => setMode(option.value)}
            disabled={pending}
            title={option.hint}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="picker-hint">{MODE_OPTIONS.find((item) => item.value === mode)?.hint}</p>

      <button
        type="button"
        className="picker-primary"
        onClick={() => start(mode)}
        disabled={pending}
      >
        {pending ? '正在整理…' : '来一组词语辨析'}
      </button>

      {!token ? <LoginPrompt onOpenLogin={onOpenLogin} /> : null}

      {token ? (
        <div className="analyze-history">
          <p className="shenlun-records-title">辨析历史</p>

          {history.isPending ? <PickerLoading label="正在读取辨析历史…" /> : null}

          {history.isError && !historyBlocked ? (
            <PickerError error={history.error} onRetry={() => void history.refetch()} />
          ) : null}

          {historyBlocked ? (
            <PickerEmpty>
              <p>辨析历史需要有效的会员状态，暂时无法读取。</p>
            </PickerEmpty>
          ) : null}

          {history.isSuccess ? (
            <PickerEmpty>
              {historyCount === null
                ? '历史记录已经同步。'
                : historyCount === 0
                  ? '还没有标记过已掌握的词语。'
                  : `已经有 ${historyCount} 组词语标记为已掌握。`}
            </PickerEmpty>
          ) : null}

          {confirmingClear ? (
            <div className="record-actions" data-confirm-open="true">
              <span className="shenlun-confirm">确认清空全部辨析历史？</span>
              <button
                type="button"
                className="picker-chip"
                onClick={() => setConfirmingClear(false)}
                disabled={clearing}
              >
                取消
              </button>
              <button
                type="button"
                className="picker-primary shenlun-danger"
                onClick={() => void clear()}
                disabled={clearing}
              >
                {clearing ? '正在清空…' : '确认清空'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="picker-chip"
              onClick={() => {
                setClearError(null)
                setMembershipNote(null)
                setConfirmingClear(true)
              }}
            >
              <Trash2 size={13} aria-hidden="true" />
              <span>清空历史</span>
            </button>
          )}

          {membershipNote ? <p className="shenlun-status shenlun-status--error">{membershipNote}</p> : null}
          {clearError ? <p className="shenlun-status shenlun-status--error">{clearError}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
