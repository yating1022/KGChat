import {
  BookOpen,
  FileText,
  GraduationCap,
  History,
  MessageSquare,
  PenLine,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Wrench,
} from 'lucide-react'

import { AnalyzeTool } from '../../features/analyze/AnalyzeTool'
import { PracticeTool } from '../../features/practice/PracticeTool'
import { ShenlunTool } from '../../features/shenlun/ShenlunTool'
import { WordTool } from '../../features/vocabulary/WordTool'
import type { ChatAction, ToolKind } from '../../chat/chatTypes'
import { toolsLabel } from '../../skins/copy'
import { useSkinOptional } from '../../skins/SkinProvider'

export interface ToolPanelProps {
  onAction: (action: ChatAction) => void
  onOpenLogin?: () => void
  variant?: 'inline' | 'drawer'
  /** When set, renders the matching picker instead of the menu. */
  tool?: ToolKind
  /** Prefilled query for the word tool. */
  query?: string
}

const PRACTICE_ENTRIES: Array<{
  icon: typeof Sparkles
  label: string
  command: string
}> = [
  { icon: Sparkles, label: '找一组题（智能组卷）', command: '/practice' },
  { icon: BookOpen, label: '历年试卷', command: '/paper' },
  { icon: GraduationCap, label: '专项练习', command: '/special' },
  { icon: RotateCcw, label: '错题复盘', command: '/wrong' },
  { icon: Star, label: '收藏题目', command: '/favorites' },
  { icon: History, label: '练习记录', command: '/history' },
  { icon: PenLine, label: '申论练习', command: '/shenlun' },
  { icon: Sparkles, label: '词语辨析', command: '/analyze tool' },
  { icon: Search, label: '查成语与词语', command: '/word' },
]

const SECONDARY_ACTIONS: ChatAction[] = [
  { label: '开始新对话', kind: 'command', command: '/new' },
  { label: '查看练习进度', kind: 'command', command: '/progress' },
  { label: '保存练习记录', kind: 'save' },
  { label: '外观与接口设置', kind: 'open-settings' },
]

const PRACTICE_TOOLS: ToolKind[] = ['practice', 'paper', 'special', 'wrong', 'favorites', 'history']

export function ToolPanel({
  onAction,
  onOpenLogin,
  variant = 'inline',
  tool,
  query,
}: ToolPanelProps) {
  const skin = useSkinOptional()?.skin ?? 'gemini'
  const label = toolsLabel(skin)

  if (tool && PRACTICE_TOOLS.includes(tool)) {
    return (
      <div className={`practice-tool-host practice-tool-host--${variant}`}>
        <PracticeTool tool={tool} onOpenLogin={onOpenLogin} />
      </div>
    )
  }

  if (tool === 'shenlun') {
    return (
      <div className={`practice-tool-host practice-tool-host--${variant}`}>
        <ShenlunTool onOpenLogin={onOpenLogin} variant={variant} />
      </div>
    )
  }

  if (tool === 'analyze') {
    return (
      <div className={`practice-tool-host practice-tool-host--${variant}`}>
        <AnalyzeTool onOpenLogin={onOpenLogin} />
      </div>
    )
  }

  if (tool === 'word') {
    return (
      <div className={`practice-tool-host practice-tool-host--${variant}`}>
        <WordTool initialQuery={query} onOpenLogin={onOpenLogin} />
      </div>
    )
  }

  return (
    <section className={`tool-panel tool-panel--${variant}`} aria-label={label}>
      <header className="tool-panel-header">
        <Wrench size={16} aria-hidden="true" />
        <h3 className="tool-panel-title">{label}</h3>
      </header>

      <div className="tool-grid">
        {PRACTICE_ENTRIES.map((entry) => {
          const Icon = entry.icon
          return (
            <button
              key={entry.command}
              type="button"
              className="tool-item tool-item--primary"
              onClick={() =>
                onAction({ label: entry.label, kind: 'command', command: entry.command })
              }
            >
              <Icon size={16} aria-hidden="true" />
              <span>{entry.label}</span>
            </button>
          )
        })}
      </div>

      <div className="tool-secondary">
        {SECONDARY_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            className="tool-secondary-item"
            onClick={() => onAction(action)}
          >
            {action.kind === 'command' ? (
              <MessageSquare size={14} aria-hidden="true" />
            ) : action.kind === 'save' ? (
              <FileText size={14} aria-hidden="true" />
            ) : (
              <SlidersHorizontal size={14} aria-hidden="true" />
            )}
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
