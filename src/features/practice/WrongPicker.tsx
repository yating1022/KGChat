import { useQuery } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { useAuthStore } from '../../auth/authStore'
import { useChatStore } from '../../chat/chatStore'
import { useSettingsStore } from '../../settings/settingsStore'
import { fetchWrongGroups, sampleIds, startWrong } from './practiceService'
import {
  LoginPrompt,
  PickerEmpty,
  PickerError,
  PickerHeader,
  PickerHint,
  PickerLoading,
} from './pickerUi'

export function WrongPicker({ onOpenLogin }: { onOpenLogin?: () => void }) {
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)
  const token = useAuthStore((state) => state.token)
  const startPracticeFrom = useChatStore((state) => state.startPracticeFrom)
  const [pending, setPending] = useState(false)

  const groups = useQuery({
    queryKey: ['tk', 'wrong-groups', apiBaseUrl, token],
    queryFn: ({ signal }) => fetchWrongGroups({ baseUrl: apiBaseUrl, token, signal }),
    staleTime: 60 * 1000,
    enabled: Boolean(token),
  })

  const begin = (name: string, ids: number[]) => {
    if (pending) return
    const indexs = sampleIds(ids)
    if (indexs.length === 0) return

    setPending(true)
    void startPracticeFrom(
      () => startWrong(name, indexs, { baseUrl: apiBaseUrl, token }),
      '/wrong',
    ).finally(() => setPending(false))
  }

  if (!token) {
    return (
      <section className="practice-tool" aria-label="错题复盘">
        <PickerHeader title="错题复盘" subtitle="从最近的错题里抽几道，重新梳理思路。" />
        <LoginPrompt onOpenLogin={onOpenLogin} />
      </section>
    )
  }

  return (
    <section className="practice-tool" aria-label="错题复盘">
      <PickerHeader
        title="错题复盘"
        subtitle="每组最多随机抽 10 道，换一个角度再看一遍。"
        aside={<RotateCcw size={16} aria-hidden="true" />}
      />

      {groups.isPending ? <PickerLoading label="正在整理错题…" /> : null}
      {groups.isError ? (
        <PickerError error={groups.error} onRetry={() => void groups.refetch()} />
      ) : null}

      {groups.isSuccess && groups.data.length === 0 ? (
        <PickerEmpty>暂时没有错题，先做一组练习吧。</PickerEmpty>
      ) : null}

      {groups.data && groups.data.length > 0 ? (
        <div className="picker-scroll">
          {groups.data.map((group) => (
            <div key={group.tag} className="record-card">
              <div className="record-card-head">
                <span className="record-title">{group.tag}</span>
                <span className="picker-count">
                  {(Array.isArray(group.item) ? group.item : []).length} 道
                </span>
              </div>
              <div className="record-actions">
                <button
                  type="button"
                  className="picker-primary"
                  disabled={pending || !Array.isArray(group.item) || group.item.length === 0}
                  onClick={() =>
                    begin(
                      group.tag,
                      (Array.isArray(group.item) ? group.item : []).map((item) => item.id),
                    )
                  }
                >
                  {pending ? '正在准备…' : '复盘这一组'}
                </button>
                <PickerHint>随机抽最多 10 道</PickerHint>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
