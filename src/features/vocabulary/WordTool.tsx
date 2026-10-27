import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, BookMarked, Bookmark, Loader2, Search, Star, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { MembershipError, toUserMessage } from '../../api/errors'
import type { PersonalWord, WordDetail, WordKind, WordSummary } from '../../api/types'
import { useAuthStore } from '../../auth/authStore'
import { useChatStore } from '../../chat/chatStore'
import { HtmlContent } from '../../components/common/HtmlContent'
import { useSettingsStore } from '../../settings/settingsStore'
import { PickerEmpty, PickerError, PickerHint, PickerLoading } from '../practice/pickerUi'
import {
  WORD_KIND_LABELS,
  addVocabularyToPersonal,
  isWordInPersonalList,
  loadHighFrequency,
  loadPersonalWords,
  loadVocabularyDetail,
  normalizeWordKind,
  personalWordInputFrom,
  removePersonalWord,
  searchVocabulary,
  splitWordList,
  toggleHighFrequency,
  updatePersonalWord,
  wordDetailReference,
  wordKindFromWordType,
} from './vocabService'

export interface WordToolProps {
  initialQuery?: string
  initialKind?: WordKind
  onOpenLogin?: () => void
}

interface SearchState {
  kind: WordKind
  query: string
  results: WordSummary[]
}

interface EditState {
  id: number
  wordContent: string
  pinyin: string
  explanation: string
  wordSex: string
  example: string
  similar: string
  opposite: string
}

