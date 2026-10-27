import { createId } from '../lib/ids'
import { formatClock, formatDuration } from '../lib/time'
import {
  optionLabel,
  type ActionsChatMessage,
  type AnalysisChatMessage,
  type ChatAction,
  type FeedbackChatMessage,
  type NoticeChatMessage,
  type PracticeQuestion,
  type PracticeState,
  type QuestionChatMessage,
  type ShenlunMaterialChatMessage,
  type ShenlunQuestionChatMessage,
  type ShenlunReportChatMessage,
  type TextChatMessage,
  type ToolChatMessage,
  type ToolKind,
} from './chatTypes'

export const HELP_TEXT = [
  '现在可以这样使用：',
  '/practice 找一组题（按地区智能组卷）',
  '/paper 从历年题里选一组',
  '/special 按专项知识点练习',
  '/wrong 复盘错题',
  '/favorites 练习收藏的题目',
  '/history 查看练习记录',
  '/shenlun 打开申论材料与作答记录',
  '/shenlun sync 刷新作答记录',
  '/shenlun submit 重新提交批改',
  '/shenlun refresh 手动刷新批改报告',
  '/shenlun next 进入下一道申论题',
  '/analyze 来一组词语辨析',
  '/word 查成语与词语',
  '/help 查看帮助',
  '/new 开始一段新对话',
  '/skin gemini 或 /skin chatgpt 切换外观',
  '/settings 打开设置',
  '/progress 查看当前练习进度',
  '/save 保存本组练习记录',
  '/skip 跳过当前题目',
  '/reveal 查看当前题目的解析',
  '/next 进入下一题',
  '',
  '也可以直接输入选项字母作答，例如 A、AB 或 A,C。',
  '申论模式下，直接写满 100 字就会保存并送去批改。',
].join('\n')

export function createTextMessage(
  content: string,
  role: 'user' | 'assistant' = 'assistant',
): TextChatMessage {
  return {
    id: createId('msg'),
    role,
    kind: 'text',
    content,
    createdAt: Date.now(),
  }
}

export function createNoticeMessage(
  tone: NoticeChatMessage['tone'],
  content: string,
): NoticeChatMessage {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'notice',
    tone,
    content,
    createdAt: Date.now(),
  }
}

export function createQuestionMessage(
  question: PracticeQuestion,
  index: number,
  total: number,
): QuestionChatMessage {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'question',
    questionId: question.id,
    index,
    total,
    createdAt: Date.now(),
  }
}

export function createFeedbackMessage(
  questionId: number,
  selected: string[],
  correct: boolean,
): FeedbackChatMessage {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'feedback',
    questionId,
    selected: selected.join(','),
    correct,
    createdAt: Date.now(),
  }
}

export function createActionsMessage(actions: ChatAction[], prompt?: string): ActionsChatMessage {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'actions',
    actions,
    ...(prompt ? { prompt } : {}),
    createdAt: Date.now(),
  }
}

export function createToolMessage(tool: ToolKind, query?: string): ToolChatMessage {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'tool',
    tool,
    ...(query ? { query } : {}),
    createdAt: Date.now(),
  }
}

export function createAnalysisMessage(
  questionId: number,
  content: string,
  lead?: string,
): AnalysisChatMessage {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'analysis',
    questionId,
    content,
    ...(lead ? { lead } : {}),
    createdAt: Date.now(),
  }
}

export function createShenlunMaterialMessage(content: string): ShenlunMaterialChatMessage {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'shenlun-material',
    content,
    createdAt: Date.now(),
  }
}

export function createShenlunQuestionMessage(
  question: { id: number },
  index: number,
  total: number,
): ShenlunQuestionChatMessage {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'shenlun-question',
    questionId: question.id,
    index,
    total,
    createdAt: Date.now(),
  }
}

export function createShenlunReportMessage(questionId: number): ShenlunReportChatMessage {
  return {
    id: createId('msg'),
    role: 'assistant',
    kind: 'shenlun-report',
    questionId,
    createdAt: Date.now(),
  }
}

export function formatOptionText(question: PracticeQuestion, label: string): string {
  const index = label.toUpperCase().charCodeAt(0) - 65
  const text = question.options[index]
  if (!text) return label

  const alreadyLabeled = new RegExp(`^${label}[.、．:：\\s]`, 'i').test(text.trim())
  return alreadyLabeled ? text : `${label}. ${text}`
}

export function formatAnswerText(question: PracticeQuestion, labels: readonly string[]): string {
  const ordered = [...new Set(labels)].sort()
  if (ordered.length === 0) return '（未选择）'
  return ordered.map((label) => formatOptionText(question, label)).join('；')
}

export function formatCorrectAnswerText(question: PracticeQuestion): string {
  const labels = [...new Set(question.correctAnswer)].sort()
  if (labels.length === 0) return '（暂无标准答案）'
  return labels.map((label) => formatOptionText(question, label)).join('；')
}

