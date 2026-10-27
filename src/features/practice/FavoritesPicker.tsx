import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { useState } from 'react'

import { useAuthStore } from '../../auth/authStore'
import { useChatStore } from '../../chat/chatStore'
import { useSettingsStore } from '../../settings/settingsStore'
import { FAVORITES_SESSION_CAP, fetchFavoriteIds, startFavorites } from './practiceService'
import {
  LoginPrompt,
  PickerEmpty,
  PickerError,
  PickerHeader,
  PickerHint,
  PickerLoading,
} from './pickerUi'

export function FavoritesPicker({ onOpenLogin }: { onOpenLogin?: () => void }) {
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)
  const token = useAuthStore((state) => state.token)
  const startPracticeFrom = useChatStore((state) => state.startPracticeFrom)
  const [pending, setPending] = useState(false)

  const favorites = useQuery({
    queryKey: ['tk', 'favorite-ids', apiBaseUrl, token],
    queryFn: ({ signal }) => fetchFavoriteIds({ baseUrl: apiBaseUrl, token, signal }),
    staleTime: 60 * 1000,
    enabled: Boolean(token),
  })

  const begin = () => {
    if (pending || !favorites.data || favorites.data.length === 0) return
    setPending(true)
    void startPracticeFrom(
      () => startFavorites(favorites.data, { baseUrl: apiBaseUrl, token }),
      '/favorites',
    ).finally(() => setPending(false))
  }

  if (!token) {
    return (
      <section className="practice-tool" aria-label="收藏题目">
        <PickerHeader title="收藏题目" subtitle="把收藏的题拿出来再练一遍。" />
        <LoginPrompt onOpenLogin={onOpenLogin} />
      </section>
    )
  }

  return (
    <section className="practice-tool" aria-label="收藏题目">
      <PickerHeader
        title="收藏题目"
        subtitle="每次最多取 20 道，逐题读取后再开始。"
        aside={<Star size={16} aria-hidden="true" />}
      />

      {favorites.isPending ? <PickerLoading label="正在读取收藏…" /> : null}
      {favorites.isError ? (
        <PickerError error={favorites.error} onRetry={() => void favorites.refetch()} />
      ) : null}

      {favorites.isSuccess && favorites.data.length === 0 ? (
        <PickerEmpty>
          <p>还没有收藏的题目。答完一道题后，可以在对话里点「收藏这道题」。</p>
        </PickerEmpty>
      ) : null}

      {favorites.data && favorites.data.length > 0 ? (
        <div className="picker-favorites">
          <p className="picker-favorites-count">
            共收藏 {favorites.data.length} 道
            {favorites.data.length > FAVORITES_SESSION_CAP
              ? `，本次先取 ${FAVORITES_SESSION_CAP} 道`
              : ''}
          </p>
          <div className="picker-footer">
            <PickerHint>逐题读取时最多同时请求 4 道。</PickerHint>
            <button type="button" className="picker-primary" onClick={begin} disabled={pending}>
              {pending ? '正在读取题目…' : '开始练习'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
