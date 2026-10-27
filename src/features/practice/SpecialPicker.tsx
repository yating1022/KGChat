import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { TagNode } from '../../api/types'
import { useAuthStore } from '../../auth/authStore'
import { useChatStore } from '../../chat/chatStore'
import { useSettingsStore } from '../../settings/settingsStore'
import { fetchTagTree, startTagPaper, type TagLeafSelection } from './practiceService'
import {
  DifficultyChips,
  LoginPrompt,
  PickerError,
  PickerHeader,
  PickerHint,
  PickerLoading,
  type DifficultyValue,
} from './pickerUi'

const MATERIAL_TAGS = ['资料分析', '篇章阅读', '组合排列（材料）'] as const

function isMaterialTag(value: string): boolean {
  return MATERIAL_TAGS.some((tag) => value.includes(tag))
}

function countOptions(count: number): number[] {
  const base = [1, 2, 3, 4, 5, 10, 15, 20, 30]
  const allowed = base.filter((value) => value <= count)
  if (allowed.length > 0) return allowed
  return count > 0 ? [count] : []
}

interface SelectedLeaf {
  id: string
  count: number
  num: number
  material: boolean
}

interface BranchProps {
  nodes: TagNode[]
  parents: string[]
  selected: Record<string, SelectedLeaf>
  hasMaterial: boolean
  hasOther: boolean
  pending: boolean
  onToggle: (node: TagNode, material: boolean) => void
  onNum: (id: string, num: number) => void
}

function TagBranch({
  nodes,
  parents,
  selected,
  hasMaterial,
  hasOther,
  pending,
  onToggle,
  onNum,
}: BranchProps) {
  return (
    <div className="tag-tree">
      {nodes.map((node) => {
        const material = isMaterialTag(node.id) || parents.some(isMaterialTag)
        const children = Array.isArray(node.children) ? node.children : []
        const leaf = children.length === 0
        const count = Number.isFinite(Number(node.count)) ? Number(node.count) : 0

        if (!leaf) {
          return (
            <details key={node.id} className="tag-group" open>
              <summary className="tag-group-label">
                <ChevronRight size={12} aria-hidden="true" />
                <span>{node.id}</span>
                <span className="tag-count">{count}</span>
              </summary>
              <div className="tag-children">
                <TagBranch
                  nodes={children}
                  parents={[...parents, node.id]}
                  selected={selected}
                  hasMaterial={hasMaterial}
                  hasOther={hasOther}
                  pending={pending}
                  onToggle={onToggle}
                  onNum={onNum}
                />
              </div>
            </details>
          )
        }

        const chosen = selected[node.id]
        const conflict = hasMaterial ? !chosen : hasOther && material
        const disabled = pending || count <= 0 || conflict

        return (
          <div key={node.id} className={`tag-leaf ${chosen ? 'is-selected' : ''}`}>
            <label className="tag-leaf-label">
              <input
                type="checkbox"
                checked={Boolean(chosen)}
                disabled={disabled}
                onChange={() => onToggle(node, material)}
              />
              <span>{node.id}</span>
            </label>
            <span className="tag-count">{count} 题</span>
            {chosen ? (
              <select
                className="tag-num-select"
                value={chosen.num}
                aria-label={`${node.id} 题数`}
                disabled={pending}
                onChange={(event) => onNum(node.id, Number(event.target.value))}
              >
                {countOptions(chosen.count).map((value) => (
                  <option key={value} value={value}>
                    {value} 题
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function SpecialPicker({ onOpenLogin }: { onOpenLogin?: () => void }) {
  const apiBaseUrl = useSettingsStore((state) => state.apiBaseUrl)
  const token = useAuthStore((state) => state.token)
  const startPracticeFrom = useChatStore((state) => state.startPracticeFrom)
  const [selected, setSelected] = useState<Record<string, SelectedLeaf>>({})
  const [difficulty, setDifficulty] = useState<DifficultyValue>(null)
  const [pending, setPending] = useState(false)

  const tree = useQuery({
    queryKey: ['tk', 'tag-tree', apiBaseUrl, token],
    queryFn: ({ signal }) => fetchTagTree({ baseUrl: apiBaseUrl, token, signal }),
    staleTime: 30 * 60 * 1000,
    enabled: Boolean(token),
  })

  const leaves = useMemo(() => Object.values(selected), [selected])
  const total = leaves.reduce((sum, leaf) => sum + leaf.num, 0)
  const hasMaterial = leaves.some((leaf) => leaf.material)
  const hasOther = leaves.some((leaf) => !leaf.material)

  const toggle = (node: TagNode, material: boolean) => {
    setSelected((current) => {
      if (current[node.id]) {
        const next = { ...current }
        delete next[node.id]
        return next
      }

      const values = Object.values(current)
      const currentHasMaterial = values.some((leaf) => leaf.material)
      const currentHasOther = values.some((leaf) => !leaf.material)

      // Material categories cannot mix with anything else.
      if (currentHasMaterial || (material && currentHasOther)) return current

      const count = Number.isFinite(Number(node.count)) ? Number(node.count) : 0
      const num = Math.min(5, Math.max(1, count))
      return { ...current, [node.id]: { id: node.id, count, num, material } }
    })
  }

  const setNum = (id: string, num: number) => {
    setSelected((current) => {
      const leaf = current[id]
      if (!leaf) return current
      return { ...current, [id]: { ...leaf, num } }
    })
  }

  const begin = () => {
    if (pending || total < 5) return
    const reqs: TagLeafSelection[] = leaves.map((leaf) => ({ name: leaf.id, num: leaf.num }))
    setPending(true)
    void startPracticeFrom(
      () => startTagPaper(reqs, difficulty, { baseUrl: apiBaseUrl, token }),
      '/special',
    ).finally(() => setPending(false))
  }

  if (!token) {
    return (
      <section className="practice-tool" aria-label="专项练习">
        <PickerHeader title="专项练习" subtitle="选择一个或多个知识点，集中练一组。" />
        <LoginPrompt onOpenLogin={onOpenLogin} />
      </section>
    )
  }

  return (
    <section className="practice-tool" aria-label="专项练习">
      <PickerHeader title="专项练习" subtitle="选择知识点并设定题数，合计至少 5 题。" />

      {tree.isPending ? <PickerLoading label="正在读取知识点…" /> : null}
      {tree.isError ? <PickerError error={tree.error} onRetry={() => void tree.refetch()} /> : null}

      {tree.isSuccess ? (
        <div className="picker-scroll picker-scroll--tree">
          <TagBranch
            nodes={tree.data}
            parents={[]}
            selected={selected}
            hasMaterial={hasMaterial}
            hasOther={hasOther}
            pending={pending}
            onToggle={toggle}
            onNum={setNum}
          />
        </div>
      ) : null}

      <div>
        <p className="picker-label">难度</p>
        <DifficultyChips value={difficulty} onChange={setDifficulty} disabled={pending} />
      </div>

      {hasMaterial ? (
        <PickerHint>资料类专项需要单独练习，不能和其他知识点混在一起。</PickerHint>
      ) : null}

      <div className="picker-footer">
        <PickerHint>
          合计 {total} 题{total < 5 ? '，至少需要 5 题' : ''}
        </PickerHint>
        <button
          type="button"
          className="picker-primary"
          onClick={begin}
          disabled={pending || total < 5}
        >
          {pending ? '正在准备…' : '开始练习'}
        </button>
      </div>
    </section>
  )
}
