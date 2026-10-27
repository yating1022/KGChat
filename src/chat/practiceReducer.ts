import {
  createActionsMessage,
  createAnalysisMessage,
  createAnalyzeAnswerActions,
  createAnalyzeCompletionActions,
  createAnswerActions,
  createCompletionActions,
  createFeedbackMessage,
  createNoticeMessage,
  createQuestionMessage,
  createSkipActions,
  createSummaryMessage,
  createTextMessage,
  formatAnswerText,
} from './messageFactory'
import type {
  ChatMessage,
  PracticeAnswer,
  PracticeFlow,
  PracticeQuestion,
  PracticeSaveState,
  PracticeState,
} from './chatTypes'

export interface PracticeMachine {
  messages: ChatMessage[]
  practice: PracticeState | null
}

export type PracticeEvent =
  | {
      type: 'start'
      questions: PracticeQuestion[]
      at?: number
      intro?: string
      /** Real practice intros are assistant text; notices are used sparingly. */
      introKind?: 'text' | 'notice'
      model?: unknown
      remote?: boolean
      review?: boolean
      answers?: Record<string, PracticeAnswer>
      flow?: PracticeFlow
      groupId?: number
    }
  | { type: 'answer'; labels: string[]; at?: number; revealAnalysis?: boolean }
  | { type: 'next'; at?: number }
  | { type: 'reveal'; at?: number }
  | { type: 'skip'; at?: number }
  | { type: 'complete'; at?: number }
  | { type: 'save-status'; status: PracticeSaveState }
  | { type: 'restore'; messages: ChatMessage[]; practice: PracticeState | null }

export function createPracticeMachine(): PracticeMachine {
  return { messages: [], practice: null }
}

export function currentQuestion(
  practice: PracticeState | null | undefined,
): PracticeQuestion | null {
  if (!practice) return null
  return practice.questions[practice.index] ?? null
}

function sameSelection(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const a = [...left].sort().join(',')
  const b = [...right].sort().join(',')
  return a === b
}

function normalizeLabels(question: PracticeQuestion, labels: readonly string[]): string[] {
  const valid = new Set(question.options.map((_, index) => String.fromCharCode(65 + index)))
  const selected = [...new Set(labels.map((label) => label.toUpperCase()))].filter((label) =>
    valid.has(label),
  )
  selected.sort()
  if (question.type === 'single' && selected.length > 1) return selected.slice(0, 1)
  return selected
}

function finish(messages: ChatMessage[], practice: PracticeState, at: number): PracticeMachine {
  const completed: PracticeState = {
    ...practice,
    status: 'completed',
    completedAt: at,
  }

  const completion =
    practice.flow === 'analyze' ? createAnalyzeCompletionActions() : createCompletionActions()

  return {
    messages: [
      ...messages,
      createSummaryMessage(completed),
      createActionsMessage(completion, '接下来可以：'),
    ],
    practice: completed,
  }
}

/**
 * Pure practice state machine. It only manipulates local session data; API
 * calls (record save, next paper) live in the command handler.
 */
