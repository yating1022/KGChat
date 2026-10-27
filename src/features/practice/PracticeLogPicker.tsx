import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { useState } from 'react'

import { useAuthStore } from '../../auth/authStore'
import { useChatStore } from '../../chat/chatStore'
import { formatDuration } from '../../lib/time'
import { useSettingsStore } from '../../settings/settingsStore'
import { fetchPracticeRecords, loadRecord, type RecordLoadMode } from './practiceService'
import { LoginPrompt, PickerEmpty, PickerError, PickerHeader, PickerLoading } from './pickerUi'

export function PracticeLogPicker({ onOpenLogin }: { onOpenLogin?: () => void }) {
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)
  const token = useAuthStore((state) => state.token)
  const startPracticeFrom = useChatStore((state) => state.startPracticeFrom)
  const [pendingId, setPendingId] = useState<number | null>(null)

  const records = useQuery({
    queryKey: ['tk', 'practice-records', apiBaseUrl, token],
    queryFn: ({ signal }) => fetchPracticeRecords({ baseUrl: apiBaseUrl, token, signal }),
    staleTime: 30 * 1000,
    enabled: Boolean(token),
  })

  const open = (id: number, mode: RecordLoadMode) => {
    if (pendingId !== null) return
    setPendingId(id)
    void startPracticeFrom(
      () => loadRecord(id, mode, { baseUrl: apiBaseUrl, token }),
      '/history',
    ).finally(() => setPendingId(null))
  }

  if (!token) {
    return (
      <section className="practice-tool" aria-label="练习记录">
        <PickerHeader title="练习记录" subtitle="回看之前的练习，或把同一组题再做一遍。" />
        <LoginPrompt onOpenLogin={onOpenLogin} />
      </section>
    )
  }

  return (
    <section className="practice-tool" aria-label="练习记录">
      <PickerHeader
        title="练习记录"
        subtitle="可以只看回顾，也可以重新作答。"
        aside={<History size={16} aria-hidden="true" />}
      />

      {records.isPending ? <PickerLoading label="正在读取练习记录…" /> : null}
      {records.isError ? (
        <PickerError error={records.error} onRetry={() => void records.refetch()} />
      ) : null}

      {records.isSuccess && records.data.tkMyRecords.length === 0 ? (
        <PickerEmpty>还没有练习记录，完成一组练习并保存后会显示在这里。</PickerEmpty>
      ) : null}

      {records.data && records.data.tkMyRecords.length > 0 ? (
        <div className="picker-scroll">
          {records.data.tkMyRecords.map((record) => {
            const pending = pendingId === record.id
            return (
              <div key={record.id} className="record-card">
                <div className="record-card-head">
                  <span className="record-title">{record.tname || '一次练习'}</span>
                  <span className="picker-count">{record.total} 题</span>
                </div>
                <p className="record-meta">
                  答对 {record.correct} 题 · 答错 {record.wrong} 题 · 未答 {record.unanswered} 题
                  {record.timeTaken ? ` · ${formatDuration(Number(record.timeTaken))}` : ''}
                  {record.createTime ? ` · ${record.createTime}` : ''}
                </p>
                <div className="record-actions">
                  <button
                    type="button"
                    className="picker-chip"
                    disabled={pendingId !== null}
                    onClick={() => open(record.id, 'review')}
                  >
                    {pending ? '正在读取…' : '查看回顾'}
                  </button>
                  <button
                    type="button"
                    className="picker-primary"
                    disabled={pendingId !== null}
                    onClick={() => open(record.id, 'redo')}
                  >
                    重做这组
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
