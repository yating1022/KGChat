import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { ShenlunRecord } from '../../api/types'
import { toUserMessage } from '../../api/errors'
import { useAuthStore } from '../../auth/authStore'
import { useChatStore } from '../../chat/chatStore'
import { useSettingsStore } from '../../settings/settingsStore'
import { PickerEmpty, PickerError, PickerHeader, PickerLoading } from '../practice/pickerUi'
import {
  listShenlunPapers,
  listShenlunRecords,
  loadShenlunPaper,
  removeShenlunRecord,
} from './shenlunService'

export interface ShenlunPickerProps {
  onOpenLogin?: () => void
}

function recordTitle(record: ShenlunRecord): string {
  const text = (record.wt ?? '').replace(/<[^>]*>/g, '').trim()
  return text ? text.slice(0, 42) : '一次申论作答'
}

function recordSid(record: ShenlunRecord): string {
  return String(record.sid)
}

export function ShenlunPicker({ onOpenLogin }: ShenlunPickerProps) {
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)
  const token = useAuthStore((state) => state.token)
  const startShenlunFrom = useChatStore((state) => state.startShenlunFrom)
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [confirmSid, setConfirmSid] = useState<string | null>(null)
  const [deletingSid, setDeletingSid] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const papers = useQuery({
    queryKey: ['sl', 'papers', apiBaseUrl],
    queryFn: ({ signal }) => listShenlunPapers({ baseUrl: apiBaseUrl, signal }),
    staleTime: 60 * 60 * 1000,
  })

  const records = useQuery({
    queryKey: ['sl', 'records', apiBaseUrl, token],
    queryFn: ({ signal }) => listShenlunRecords({ baseUrl: apiBaseUrl, token, signal }),
    staleTime: 30 * 1000,
    enabled: Boolean(token),
  })

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const list = papers.data ?? []

    return list
      .map((category) => ({
        ...category,
        list: category.list.filter((paper) => {
          if (!keyword) return true
          return (
            paper.testName.toLowerCase().includes(keyword) ||
            category.typeName.toLowerCase().includes(keyword)
          )
        }),
      }))
      .filter((category) => category.list.length > 0)
  }, [papers.data, search])

  const openPaper = (paperId: string | number) => {
    if (pendingId !== null) return
    if (!token) {
      onOpenLogin?.()
      return
    }

    setPendingId(String(paperId))
    void startShenlunFrom(
      () => loadShenlunPaper(paperId, { baseUrl: apiBaseUrl, token }),
      '/shenlun',
    ).finally(() => setPendingId(null))
  }

  const remove = async (record: ShenlunRecord) => {
    if (deletingSid) return
    const sid = recordSid(record)
    setDeletingSid(sid)
    setDeleteError(null)

    try {
      await removeShenlunRecord(sid, { baseUrl: apiBaseUrl, token })
      setConfirmSid(null)
      await queryClient.invalidateQueries({ queryKey: ['sl', 'records', apiBaseUrl, token] })
      await records.refetch()
    } catch (error) {
      setDeleteError(toUserMessage(error))
    } finally {
      setDeletingSid(null)
    }
  }

  return (
    <section className="practice-tool shenlun-picker" aria-label="申论练习">
      <PickerHeader
        title="申论材料"
        subtitle="选一份材料，读完直接写完整作答，可以保存后送去批改。"
        aside={<FileText size={16} aria-hidden="true" />}
      />

      <label className="picker-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索材料分类或名称"
          aria-label="搜索申论材料"
        />
      </label>

      {papers.isPending ? <PickerLoading label="正在整理申论材料…" /> : null}
      {papers.isError ? (
        <PickerError error={papers.error} onRetry={() => void papers.refetch()} />
      ) : null}
      {papers.isSuccess && filtered.length === 0 ? (
        <PickerEmpty>没有找到匹配的申论材料，换个关键词试试。</PickerEmpty>
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
                <span>{category.typeName}</span>
                <span className="picker-count">{category.list.length} 份</span>
              </summary>
              <div className="picker-category-body">
                {category.list.map((paper) => (
                  <button
                    key={String(paper.id)}
                    type="button"
                    className="picker-paper"
                    onClick={() => openPaper(paper.id)}
                    disabled={pendingId !== null}
                  >
                    <span className="picker-paper-title">{paper.testName}</span>
                    <span className="picker-paper-meta">
                      {pendingId === String(paper.id) ? '正在打开…' : '申论'}
                    </span>
                  </button>
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : null}

      <div className="shenlun-records">
        <p className="shenlun-records-title">我的作答记录</p>

        {!token ? (
          <PickerEmpty>
            <p>登录后可以查看之前的作答和批改状态。</p>
            {onOpenLogin ? (
              <button type="button" className="picker-primary" onClick={onOpenLogin}>
                去登录
              </button>
            ) : null}
          </PickerEmpty>
        ) : null}

        {token && records.isPending ? <PickerLoading label="正在读取作答记录…" /> : null}
        {records.isError ? (
          <PickerError error={records.error} onRetry={() => void records.refetch()} />
        ) : null}

        {records.isSuccess && records.data.length === 0 ? (
          <PickerEmpty>还没有申论作答记录，完成一次作答后会出现在这里。</PickerEmpty>
        ) : null}

        {records.data && records.data.length > 0 ? (
          <div className="picker-scroll">
            {records.data.map((record) => {
              const sid = recordSid(record)
              const confirming = confirmSid === sid
              const deleting = deletingSid === sid

              return (
                <div key={sid} className="record-card">
                  <div className="record-card-head">
                    <span className="record-title">{recordTitle(record)}</span>
                    <span className="picker-count">
                      {Number(record.pgStatus) > 0 ? '已批改' : '待批改'}
                    </span>
                  </div>
                  <p className="record-meta">
                    {record.name || '申论作答'}
                    {record.utime || record.ctime ? ` · ${record.utime ?? record.ctime}` : ''}
                  </p>

                  {confirming ? (
                    <div className="record-actions" data-confirm-open="true">
                      <span className="shenlun-confirm">确认删除这条作答记录？</span>
                      <button
                        type="button"
                        className="picker-chip"
                        onClick={() => setConfirmSid(null)}
                        disabled={deleting}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="picker-primary shenlun-danger"
                        onClick={() => void remove(record)}
                        disabled={deleting}
                      >
                        {deleting ? '正在删除…' : '确认删除'}
                      </button>
                    </div>
                  ) : (
                    <div className="record-actions">
                      <button
                        type="button"
                        className="picker-chip"
                        onClick={() => {
                          setDeleteError(null)
                          setConfirmSid(sid)
                        }}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                        <span>删除</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : null}

        {deleteError ? <p className="shenlun-status shenlun-status--error">{deleteError}</p> : null}
      </div>
    </section>
  )
}