export function practiceReducer(state: PracticeMachine, event: PracticeEvent): PracticeMachine {
  switch (event.type) {
    case 'start': {
      if (event.questions.length === 0) {
        return {
          messages: [
            ...state.messages,
            createNoticeMessage('warning', '这组练习没有可用的题目，请换一组试试。'),
          ],
          practice: null,
        }
      }

      const at = event.at ?? Date.now()
      const practice: PracticeState = {
        questions: event.questions,
        index: 0,
        status: 'active',
        answers: event.answers ?? {},
        skipped: {},
        revealed: {},
        startedAt: at,
        saveState: 'idle',
        ...(event.model !== undefined ? { model: event.model } : {}),
        remote: event.remote ?? false,
        ...(event.review ? { review: true } : {}),
        ...(event.flow ? { flow: event.flow } : {}),
        ...(event.groupId !== undefined ? { groupId: event.groupId } : {}),
      }

      const messages: ChatMessage[] = [...state.messages]
      if (event.intro) {
        messages.push(
          event.introKind === 'notice'
            ? createNoticeMessage('info', event.intro)
            : createTextMessage(event.intro),
        )
      }
      messages.push(createQuestionMessage(event.questions[0], 0, event.questions.length))

      return { messages, practice }
    }

    case 'answer': {
      if (!state.practice || state.practice.status !== 'active') return state
      if (state.practice.review) return state

      const question = currentQuestion(state.practice)
      if (!question) return state
      if (state.practice.answers[String(question.id)]) return state

      const labels = normalizeLabels(question, event.labels)
      if (labels.length === 0) return state

      const at = event.at ?? Date.now()
      const correct = sameSelection(labels, question.correctAnswer)
      const revealAnalysis = event.revealAnalysis === true
      const practice: PracticeState = {
        ...state.practice,
        answers: {
          ...state.practice.answers,
          [String(question.id)]: { labels, correct, answeredAt: at },
        },
        ...(revealAnalysis
          ? {
              revealed: {
                ...state.practice.revealed,
                [String(question.id)]: true as const,
              },
            }
          : {}),
      }

      const answerActions =
        practice.flow === 'analyze'
          ? createAnalyzeAnswerActions()
          : createAnswerActions(question.id)

      const messages: ChatMessage[] = [
        ...state.messages,
        createTextMessage(formatAnswerText(question, labels), 'user'),
        createFeedbackMessage(question.id, labels, correct),
      ]

      if (revealAnalysis) {
        const analysis = question.analysis.trim()
        if (analysis) {
          messages.push(
            createAnalysisMessage(question.id, analysis, '这组词的区别是这样的：'),
          )
        }
      }

      messages.push(createActionsMessage(answerActions, '接下来可以：'))

      return { messages, practice }
    }

    case 'next': {
      if (!state.practice || state.practice.status !== 'active') return state

      const practice = state.practice
      const nextIndex = practice.index + 1
      const at = event.at ?? Date.now()

      if (nextIndex >= practice.questions.length) {
        return finish(state.messages, practice, at)
      }

      const nextQuestion = practice.questions[nextIndex]
      return {
        messages: [
          ...state.messages,
          createQuestionMessage(nextQuestion, nextIndex, practice.questions.length),
        ],
        practice: { ...practice, index: nextIndex },
      }
    }

    case 'complete': {
      if (!state.practice || state.practice.status === 'completed') return state
      return finish(state.messages, state.practice, event.at ?? Date.now())
    }

    case 'reveal': {
      if (!state.practice) return state

      const question = currentQuestion(state.practice)
      if (!question) return state
      if (state.practice.revealed[String(question.id)]) return state
      if (!state.practice.answers[String(question.id)]) return state

      const practice: PracticeState = {
        ...state.practice,
        revealed: { ...state.practice.revealed, [String(question.id)]: true },
      }

      const analysis = question.analysis.trim() || '这道题暂时没有更多解析。'

      return {
        messages: [
          ...state.messages,
          createTextMessage('这道题的思路是这样的：'),
          createAnalysisMessage(question.id, analysis),
        ],
        practice,
      }
    }

    case 'skip': {
      if (!state.practice || state.practice.status !== 'active') return state
      if (state.practice.review) return state

      const question = currentQuestion(state.practice)
      if (!question) return state
      if (state.practice.answers[String(question.id)]) return state
      if (state.practice.skipped[String(question.id)]) return state

      const practice: PracticeState = {
        ...state.practice,
        skipped: { ...state.practice.skipped, [String(question.id)]: true },
      }

      return {
        messages: [
          ...state.messages,
          createTextMessage('跳过本题', 'user'),
          createNoticeMessage('info', '已跳过本题。它会计入本组练习的未作答数量。'),
          createActionsMessage(createSkipActions(), '接下来可以：'),
        ],
        practice,
      }
    }

    case 'save-status': {
      if (!state.practice) return state
      return { ...state, practice: { ...state.practice, saveState: event.status } }
    }

    case 'restore': {
      return { messages: event.messages, practice: event.practice }
    }

    default:
      return state
  }
}