export function createAnswerActions(questionId: number): ChatAction[] {
  return [
    { label: '下一题', kind: 'next' },
    { label: '查看解析', kind: 'reveal' },
    { label: '换一组', kind: 'open-tools' },
    { label: '收藏这道题', kind: 'favorite', value: String(questionId) },
  ]
}

export function createSkipActions(): ChatAction[] {
  return [{ label: '下一题', kind: 'next' }]
}

export function createCompletionActions(): ChatAction[] {
  return [
    { label: '保存本组记录', kind: 'save' },
    { label: '查看进度', kind: 'command', command: '/progress' },
    { label: '开始新对话', kind: 'command', command: '/new' },
  ]
}

/** Word-analysis rounds end with mastery, never with a practice record save. */
export function createAnalyzeCompletionActions(): ChatAction[] {
  return [
    { label: '标记已掌握', kind: 'master' },
    { label: '再来一组', kind: 'command', command: '/analyze' },
    { label: '开始新对话', kind: 'command', command: '/new' },
  ]
}

export function createAnalyzeAnswerActions(): ChatAction[] {
  return [{ label: '下一题', kind: 'next' }]
}

export function createAnalyzeStartActions(): ChatAction[] {
  return [
    { label: '看释义选成语', kind: 'command', command: '/analyze defToWord' },
    { label: '换一组', kind: 'command', command: '/analyze wordToDef' },
  ]
}

export interface PracticeStats {
  total: number
  answered: number
  correct: number
  wrong: number
  unanswered: number
  elapsedSeconds: number
}

export function practiceStats(practice: PracticeState, now = Date.now()): PracticeStats {
  const total = practice.questions.length
  const answers = Object.values(practice.answers)
  const answered = answers.length
  const correct = answers.filter((answer) => answer.correct).length
  const end = practice.completedAt ?? now
  const elapsedSeconds = Math.max(0, Math.floor((end - practice.startedAt) / 1000))

  return {
    total,
    answered,
    correct,
    wrong: answered - correct,
    unanswered: Math.max(0, total - answered),
    elapsedSeconds,
  }
}

export function createSummaryMessage(practice: PracticeState): TextChatMessage {
  const stats = practiceStats(practice)
  const analyze = practice.flow === 'analyze'
  const content = analyze
    ? [
        '这组辨析完成了。',
        `共 ${stats.total} 组，答对 ${stats.correct} 组，答错 ${stats.wrong} 组。`,
        `用时 ${formatDuration(stats.elapsedSeconds)}。`,
      ].join('\n')
    : [
        '这组练习完成了。',
        `共 ${stats.total} 题，答对 ${stats.correct} 题，答错 ${stats.wrong} 题，未作答 ${stats.unanswered} 题。`,
        `用时 ${formatDuration(stats.elapsedSeconds)}。`,
      ].join('\n')

  return createTextMessage(content)
}

export function createProgressMessage(practice: PracticeState, now = Date.now()): TextChatMessage {
  const stats = practiceStats(practice, now)

  if (practice.status === 'completed') {
    return createTextMessage(
      `本组练习已完成：共 ${stats.total} 题，答对 ${stats.correct} 题，答错 ${stats.wrong} 题，未作答 ${stats.unanswered} 题，用时 ${formatDuration(stats.elapsedSeconds)}。`,
    )
  }

  const current = Math.min(practice.index + 1, stats.total)
  return createTextMessage(
    `当前是第 ${current} / ${stats.total} 题；已完成 ${stats.answered} 题，答对 ${stats.correct} 题，答错 ${stats.wrong} 题，已用时 ${formatClock(stats.elapsedSeconds)}。`,
  )
}

export function createAnswerHintMessage(): NoticeChatMessage {
  return createNoticeMessage(
    'info',
    '没有识别出答案。可以输入选项字母（例如 A、AB、A,C），也可以直接点击上面的选项。',
  )
}

export function createShenlunTooShortMessage(length: number, minimum: number): NoticeChatMessage {
  const remaining = Math.max(0, minimum - length)
  return createNoticeMessage(
    'info',
    `申论作答至少需要 ${minimum} 个字。现在已经写了 ${length} 个字${remaining > 0 ? `，还差 ${remaining} 个字。` : '。'}`,
  )
}

export function createNoPracticeMessage(): NoticeChatMessage {
  return createNoticeMessage('info', '当前还没有进行中的练习。可以输入 /help 查看已有功能。')
}

export function createUnknownCommandMessage(raw: string): TextChatMessage {
  return createTextMessage(`没有找到 ${raw} 这个命令。\n\n${HELP_TEXT}`)
}

export function createHelpMessage(): TextChatMessage {
  return createTextMessage(HELP_TEXT)
}

export function optionLabelsForQuestion(question: PracticeQuestion): string[] {
  return question.options.map((_, index) => optionLabel(index))
}
