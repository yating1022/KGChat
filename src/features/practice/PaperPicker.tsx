import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { PaperSource } from '../../api/types'
import { useAuthStore } from '../../auth/authStore'
import { useChatStore } from '../../chat/chatStore'
import { useSettingsStore } from '../../settings/settingsStore'
import { fetchPaperCategories, startPaper } from './practiceService'
import { PickerEmpty, PickerError, PickerHeader, PickerLoading } from './pickerUi'

export function PaperPicker() {
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)
  const token = useAuthStore((state) => state.token)
  const startPracticeFrom = useChatStore((state) => state.startPracticeFrom)
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState(false)

  const categories = useQuery({
    queryKey: ['tk', 'paper-categories', apiBaseUrl],
    queryFn: ({ signal }) => fetchPaperCategories({ baseUrl: apiBaseUrl, signal }),
    staleTime: 60 * 60 * 1000,
  })

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const list = categories.data ?? []

    return list
      .map((category) => ({
        ...category,
        tkSources: category.tkSources.filter((source) => {
          if (!keyword) return true
          return (
            source.source.toLowerCase().includes(keyword) ||
            category.title.toLowerCase().includes(keyword)
          )
        }),
      }))
      .filter((category) => category.tkSources.length > 0)
  }, [categories.data, search])

  const select = (source: PaperSource) => {
    if (pending) return
    setPending(true)
    void startPracticeFrom(
      () => startPaper(source, { baseUrl: apiBaseUrl, token }),
      '/paper',
    ).finally(() => setPending(false))
  }

  return (
    <section className="practice-tool" aria-label="历年试卷">
      <PickerHeader
        title="从历年题里选一组"
        subtitle="按分类找到想练的题，选中后直接开始对话式练习。"
      />

      <label className="picker-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索分类或题目来源"
          aria-label="搜索试卷"
        />
      </label>

      {categories.isPending ? <PickerLoading label="正在整理历年题…" /> : null}

      {categories.isError ? (
        <PickerError error={categories.error} onRetry={() => void categories.refetch()} />
      ) : null}

      {categories.isSuccess && filtered.length === 0 ? (
        <PickerEmpty>没有找到匹配的题目来源，换个关键词试试。</PickerEmpty>
      ) : null}

      {filtered.length > 0 ? (
        <div className="picker-scroll">
          {filtered.map((category, categoryIndex) => (
            <details
              key={category.id}
              className="picker-category"
              open={search.trim().length > 0 || categoryIndex === 0 ? true : undefined}
            >
              <summary>
                <span>{category.title}</span>
                <span className="picker-count">{category.tkSources.length} 套</span>
              </summary>
              <div className="picker-category-body">
                {category.tkSources.map((source) => (
                  <button
                    key={source.sid}
                    type="button"
                    className="picker-paper"
                    onClick={() => select(source)}
                    disabled={pending}
                  >
                    <span className="picker-paper-title">{source.source}</span>
                    <span className="picker-paper-meta">
                      {source.difficulty ? `难度 ${source.difficulty}` : '历年题'}
                    </span>
                  </button>
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </section>
  )
}