function WordError({ message }: { message: string }) {
  return (
    <div className="picker-error" role="status">
      <AlertCircle size={16} aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

function emptyEdit(word: PersonalWord): EditState {
  return {
    id: word.id,
    wordContent: word.wordContent,
    pinyin: word.pinyin ?? '',
    explanation: word.explanation ?? '',
    wordSex: word.wordSex ?? '',
    example: word.example ?? '',
    similar: word.similar ?? '',
    opposite: word.opposite ?? '',
  }
}

function WordDetailCard({
  detail,
  kind,
  inPersonal,
  highFrequencySaved,
  inHighFrequencyList,
  highFrequencyAvailable,
  pendingAction,
  onAddPersonal,
  onToggleHighFrequency,
}: {
  detail: WordDetail
  kind: WordKind
  inPersonal: boolean
  highFrequencySaved: boolean
  inHighFrequencyList: boolean
  highFrequencyAvailable: boolean
  pendingAction: string | null
  onAddPersonal: () => void
  onToggleHighFrequency: () => void
}) {
  const similar = splitWordList(detail.similar)
  const opposite = splitWordList(detail.opposite)

  return (
    <article className="word-card" aria-label={`${WORD_KIND_LABELS[kind]}详情`}>
      <header className="word-card-head">
        <div>
          <h4 className="word-card-title">{detail.wordContent}</h4>
          {detail.pinyin ? <p className="word-card-pinyin">{detail.pinyin}</p> : null}
        </div>
        {detail.wordSex ? <span className="word-tag">{detail.wordSex}</span> : null}
      </header>

      {detail.explanation ? (
        <div className="word-card-block">
          <p className="word-card-label">释义</p>
          <HtmlContent className="word-card-text" html={detail.explanation} />
        </div>
      ) : null}

      {detail.derivation ? (
        <div className="word-card-block">
          <p className="word-card-label">出处</p>
          <HtmlContent className="word-card-text word-card-text--muted" html={detail.derivation} />
        </div>
      ) : null}

      {detail.example ? (
        <div className="word-card-block">
          <p className="word-card-label">例句</p>
          <HtmlContent className="word-card-text" html={detail.example} />
        </div>
      ) : null}

      {similar.length > 0 || opposite.length > 0 ? (
        <div className="word-card-block word-card-lists">
          {similar.length > 0 ? (
            <div>
              <p className="word-card-label">近义</p>
              <div className="word-tags">
                {similar.map((item) => (
                  <span key={`similar-${item}`} className="word-tag">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {opposite.length > 0 ? (
            <div>
              <p className="word-card-label">反义</p>
              <div className="word-tags">
                {opposite.map((item) => (
                  <span key={`opposite-${item}`} className="word-tag word-tag--soft">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="word-card-actions">
        <button
          type="button"
          className="picker-chip"
          onClick={onAddPersonal}
          disabled={inPersonal || pendingAction === 'personal'}
        >
          <Bookmark size={13} aria-hidden="true" />
          <span>{inPersonal ? '已在生词本' : pendingAction === 'personal' ? '正在加入…' : '加入生词本'}</span>
        </button>

        {inHighFrequencyList ? (
          <button
            type="button"
            className="picker-chip"
            onClick={onToggleHighFrequency}
            disabled={pendingAction === 'high-frequency'}
          >
            <Star size={13} aria-hidden="true" />
            <span>
              {highFrequencySaved
                ? '取消高频收藏'
                : pendingAction === 'high-frequency'
                  ? '正在收藏…'
                  : '收藏高频词'}
            </span>
          </button>
        ) : highFrequencyAvailable ? (
          <PickerHint>这个词不在高频词表里，可以先用生词本收藏。</PickerHint>
        ) : null}
      </div>
    </article>
  )
}

export function WordTool({
  initialQuery,
  initialKind,
  onOpenLogin,
}: WordToolProps) {
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)
  const token = useAuthStore((state) => state.token)
  const updateWordState = useChatStore((state) => state.updateWordState)
  const queryClient = useQueryClient()

  const [kind, setKind] = useState<WordKind>(normalizeWordKind(initialKind))
  const [query, setQuery] = useState(initialQuery ?? '')
  const [search, setSearch] = useState<SearchState | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [detail, setDetail] = useState<WordDetail | null>(null)
  const [detailKind, setDetailKind] = useState<WordKind>(normalizeWordKind(initialKind))
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [membershipNote, setMembershipNote] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const initialRun = useRef<string | null>(null)

  const context = { baseUrl: apiBaseUrl, token }

  const highFrequency = useQuery({
    queryKey: ['word', 'high-frequency', apiBaseUrl, token],
    queryFn: ({ signal }) => loadHighFrequency({ baseUrl: apiBaseUrl, token, signal }),
    staleTime: 30 * 1000,
    enabled: Boolean(token),
    retry: false,
  })

  const personal = useQuery({
    queryKey: ['word', 'personal', apiBaseUrl, token],
    queryFn: ({ signal }) => loadPersonalWords({ baseUrl: apiBaseUrl, token, signal }),
    staleTime: 30 * 1000,
    enabled: Boolean(token),
    retry: false,
  })

  const handleError = (error: unknown, fallback: (message: string) => void) => {
    if (error instanceof MembershipError) {
      setMembershipNote(toUserMessage(error))
      return
    }
    fallback(toUserMessage(error))
  }

  const runSearch = async (searchKind: WordKind, rawQuery: string) => {
    const trimmed = rawQuery.trim()
    if (!trimmed) {
      setSearchError('先输入一个成语或词语')
      return
    }

    setSearching(true)
    setSearchError(null)
    setDetail(null)
    setDetailError(null)
    setActionNote(null)
    setActionError(null)

    try {
      const result = await searchVocabulary(searchKind, trimmed, { baseUrl: apiBaseUrl, token })
      setKind(searchKind)
      setSearch(result)
      updateWordState({
        kind: searchKind,
        query: result.query,
        results: result.results,
      })
    } catch (error) {
      handleError(error, setSearchError)
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    const trimmed = initialQuery?.trim()
    if (!trimmed || initialRun.current === trimmed) return
    initialRun.current = trimmed
    void runSearch(normalizeWordKind(initialKind), trimmed)
    // The prefilled query is a one-shot instruction from a chat command.
  }, [initialQuery, initialKind])

  useEffect(() => {
    if (!highFrequency.data) return
    updateWordState({
      highFrequency: true,
      savedIds: highFrequency.data.myWordId,
    })
  }, [highFrequency.data, updateWordState])

  const openDetail = async (target: WordSummary, targetKind: WordKind = kind) => {
    if (detailLoading) return
    setDetailLoading(true)
    setDetailError(null)
    setActionNote(null)
    setActionError(null)
    setMembershipNote(null)

    try {
      const word = await loadVocabularyDetail(
        targetKind,
        wordDetailReference(targetKind, target),
        context,
      )
      setDetail(word)
      setDetailKind(targetKind)
      updateWordState({ current: word })
    } catch (error) {
      handleError(error, setDetailError)
    } finally {
      setDetailLoading(false)
    }
  }

  const personalWords = personal.data?.data ?? []
  const personalCode = personal.data?.code ?? 0
  const inPersonal = detail ? isWordInPersonalList(detail, personalWords) : false
  const highFrequencyWords = highFrequency.data?.hword ?? []
  const savedIds = highFrequency.data?.myWordId ?? []
  const inHighFrequencyList = detail
    ? highFrequencyWords.some((word) => word.id === detail.id)
    : false
  const highFrequencySaved = detail ? savedIds.includes(detail.id) : false

  const addPersonal = async () => {
    if (!detail || pendingAction) return
    if (!token) {
      onOpenLogin?.()
      return
    }

    setPendingAction('personal')
    setActionNote(null)
    setActionError(null)

    try {
      await addVocabularyToPersonal(detail, { baseUrl: apiBaseUrl, token })
      setActionNote('已加入生词本。')
      await queryClient.invalidateQueries({ queryKey: ['word', 'personal'] })
      await personal.refetch()
    } catch (error) {
      handleError(error, setActionError)
    } finally {
      setPendingAction(null)
    }
  }

  const toggleFrequency = async (wordId: number, saved: boolean) => {
    if (pendingAction) return
    if (!token) {
      onOpenLogin?.()
      return
    }

    setPendingAction('high-frequency')
    setActionNote(null)
    setActionError(null)

    try {
      await toggleHighFrequency(wordId, saved, { baseUrl: apiBaseUrl, token })
      setActionNote(saved ? '已取消高频收藏。' : '已收藏为高频词。')
      await queryClient.invalidateQueries({ queryKey: ['word', 'high-frequency'] })
      await highFrequency.refetch()
    } catch (error) {
      handleError(error, setActionError)
    } finally {
      setPendingAction(null)
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    const target = personalWords.find((word) => word.id === editing.id)
    if (!target) return

    setPendingAction(`edit-${editing.id}`)
    setListError(null)

    try {
      await updatePersonalWord(
        personalWordInputFrom(target, {
          wordContent: editing.wordContent,
          pinyin: editing.pinyin,
          explanation: editing.explanation,
          wordSex: editing.wordSex,
          example: editing.example,
          similar: editing.similar,
          opposite: editing.opposite,
        }),
        { baseUrl: apiBaseUrl, token },
      )
      setEditing(null)
      await personal.refetch()
    } catch (error) {
      handleError(error, setListError)
    } finally {
      setPendingAction(null)
    }
  }

  const removePersonal = async (id: number) => {
    if (pendingAction) return
    setPendingAction(`delete-${id}`)
    setListError(null)

    try {
      await removePersonalWord(id, { baseUrl: apiBaseUrl, token })
      setConfirmDeleteId(null)
      if (editing?.id === id) setEditing(null)
      await personal.refetch()
    } catch (error) {
      handleError(error, setListError)
    } finally {
      setPendingAction(null)
    }
  }

  const savedIdSet = useMemo(() => new Set(savedIds), [savedIds])

  return (
    <section className="practice-tool word-tool" aria-label="成语与词语">
      <header className="picker-head">
        <div>
          <h3 className="picker-title">查成语与词语</h3>
          <p className="picker-subtitle">
            先搜一个成语或词语，再看释义、出处、例句和近反义。
          </p>
        </div>
        <span className="picker-head-aside">
          <BookMarked size={16} aria-hidden="true" />
        </span>
      </header>

      <div className="picker-chips" role="group" aria-label="查询类型">
        {(['idiom', 'term'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`picker-chip ${kind === value ? 'is-active' : ''}`}
            onClick={() => setKind(value)}
          >
            {WORD_KIND_LABELS[value]}
          </button>
        ))}
      </div>

      <form
        className="picker-search"
        onSubmit={(event) => {
          event.preventDefault()
          void runSearch(kind, query)
        }}
      >
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={kind === 'idiom' ? '输入一个成语，例如 一蹴而就' : '输入一个词语，例如 斡旋'}
          aria-label="搜索成语或词语"
        />
        <button type="submit" className="picker-chip" disabled={searching}>
          {searching ? '搜索中…' : '搜索'}
        </button>
      </form>

      {searchError ? <WordError message={searchError} /> : null}
      {searching ? <PickerLoading label="正在查找…" /> : null}

      {search && search.results.length === 0 ? (
        <PickerEmpty>没有找到相关词条，换个写法试试。</PickerEmpty>
      ) : null}

      {search && search.results.length > 0 ? (
        <div className="word-results">
          {search.results.map((result) => (
            <button
              key={`${search.kind}-${result.id}`}
              type="button"
              className="word-result"
              onClick={() => void openDetail(result, search.kind)}
              disabled={detailLoading}
            >
              <span>{result.value}</span>
              {result.hot ? <span className="word-tag word-tag--hot">高频</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {detailLoading ? <PickerLoading label="正在读取词条…" /> : null}
      {detailError ? <WordError message={detailError} /> : null}

      {detail ? (
        <WordDetailCard
          detail={detail}
          kind={detailKind}
          inPersonal={inPersonal}
          highFrequencySaved={highFrequencySaved}
          inHighFrequencyList={inHighFrequencyList}
          highFrequencyAvailable={Boolean(token) && highFrequency.isSuccess}
          pendingAction={pendingAction}
          onAddPersonal={() => void addPersonal()}
          onToggleHighFrequency={() => void toggleFrequency(detail.id, highFrequencySaved)}
        />
      ) : null}

      {actionNote ? <p className="word-note">{actionNote}</p> : null}
      {actionError ? <WordError message={actionError} /> : null}
      {membershipNote ? <p className="shenlun-status shenlun-status--error">{membershipNote}</p> : null}

      {!token ? (
        <PickerEmpty>
          <p>登录后可以查看高频词和生词本。</p>
          {onOpenLogin ? (
            <button type="button" className="picker-primary" onClick={onOpenLogin}>
              去登录
            </button>
          ) : null}
        </PickerEmpty>
      ) : null}

      {token ? (
        <details className="word-section">
          <summary>
            <Star size={14} aria-hidden="true" />
            <span>高频词</span>
            <span className="picker-count">{highFrequencyWords.length}</span>
          </summary>

          {highFrequency.isPending ? <PickerLoading label="正在读取高频词…" /> : null}
          {highFrequency.isError ? (
            highFrequency.error instanceof MembershipError ? (
              <PickerEmpty>高频词需要有效的会员状态，暂时无法读取。</PickerEmpty>
            ) : (
              <PickerError
                error={highFrequency.error}
                onRetry={() => void highFrequency.refetch()}
              />
            )
          ) : null}

          {highFrequency.isSuccess && highFrequencyWords.length === 0 ? (
            <PickerEmpty>高频词表暂时是空的。</PickerEmpty>
          ) : null}

          {highFrequencyWords.length > 0 ? (
            <div className="word-list">
              {highFrequencyWords.map((word) => {
                const saved = savedIdSet.has(word.id)
                return (
                  <div key={`hword-${word.id}`} className="word-row">
                    <button
                      type="button"
                      className="word-row-main"
                      onClick={() =>
                        void openDetail(
                          { id: word.id, value: word.wordContent, hot: true },
                          wordKindFromWordType(word.wordType),
                        )
                      }
                    >
                      <span className="word-row-title">{word.wordContent}</span>
                      {word.pinyin ? <span className="word-row-meta">{word.pinyin}</span> : null}
                    </button>
                    <button
                      type="button"
                      className="picker-chip"
                      disabled={pendingAction === 'high-frequency'}
                      onClick={() => void toggleFrequency(word.id, saved)}
                    >
                      {saved ? '取消收藏' : '收藏'}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}
        </details>
      ) : null}

      {token ? (
        <details className="word-section">
          <summary>
            <Bookmark size={14} aria-hidden="true" />
            <span>生词本</span>
            <span className="picker-count">{personalWords.length}</span>
          </summary>

          {personalCode === 102 ? (
            <PickerEmpty>生词本部分内容需要有效的会员状态，下面仍会显示已保存的词。</PickerEmpty>
          ) : null}

          {personal.isPending ? <PickerLoading label="正在读取生词本…" /> : null}
          {personal.isError ? (
            <PickerError error={personal.error} onRetry={() => void personal.refetch()} />
          ) : null}

          {personal.isSuccess && personalWords.length === 0 ? (
            <PickerEmpty>生词本还是空的，可以在词条详情里加入。</PickerEmpty>
          ) : null}

          {personalWords.length > 0 ? (
            <div className="word-list">
              {personalWords.map((word) => {
                const isEditing = editing?.id === word.id
                const confirming = confirmDeleteId === word.id

                return (
                  <div key={`personal-${word.id}`} className="word-row word-row--stacked">
                    {isEditing ? (
                      <div className="word-edit">
                        <label className="word-edit-field">
                          <span>词条</span>
                          <input
                            value={editing.wordContent}
                            onChange={(event) =>
                              setEditing({ ...editing, wordContent: event.target.value })
                            }
                          />
                        </label>
                        <label className="word-edit-field">
                          <span>拼音</span>
                          <input
                            value={editing.pinyin}
                            onChange={(event) =>
                              setEditing({ ...editing, pinyin: event.target.value })
                            }
                          />
                        </label>
                        <label className="word-edit-field">
                          <span>释义</span>
                          <textarea
                            rows={3}
                            value={editing.explanation}
                            onChange={(event) =>
                              setEditing({ ...editing, explanation: event.target.value })
                            }
                          />
                        </label>
                        <label className="word-edit-field">
                          <span>例句</span>
                          <textarea
                            rows={2}
                            value={editing.example}
                            onChange={(event) =>
                              setEditing({ ...editing, example: event.target.value })
                            }
                          />
                        </label>
                        <label className="word-edit-field">
                          <span>感情色彩</span>
                          <input
                            value={editing.wordSex}
                            onChange={(event) =>
                              setEditing({ ...editing, wordSex: event.target.value })
                            }
                          />
                        </label>
                        <div className="record-actions">
                          <button
                            type="button"
                            className="picker-chip"
                            onClick={() => setEditing(null)}
                            disabled={pendingAction !== null}
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            className="picker-primary"
                            onClick={() => void saveEdit()}
                            disabled={pendingAction !== null}
                          >
                            {pendingAction === `edit-${word.id}` ? '正在保存…' : '保存修改'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="word-row-main"
                          onClick={() =>
                            void openDetail(
                              {
                                id: word.id,
                                value: word.wordContent,
                                hot: Boolean(word.hot),
                              },
                              wordKindFromWordType(word.wordType),
                            )
                          }
                        >
                          <span className="word-row-title">{word.wordContent}</span>
                          {word.pinyin ? (
                            <span className="word-row-meta">{word.pinyin}</span>
                          ) : null}
                        </button>

                        {confirming ? (
                          <div className="record-actions" data-confirm-open="true">
                            <span className="shenlun-confirm">确认从生词本删除？</span>
                            <button
                              type="button"
                              className="picker-chip"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={pendingAction !== null}
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              className="picker-primary shenlun-danger"
                              onClick={() => void removePersonal(word.id)}
                              disabled={pendingAction !== null}
                            >
                              {pendingAction === `delete-${word.id}` ? '正在删除…' : '确认删除'}
                            </button>
                          </div>
                        ) : (
                          <div className="record-actions">
                            <button
                              type="button"
                              className="picker-chip"
                              onClick={() => setEditing(emptyEdit(word))}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="picker-chip"
                              onClick={() => setConfirmDeleteId(word.id)}
                            >
                              <Trash2 size={13} aria-hidden="true" />
                              <span>删除</span>
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          ) : null}

          {listError ? <p className="shenlun-status shenlun-status--error">{listError}</p> : null}
        </details>
      ) : null}

      {pendingAction ? (
        <p className="word-note">
          <Loader2 className="picker-spin" size={13} aria-hidden="true" /> 正在处理…
        </p>
      ) : null}
    </section>
  )
}
