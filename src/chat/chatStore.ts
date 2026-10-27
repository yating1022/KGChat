import { create } from 'zustand'

import * as tk from '../api/endpoints/tk'
import {
  ApiError,
  AuthError,
  DecodeError,
  HttpError,
  MembershipError,
  NetworkError,
  isAbortError,
  toUserMessage,
} from '../api/errors'
import { useAuthStore } from '../auth/authStore'
import {
  ANALYZE_SESSION_TITLE,
  loadAnalyzeStart,
  markAnalyzeGroupMastered,
  prepareAnalyzeStart,
  type AnalyzeStart,
} from '../features/analyze/analyzeService'
import { buildRecordPayload } from '../features/practice/recordPayload'
import type { PracticeStart } from '../features/practice/practiceService'
import {
  SHENLUN_MIN_ANSWER_LENGTH,
  SHENLUN_SESSION_TITLE,
  SHENLUN_SYNC_NOTICE,
  loadShenlunReport,
  resolveShenlunRecord,
  saveAndResolveShenlun,
  shenlunAnswerLength,
  shenlunPollingExpired,
  submitShenlunCorrection,
  type ShenlunQuestionDraft,
  type ShenlunStart,
} from '../features/shenlun/shenlunService'
import { createId } from '../lib/ids'
import { useSettingsStore } from '../settings/settingsStore'
import {
  normalizeSelectedLabels,
  parseAnswerInput,
  parseSlashCommand,
  parseStudyIntent,
  type StudyIntent,
} from './commandParser'
import {
  createActionsMessage,
  createAnalyzeStartActions,
  createAnswerHintMessage,
  createHelpMessage,
  createNoPracticeMessage,
  createNoticeMessage,
  createProgressMessage,
  createShenlunMaterialMessage,
  createShenlunQuestionMessage,
  createShenlunReportMessage,
  createShenlunTooShortMessage,
  createTextMessage,
  createToolMessage,
  createUnknownCommandMessage,
  practiceStats,
} from './messageFactory'
import { currentQuestion, practiceReducer, type PracticeEvent } from './practiceReducer'
import {
  MAX_SESSION_HISTORY,
  clearSessions,
  deleteSession as deleteStoredSession,
  loadSession,
  readActiveSessionId,
  readSessionIndex,
  saveSession,
  upsertSessionSummary,
  writeActiveSessionId,
  writeSessionIndex,
} from './sessionRepository'
import type {
  AnalyzeMode,
  ChatMessage,
  ChatMode,
  ChatSession,
  ShenlunQuestionState,
  ShenlunState,
  SessionSummary,
  ToolKind,
  WordState,
} from './chatTypes'

export type SettingsTab = 'appearance' | 'account' | 'privacy'

export interface ChatUiState {
  sidebarOpen: boolean
  toolsOpen: boolean
  settingsOpen: boolean
  settingsTab: SettingsTab
}

export interface ChatStore {
  session: ChatSession | null
  sessions: SessionSummary[]
  status: 'idle' | 'loading' | 'ready'
  persistNotice: string | null
  favoriteIds: number[]
  ui: ChatUiState

  initialize(): Promise<void>
  createSession(options?: { title?: string; mode?: ChatMode }): ChatSession
  newChat(): void
  selectSession(id: string): Promise<void>
  deleteSession(id: string): Promise<void>
  clearChatHistory(): Promise<void>
  reloadFromStorage(): Promise<void>
  setDraft(draft: string): void
  setScrollTop(scrollTop: number): void

  send(raw: string): void
  answer(input: string | string[]): void
  next(): void
  reveal(): void
  skip(): void
  savePractice(): Promise<void>
  showHelp(): void
  startPractice(start: PracticeStart): void
  startPracticeFrom(loader: () => Promise<PracticeStart>, retryCommand: string): Promise<boolean>
  startShenlun(start: ShenlunStart): void
  startShenlunFrom(loader: () => Promise<ShenlunStart>, retryCommand: string): Promise<boolean>
  setShenlunIndex(index: number): void
  nextShenlunQuestion(): void
  saveShenlunAnswer(text: string): Promise<void>
  submitShenlunAnswer(text: string): Promise<void>
  syncShenlunRecord(questionId?: number): Promise<void>
  retryShenlunSubmit(questionId?: number): Promise<void>
  refreshShenlunReport(questionId?: number, options?: { manual?: boolean }): Promise<void>
  startAnalyze(start: AnalyzeStart): void
  startAnalyzeFrom(loader: () => Promise<AnalyzeStart>, retryCommand: string): Promise<boolean>
  switchAnalyzeMode(mode: AnalyzeMode): void
  markAnalyzeMastered(): Promise<void>
  updateWordState(patch: Partial<WordState> | null): void
  refreshFavorites(): Promise<void>
  toggleFavorite(questionId: number): Promise<void>
  reportPracticeError(error: unknown, retryCommand?: string): void

  openSettings(tab?: SettingsTab): void
  closeSettings(): void
  openTools(): void
  closeTools(): void
  setSidebarOpen(open: boolean): void
  setPersistNotice(message: string | null): void
  dismissPersistNotice(): void
}

function createEmptySession(
  title = '新对话',
  mode: ChatMode = 'chat',
  now = Date.now(),
): ChatSession {
  return {
    id: createId('chat'),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    draft: '',
    scrollTop: 0,
    mode,
  }
}

function initialUi(): ChatUiState {
  return {
    sidebarOpen: false,
    toolsOpen: false,
    settingsOpen: false,
    settingsTab: 'appearance',
  }
}

/**
 * A chat that only contains transient picker traffic (slash commands, tool
 * panels, or notices) can become the new practice session in place. Creating a
 * fresh session would leave a junk "新对话" entry in the rail.
 */
function canReuseChatForPractice(session: ChatSession | null): boolean {
  if (!session) return false
  if (session.mode !== 'chat' || session.practice || session.shenlun || session.analyze)
    return false

  return !session.messages.some(
    (message) =>
      message.kind === 'question' ||
      message.kind === 'feedback' ||
      message.kind === 'analysis' ||
      (message.kind === 'text' && message.role === 'assistant'),
  )
}

let initializePromise: Promise<void> | null = null
const sessionCache = new Map<string, ChatSession>()
const shenlunRefreshing = new Set<string>()
const activeOperations = new Set<string>()

/** Prevents duplicate action requests fired before React disables a control. */
function beginOperation(key: string): boolean {
  if (activeOperations.has(key)) return false
  activeOperations.add(key)
  return true
}

function endOperation(key: string): void {
  activeOperations.delete(key)
}

function toShenlunQuestionState(draft: ShenlunQuestionDraft): ShenlunQuestionState {
  return {
    id: draft.id,
    content: draft.content,
    requirement: draft.requirement,
    plainContent: draft.plainContent,
    answer: '',
    answerId: null,
    status: 'idle',
  }
}

/** Targets an explicit question card, falling back to the current index. */
function findShenlunQuestion(
  shenlun: ShenlunState,
  questionId?: number,
): ShenlunQuestionState | null {
  if (questionId !== undefined) {
    return shenlun.questions.find((question) => question.id === questionId) ?? null
  }
  return shenlun.questions[shenlun.index] ?? null
}

/** True when the submitted text is exactly the answer already stored locally. */
function isSameSavedShenlunAnswer(question: ShenlunQuestionState, text: string): boolean {
  const saved = question.answer.trim()
  return saved.length > 0 && saved === text.trim()
}

export const useChatStore = create<ChatStore>()((set, get) => {
  const commitSession = (session: ChatSession, touch: boolean): void => {
    const next: ChatSession = touch ? { ...session, updatedAt: Date.now() } : session
    sessionCache.set(next.id, next)
    set((state) => ({
      session: next,
      sessions: upsertSessionSummary(state.sessions, next).slice(0, MAX_SESSION_HISTORY),
    }))
  }

  const appendAssistant = (message: ChatMessage): void => {
    const session = get().session
    if (!session) return
    commitSession({ ...session, messages: [...session.messages, message] }, true)
  }

  const appendUserText = (content: string): void => {
    const session = get().session
    if (!session) return
    commitSession(
      { ...session, messages: [...session.messages, createTextMessage(content, 'user')] },
      true,
    )
  }

  const appendTool = (tool: ToolKind, query?: string): void => {
    appendAssistant(createToolMessage(tool, query))
  }

  /**
   * Applies a mutation to the active session, or to the cached copy when the
   * user has switched away while an async save/report call was in flight.
   * Background completions are persisted so returning to the chat (or
   * reloading) never finds it stuck at `saving`.
   */
  const patchSession = (
    sessionId: string,
    updater: (session: ChatSession) => ChatSession,
    touch = true,
  ): void => {
    const session = get().session
    if (session?.id === sessionId) {
      commitSession(updater(session), touch)
      return
    }

    const cached = sessionCache.get(sessionId)
    if (!cached) return

    const updated = updater(cached)
    const next = touch ? { ...updated, updatedAt: Date.now() } : updated
    sessionCache.set(sessionId, next)
    set((state) => ({
      sessions: upsertSessionSummary(state.sessions, next).slice(0, MAX_SESSION_HISTORY),
    }))

    void saveSession(next).then((result) => {
      if (!result.ok) get().setPersistNotice(result.message)
    })
  }

  const appendToSession = (sessionId: string, message: ChatMessage): void => {
    patchSession(sessionId, (session) => ({
      ...session,
      messages: [...session.messages, message],
    }))
  }

  /** One report card per question; later polls update it in place. */
  const ensureShenlunReportMessage = (sessionId: string, questionId: number): void => {
    patchSession(sessionId, (session) => {
      const exists = session.messages.some(
        (message) => message.kind === 'shenlun-report' && message.questionId === questionId,
      )
      if (exists) return session
      return {
        ...session,
        messages: [...session.messages, createShenlunReportMessage(questionId)],
      }
    })
  }

  const updateShenlunQuestion = (
    sessionId: string,
    questionId: number,
    patch: Partial<ShenlunQuestionState>,
  ): void => {
    patchSession(sessionId, (session) => {
      if (!session.shenlun) return session
      return {
        ...session,
        shenlun: {
          ...session.shenlun,
          questions: session.shenlun.questions.map((question) =>
            question.id === questionId ? { ...question, ...patch } : question,
          ),
        },
      }
    })
  }

  const appendShenlunQuestion = (shenlun: ShenlunState, index: number): ChatMessage[] => [
    createShenlunQuestionMessage(shenlun.questions[index], index, shenlun.questions.length),
  ]

  /**
   * Opens a picker in a clean chat so an active/completed practice is never
   * polluted by command text and tool panels.
   */
  const openPracticeTool = (raw: string, tool: ToolKind): void => {
    const session = get().session
    if (session?.practice || session?.shenlun) get().newChat()
    appendUserText(raw)
    appendTool(tool)
  }

  const retitleTransientChat = (title: string): void => {
    const session = get().session
    if (!session || session.title !== '新对话') return
    commitSession({ ...session, title }, false)
  }

  const openWordTool = (raw: string, query?: string): void => {
    const session = get().session
    if (session?.practice || session?.shenlun) get().newChat()
    appendUserText(raw)
    appendTool('word', query)
    retitleTransientChat('查几个成语')
  }

  const appendRetry = (retryCommand?: string): void => {
    if (!retryCommand) return
    appendAssistant(
      createActionsMessage(
        [{ label: '重试', kind: 'command', command: retryCommand }],
        '接下来可以：',
      ),
    )
  }

  const dispatchPractice = (event: PracticeEvent): void => {
    const session = get().session
    if (!session) return

    const machine = practiceReducer(
      { messages: session.messages, practice: session.practice ?? null },
      event,
    )

    const next: ChatSession = {
      ...session,
      messages: machine.messages,
    }

    if (machine.practice) {
      next.practice = machine.practice
      next.mode = 'practice'
    } else {
      delete next.practice
    }

    commitSession(next, true)
  }

  const handleIntent = (intent: StudyIntent, raw: string): void => {
    const toolIntent =
      intent === 'practice' ||
      intent === 'paper' ||
      intent === 'special' ||
      intent === 'wrong' ||
      intent === 'favorites' ||
      intent === 'history' ||
      intent === 'vocabulary' ||
      intent === 'shenlun'

    if (toolIntent) {
      const session = get().session
      if (session?.practice || session?.shenlun) get().newChat()
    }
    appendUserText(raw)

    switch (intent) {
      case 'practice':
        appendTool('practice')
        break
      case 'paper':
        appendTool('paper')
        break
      case 'special':
        appendTool('special')
        break
      case 'wrong':
        appendTool('wrong')
        break
      case 'favorites':
        appendTool('favorites')
        break
      case 'history':
        appendTool('history')
        break
      case 'vocabulary':
        appendTool('word')
        retitleTransientChat('查几个成语')
        break
      case 'shenlun':
        appendTool('shenlun')
        break
    }
  }

  const handleShenlunCommand = (raw: string, args: readonly string[]): void => {
    const command = (args[0] ?? '').toLowerCase()

    switch (command) {
      case 'sync':
        appendUserText(raw)
        void get().syncShenlunRecord()
        break
      case 'submit': {
        appendUserText(raw)
        const targetId = Number(args[1])
        void get().retryShenlunSubmit(Number.isInteger(targetId) ? targetId : undefined)
        break
      }
      case 'refresh':
        appendUserText(raw)
        void get().refreshShenlunReport(undefined, { manual: true })
        break
      case 'next':
        appendUserText(raw)
        get().nextShenlunQuestion()
        break
      default:
        openPracticeTool(raw, 'shenlun')
        break
    }
  }

  const handleAnalyzeCommand = (raw: string, args: readonly string[]): void => {
    const arg = (args[0] ?? '').toLowerCase()

    if (arg === 'tool' || arg === 'history') {
      openPracticeTool(raw, 'analyze')
      return
    }

    const requestedMode: AnalyzeMode | null =
      arg === 'deftoword' || arg === 'def-to-word' || arg === '看释义选成语' || arg === 'reverse'
        ? 'defToWord'
        : arg === 'wordtodef' || arg === 'word-to-def' || arg === '看成语选释义'
          ? 'wordToDef'
          : null

    appendUserText(raw)

    if (!arg || arg === 'new') {
      void get().startAnalyzeFrom(() => loadAnalyzeStart('wordToDef'), '/analyze')
      return
    }

    if (requestedMode) {
      const analyze = get().session?.analyze
      if (analyze) {
        get().switchAnalyzeMode(requestedMode)
        return
      }
      void get().startAnalyzeFrom(() => loadAnalyzeStart(requestedMode), '/analyze')
      return
    }

    appendAssistant(
      createNoticeMessage(
        'warning',
        '用法：/analyze 来一组，/analyze 看释义选成语 换一种问法，或 /analyze history 查看辨析历史。',
      ),
    )
  }

  const handleSlash = (raw: string): void => {
    const parsed = parseSlashCommand(raw)
    if (!parsed) return

    if (parsed.type === 'unknown') {
      appendUserText(raw)
      appendAssistant(createUnknownCommandMessage(raw))
      return
    }

    switch (parsed.name) {
      case 'help':
        appendUserText(raw)
        get().showHelp()
        break
      case 'new':
        get().newChat()
        break
      case 'skin': {
        appendUserText(raw)
        const requested = parsed.args[0]?.toLowerCase()
        if (requested === 'gemini' || requested === 'chatgpt') {
          useSettingsStore.getState().setSkin(requested)
          appendAssistant(
            createNoticeMessage(
              'info',
              `已切换到 ${requested === 'gemini' ? 'Gemini' : 'ChatGPT'} 皮肤，当前对话和练习进度不受影响。`,
            ),
          )
        } else {
          appendAssistant(createNoticeMessage('warning', '用法：/skin gemini 或 /skin chatgpt。'))
        }
        break
      }
      case 'settings':
        get().openSettings('appearance')
        break
      case 'practice':
        openPracticeTool(raw, 'practice')
        break
      case 'paper':
        openPracticeTool(raw, 'paper')
        break
      case 'special':
        openPracticeTool(raw, 'special')
        break
      case 'wrong':
        openPracticeTool(raw, 'wrong')
        break
      case 'favorites':
        openPracticeTool(raw, 'favorites')
        break
      case 'history':
        openPracticeTool(raw, 'history')
        break
      case 'shenlun':
        handleShenlunCommand(raw, parsed.args)
        break
      case 'analyze':
        handleAnalyzeCommand(raw, parsed.args)
        break
      case 'word': {
        const query = parsed.args.join(' ').trim()
        openWordTool(raw, query || undefined)
        if (query) {
          get().updateWordState({ kind: 'idiom', query, results: [] })
        }
        break
      }
      case 'progress': {
        appendUserText(raw)
        const practice = get().session?.practice
        if (!practice) {
          appendAssistant(createNoPracticeMessage())
        } else {
          appendAssistant(createProgressMessage(practice))
        }
        break
      }
      case 'save':
        appendUserText(raw)
        get().savePractice()
        break
      case 'skip':
        appendUserText(raw)
        get().skip()
        break
      case 'reveal':
        appendUserText(raw)
        get().reveal()
        break
      case 'next':
        appendUserText(raw)
        get().next()
        break
    }
  }

  return {
    session: null,
    sessions: [],
    status: 'idle',
    persistNotice: null,
    favoriteIds: [],
    ui: initialUi(),

    async initialize() {
      if (get().status === 'ready' && get().session) return
      if (initializePromise) return initializePromise

      initializePromise = (async () => {
        set({ status: 'loading' })

        const index = readSessionIndex()
        let loaded: ChatSession | null = null

        if (index.length > 0) {
          const activeId = readActiveSessionId()
          const ordered = activeId
            ? [
                ...index.filter((summary) => summary.id === activeId),
                ...index.filter((summary) => summary.id !== activeId),
              ]
            : index

          for (const summary of ordered) {
            const session = await loadSession(summary.id)
            if (session) {
              loaded = session
              break
            }
          }
        }

        if (loaded) {
          sessionCache.set(loaded.id, loaded)
          set({
            session: loaded,
            sessions: readSessionIndex(),
            status: 'ready',
          })
          writeActiveSessionId(loaded.id)
        } else {
          set({ status: 'ready' })
          get().createSession()
        }

        void get().refreshFavorites()
      })().finally(() => {
        initializePromise = null
      })

      return initializePromise
    },

    createSession(options = {}) {
      const mode = options.mode ?? 'chat'
      const session = createEmptySession(
        options.title ?? (mode === 'practice' ? '一组练习' : '新对话'),
        mode,
      )

      set((state) => ({
        session,
        sessions: upsertSessionSummary(state.sessions, session).slice(0, MAX_SESSION_HISTORY),
      }))
      sessionCache.set(session.id, session)
      writeActiveSessionId(session.id)
      return session
    },

    newChat() {
      const current = get().session
      if (current && current.messages.length === 0 && !current.practice) {
        if (current.draft) commitSession({ ...current, draft: '', scrollTop: 0 }, false)
        set((state) => ({ ui: { ...state.ui, sidebarOpen: false } }))
        return
      }

      get().createSession()
      set((state) => ({ ui: { ...state.ui, sidebarOpen: false, toolsOpen: false } }))
    },

    async selectSession(id) {
      if (get().session?.id === id) {
        set((state) => ({ ui: { ...state.ui, sidebarOpen: false, toolsOpen: false } }))
        return
      }

      const current = get().session
      if (current && current.messages.length === 0 && !current.practice && !current.draft) {
        sessionCache.delete(current.id)
        set((state) => ({
          sessions: state.sessions.filter((summary) => summary.id !== current.id),
        }))
        await deleteStoredSession(current.id)
      }

      const cached = sessionCache.get(id)
      const session = cached ?? (await loadSession(id))
      if (!session) {
        sessionCache.delete(id)
        const remaining = get().sessions.filter((summary) => summary.id !== id)
        set({
          sessions: remaining,
          persistNotice: '有一个本地会话无法读取，已跳过。',
        })
        writeSessionIndex(remaining)

        if (get().session?.id === id || !get().session) {
          if (remaining[0]) {
            await get().selectSession(remaining[0].id)
          } else {
            get().createSession()
          }
        }
        return
      }

      set((state) => ({
        session,
        sessions: upsertSessionSummary(state.sessions, session).slice(0, MAX_SESSION_HISTORY),
        ui: { ...state.ui, sidebarOpen: false, toolsOpen: false },
      }))
      sessionCache.set(session.id, session)
      writeActiveSessionId(session.id)
    },

    async deleteSession(id) {
      await deleteStoredSession(id)
      sessionCache.delete(id)

      const remaining = get().sessions.filter((summary) => summary.id !== id)
      set({ sessions: remaining })

      if (get().session?.id !== id) return

      if (remaining[0]) {
        await get().selectSession(remaining[0].id)
      } else {
        set({ session: null })
        get().createSession()
      }
    },

    async clearChatHistory() {
      await clearSessions()
      sessionCache.clear()
      initializePromise = null
      set({ session: null, sessions: [], status: 'ready', persistNotice: null })
      get().createSession()
    },

    async reloadFromStorage() {
      sessionCache.clear()
      initializePromise = null
      set({ session: null, sessions: [], status: 'idle', persistNotice: null })
      await get().initialize()
    },

    setDraft(draft) {
      const session = get().session
      if (!session) return
      commitSession({ ...session, draft }, false)
    },

    setScrollTop(scrollTop) {
      const session = get().session
      if (!session) return
      commitSession({ ...session, scrollTop }, false)
    },

    send(raw) {
      const text = raw.trim()
      if (!text) return

      // Imported conversations are cover history: leave them untouched and
      // run any new command or message in a fresh conversation instead.
      const current = get().session
      if (current?.origin === 'import') {
        const command = text.startsWith('/')
          ? text.slice(1).split(/\s+/)[0]?.toLowerCase()
          : null
        if (command !== 'skin' && command !== 'settings' && command !== 'new') {
          get().createSession()
        }
      }

      if (!get().session) get().createSession()

      if (text.startsWith('/')) {
        get().setDraft('')
        handleSlash(text)
        return
      }

      const session = get().session

      // Shenlun long answers own the composer while a question is active.
      if (session?.mode === 'shenlun' && session.shenlun) {
        const question = session.shenlun.questions[session.shenlun.index]
        if (question) {
          get().setDraft('')

          if (shenlunAnswerLength(text) >= SHENLUN_MIN_ANSWER_LENGTH) {
            void get().submitShenlunAnswer(text)
            return
          }

          // Short text may still be a study intent; otherwise explain the count.
          const shenlunIntent = parseStudyIntent(text)
          if (shenlunIntent) {
            handleIntent(shenlunIntent, text)
            return
          }

          void get().submitShenlunAnswer(text)
          return
        }
      }

      const practice = session?.practice
      const question = currentQuestion(practice)

      if (practice?.status === 'active' && question && !practice.answers[String(question.id)]) {
        const labels = parseAnswerInput(text, question)
        if (labels) {
          get().setDraft('')
          get().answer(labels)
          return
        }

        get().setDraft('')
        appendUserText(text)
        appendAssistant(createAnswerHintMessage())
        return
      }

      get().setDraft('')
      const intent = parseStudyIntent(text)
      if (intent) {
        handleIntent(intent, text)
        return
      }

      appendUserText(text)
      appendAssistant(
        createNoticeMessage(
          'info',
          '我可以帮你安排一组练习、复盘错题，或查查成语和申论材料。输入 /help 查看当前可用的命令。',
        ),
      )
    },

    answer(input) {
      const practice = get().session?.practice
      const question = currentQuestion(practice)

      if (!practice || practice.status !== 'active' || !question) {
        appendAssistant(createNoPracticeMessage())
        return
      }

      if (practice.review) {
        appendAssistant(
          createNoticeMessage(
            'info',
            '这是回顾模式，选项已经锁定；需要重新作答时可以在练习记录里选择重做。',
          ),
        )
        return
      }

      if (practice.answers[String(question.id)]) {
        appendAssistant(createNoticeMessage('info', '本题已经作答，可以点击“下一题”继续。'))
        return
      }

      const labels = Array.isArray(input)
        ? normalizeSelectedLabels(input, question)
        : parseAnswerInput(input, question)

      if (!labels || labels.length === 0) {
        appendAssistant(createAnswerHintMessage())
        return
      }

      dispatchPractice({ type: 'answer', labels, revealAnalysis: practice.flow === 'analyze' })
      get().setDraft('')
    },

    next() {
      const practice = get().session?.practice
      if (!practice) {
        appendAssistant(createNoPracticeMessage())
        return
      }
      if (practice.status === 'completed') {
        appendAssistant(createNoticeMessage('info', '本组练习已经完成，可以输入 /new 开始新对话。'))
        return
      }
      dispatchPractice({ type: 'next' })
    },

    reveal() {
      const practice = get().session?.practice
      const question = currentQuestion(practice)

      if (!practice || !question) {
        appendAssistant(createNoPracticeMessage())
        return
      }

      if (!practice.answers[String(question.id)]) {
        appendAssistant(
          createNoticeMessage('info', '先作答后才能查看解析，这样也能保留真实的练习记录。'),
        )
        return
      }

      if (practice.revealed[String(question.id)]) {
        appendAssistant(createNoticeMessage('info', '这道题的解析已经展开了。'))
        return
      }

      dispatchPractice({ type: 'reveal' })
    },

    skip() {
      const practice = get().session?.practice
      const question = currentQuestion(practice)

      if (!practice || !question || practice.status !== 'active') {
        appendAssistant(
          practice?.status === 'completed'
            ? createNoticeMessage('info', '本组练习已经完成，不需要继续跳过。')
            : createNoPracticeMessage(),
        )
        return
      }

      if (practice.answers[String(question.id)]) {
        appendAssistant(
          createNoticeMessage('info', '本题已经作答，不需要跳过，可以直接进入下一题。'),
        )
        return
      }

      dispatchPractice({ type: 'skip' })
    },

    async savePractice() {
      const session = get().session
      const practice = session?.practice

      if (!practice || !session) {
        appendAssistant(createNoPracticeMessage())
        return
      }

      if (practice.flow === 'analyze') {
        appendAssistant(
          createNoticeMessage('info', '这组词语辨析不需要保存练习记录。完成后可以标记为已掌握。'),
        )
        return
      }

      if (practice.review) {
        appendAssistant(
          createNoticeMessage(
            'info',
            '回顾模式不会重复保存记录。需要重新作答时，可以在练习记录里选择重做。',
          ),
        )
        return
      }

      // Read-only reviews are handled above; any other non-remote session
      // stays in the local chat history and is never uploaded.
      if (!practice.remote) {
        if (practice.status !== 'completed') {
          appendAssistant(
            createNoticeMessage('info', '完成本组练习后就可以保存记录，也可以先输入 /next 继续。'),
          )
          return
        }

        if (practice.saveState === 'saved-local') {
          appendAssistant(createNoticeMessage('info', '本组练习已经保存在本机。'))
          return
        }

        dispatchPractice({ type: 'save-status', status: 'saved-local' })
        appendAssistant(
          createNoticeMessage('info', '本组练习已保存在本机聊天记录中。'),
        )
        return
      }

      if (practice.saveState === 'saving') {
        appendAssistant(createNoticeMessage('info', '正在保存这组练习，请稍等。'))
        return
      }

      if (practice.saveState === 'saved') {
        appendAssistant(createNoticeMessage('info', '这组练习已经保存过了，可以在练习记录里回看。'))
        return
      }

      const stats = practiceStats(practice)
      const built = buildRecordPayload({
        title: session.title,
        questions: practice.questions,
        answers: practice.answers,
        timeTaken: stats.elapsedSeconds,
        model: practice.model,
        startedAt: practice.startedAt,
      })

      if (!built.canSave) {
        appendAssistant(
          createNoticeMessage(
            'info',
            `这次先不保存：已回答 ${built.stats.answered} / ${built.stats.total} 题，超过一半后就可以保存。`,
          ),
        )
        return
      }

      const token = useAuthStore.getState().token
      if (!token) {
        appendAssistant(createNoticeMessage('warning', '登录后才能保存练习记录。'))
        appendAssistant(createActionsMessage([{ label: '去登录', kind: 'retry' }], '接下来可以：'))
        return
      }

      const operationKey = `tk:addRecord:${session.id}`
      if (!beginOperation(operationKey)) return

      dispatchPractice({ type: 'save-status', status: 'saving' })

      try {
        await tk.savePracticeRecord(built.payload, {
          baseUrl: useSettingsStore.getState().apiBaseUrl,
          token,
        })
        dispatchPractice({ type: 'save-status', status: 'saved' })
        appendAssistant(createTextMessage('这组练习已保存，可以在练习记录里回看。'))
        appendAssistant(
          createActionsMessage(
            [{ label: '看看练习记录', kind: 'command', command: '/history' }],
            '接下来可以：',
          ),
        )
      } catch (error) {
        dispatchPractice({ type: 'save-status', status: 'error' })
        get().reportPracticeError(error, '/save')
      } finally {
        endOperation(operationKey)
      }
    },

    startPractice(start) {
      const current = get().session
      const canReuse = canReuseChatForPractice(current)
      const base = canReuse && current ? current : createEmptySession(start.title, 'practice')

      // Replace transient picker messages with the actual practice intro.
      const machine = practiceReducer(
        { messages: canReuse ? [] : base.messages, practice: null },
        {
          type: 'start',
          questions: start.questions,
          intro: start.intro,
          introKind: 'text',
          model: start.model,
          remote: start.remote,
          review: start.review,
          answers: start.answers,
        },
      )

      const messages = [...machine.messages]
      if (machine.practice?.review) {
        messages.push(
          createActionsMessage(
            [
              { label: '下一题', kind: 'next' },
              { label: '查看解析', kind: 'reveal' },
            ],
            '接下来可以：',
          ),
        )
      }

      const next: ChatSession = {
        ...base,
        title: start.title,
        mode: machine.practice ? 'practice' : base.mode,
        messages,
        draft: '',
        scrollTop: 0,
        updatedAt: Date.now(),
      }

      if (machine.practice) next.practice = machine.practice

      set((state) => ({
        session: next,
        sessions: upsertSessionSummary(state.sessions, next).slice(0, MAX_SESSION_HISTORY),
        ui: { ...state.ui, sidebarOpen: false, toolsOpen: false },
      }))
      sessionCache.set(next.id, next)
      writeActiveSessionId(next.id)

      void get().refreshFavorites()
    },

    async startPracticeFrom(loader, retryCommand) {
      const operationKey = `start:practice:${retryCommand}`
      if (!beginOperation(operationKey)) return false

      try {
        const start = await loader()
        get().startPractice(start)
        return true
      } catch (error) {
        if (isAbortError(error)) return false
        get().reportPracticeError(error, retryCommand)
        return false
      } finally {
        endOperation(operationKey)
      }
    },

    startShenlun(start) {
      const current = get().session
      const canReuse = canReuseChatForPractice(current)
      const base =
        canReuse && current ? current : createEmptySession(SHENLUN_SESSION_TITLE, 'shenlun')

      const questions = start.questions.map(toShenlunQuestionState)

      if (questions.length === 0) {
        appendAssistant(
          createNoticeMessage('warning', '这份申论材料没有可作答的题目，换一份试试。'),
        )
        return
      }

      const shenlun: ShenlunState = {
        paperId: start.paperId,
        questions,
        index: 0,
        status: 'active',
      }

      const messages: ChatMessage[] = canReuse ? [] : base.messages
      messages.push(createTextMessage(start.intro))
      for (const material of start.materials) {
        messages.push(createShenlunMaterialMessage(material))
      }
      messages.push(...appendShenlunQuestion(shenlun, 0))

      const next: ChatSession = {
        ...base,
        title: SHENLUN_SESSION_TITLE,
        mode: 'shenlun',
        messages,
        draft: '',
        scrollTop: 0,
        updatedAt: Date.now(),
        shenlun,
      }

      delete next.practice
      delete next.analyze

      set((state) => ({
        session: next,
        sessions: upsertSessionSummary(state.sessions, next).slice(0, MAX_SESSION_HISTORY),
        ui: { ...state.ui, sidebarOpen: false, toolsOpen: false },
      }))
      sessionCache.set(next.id, next)
      writeActiveSessionId(next.id)
    },

    async startShenlunFrom(loader, retryCommand) {
      const operationKey = `start:shenlun:${retryCommand}`
      if (!beginOperation(operationKey)) return false

      try {
        const start = await loader()
        get().startShenlun(start)
        return true
      } catch (error) {
        if (isAbortError(error)) return false
        get().reportPracticeError(error, retryCommand)
        return false
      } finally {
        endOperation(operationKey)
      }
    },

    setShenlunIndex(index) {
      const session = get().session
      const shenlun = session?.shenlun
      if (!session || !shenlun) {
        appendAssistant(createNoticeMessage('info', '当前还没有正在进行的申论作答。'))
        return
      }
      if (!Number.isInteger(index) || index < 0 || index >= shenlun.questions.length) return

      const hasMessage = session.messages.some(
        (message) =>
          message.kind === 'shenlun-question' && message.questionId === shenlun.questions[index].id,
      )

      commitSession(
        {
          ...session,
          shenlun: { ...shenlun, index },
          messages: hasMessage
            ? session.messages
            : [...session.messages, ...appendShenlunQuestion(shenlun, index)],
        },
        true,
      )
    },

    nextShenlunQuestion() {
      const session = get().session
      const shenlun = session?.shenlun
      if (!session || !shenlun) {
        appendAssistant(
          createNoticeMessage(
            'info',
            '当前还没有正在进行的申论作答，可以输入 /shenlun 选一份材料。',
          ),
        )
        return
      }

      const nextIndex = shenlun.index + 1
      if (nextIndex >= shenlun.questions.length) {
        appendAssistant(createNoticeMessage('info', '已经是最后一道题了，可以继续修改作答。'))
        return
      }

      get().setShenlunIndex(nextIndex)
    },

    async saveShenlunAnswer(text) {
      const session = get().session
      const shenlun = session?.shenlun
      const question = shenlun?.questions[shenlun.index]

      if (!session || !shenlun || !question) {
        appendAssistant(
          createNoticeMessage(
            'info',
            '当前还没有正在作答的申论题目，可以输入 /shenlun 选一份材料。',
          ),
        )
        return
      }

      const length = shenlunAnswerLength(text)
      if (length < SHENLUN_MIN_ANSWER_LENGTH) {
        appendUserText(text)
        appendAssistant(createShenlunTooShortMessage(length, SHENLUN_MIN_ANSWER_LENGTH))
        return
      }

      const token = useAuthStore.getState().token
      if (!token) {
        appendUserText(text)
        appendAssistant(createNoticeMessage('warning', '登录后才能保存申论作答。'))
        appendAssistant(createActionsMessage([{ label: '去登录', kind: 'retry' }], '接下来可以：'))
        return
      }

      // Re-saving the same text after a successful save creates duplicate
      // server records. Only a changed answer (or an errored one) is re-sent.
      const sameAnswer = isSameSavedShenlunAnswer(question, text)
      if (sameAnswer && question.status !== 'error') {
        appendAssistant(createTextMessage('这次作答已经保存过了，可以直接送去批改。'))
        return
      }

      const operationKey = `sl:save:${session.id}:${question.id}`
      if (!beginOperation(operationKey)) {
        appendAssistant(createNoticeMessage('info', '这次作答正在保存，请稍等。'))
        return
      }

      get().setDraft('')
      appendUserText(text)
      updateShenlunQuestion(session.id, question.id, {
        answer: text.trim(),
        status: 'saving',
        error: undefined,
        // A changed answer must not reuse the previous record's sid.
        answerId: null,
      })

      const context = { baseUrl: useSettingsStore.getState().apiBaseUrl, token }
      const input = {
        paperId: shenlun.paperId,
        question: {
          id: question.id,
          content: question.content,
          plainContent: question.plainContent,
        },
        answer: text.trim(),
        context,
      }

      try {
        const record = await saveAndResolveShenlun(input)

        if (!record) {
          updateShenlunQuestion(session.id, question.id, {
            status: 'sync-pending',
            answerId: null,
          })
          appendToSession(
            session.id,
            createNoticeMessage(
              'info',
              `这次作答已经保存，${SHENLUN_SYNC_NOTICE}。稍后刷新一下就能继续批改。`,
            ),
          )
          appendToSession(
            session.id,
            createActionsMessage(
              [{ label: '刷新记录', kind: 'command', command: '/shenlun sync' }],
              '接下来可以：',
            ),
          )
          return
        }

        updateShenlunQuestion(session.id, question.id, {
          status: 'saved',
          answerId: String(record.sid),
        })
        appendToSession(session.id, createTextMessage('这次作答已保存。需要批改时点“保存并批改”。'))
      } catch (error) {
        updateShenlunQuestion(session.id, question.id, {
          status: 'error',
          error: toUserMessage(error),
        })
        get().reportPracticeError(error, '/shenlun')
      } finally {
        endOperation(operationKey)
      }
    },

    async submitShenlunAnswer(text) {
      const session = get().session
      const shenlun = session?.shenlun
      const question = shenlun?.questions[shenlun.index]

      if (!session || !shenlun || !question) {
        appendAssistant(
          createNoticeMessage(
            'info',
            '当前还没有正在作答的申论题目，可以输入 /shenlun 选一份材料。',
          ),
        )
        return
      }

      const length = shenlunAnswerLength(text)
      if (length < SHENLUN_MIN_ANSWER_LENGTH) {
        appendUserText(text)
        appendAssistant(createShenlunTooShortMessage(length, SHENLUN_MIN_ANSWER_LENGTH))
        return
      }

      const token = useAuthStore.getState().token
      if (!token) {
        appendUserText(text)
        appendAssistant(createNoticeMessage('warning', '登录后才能提交申论批改。'))
        appendAssistant(createActionsMessage([{ label: '去登录', kind: 'retry' }], '接下来可以：'))
        return
      }

      const sameAnswer = isSameSavedShenlunAnswer(question, text)
      const reusableSid = sameAnswer ? question.answerId : null

      if (
        sameAnswer &&
        reusableSid &&
        (question.status === 'polling' || question.status === 'report')
      ) {
        appendAssistant(
          createNoticeMessage('info', '这次作答已经在批改中或已有结果，修改作答后可以重新提交。'),
        )
        return
      }

      const operationKey = `sl:submit:${session.id}:${question.id}`
      if (!beginOperation(operationKey)) {
        appendAssistant(createNoticeMessage('info', '这次批改正在提交，请稍等。'))
        return
      }

      get().setDraft('')
      appendUserText(text)
      updateShenlunQuestion(session.id, question.id, {
        answer: text.trim(),
        status: 'saving',
        error: undefined,
        answerId: reusableSid,
      })

      const context = { baseUrl: useSettingsStore.getState().apiBaseUrl, token }
      const input = {
        paperId: shenlun.paperId,
        question: {
          id: question.id,
          content: question.content,
          plainContent: question.plainContent,
        },
        answer: text.trim(),
        context,
      }

      try {
        // Reuse the already-saved record when the text is unchanged; only
        // re-save (or retry the sync lookup) when necessary.
        let sid: string | number | null = reusableSid
        if (!sid) {
          const record =
            sameAnswer && question.status === 'sync-pending'
              ? await resolveShenlunRecord(input)
              : await saveAndResolveShenlun(input)
          sid = record ? record.sid : null
        }

        if (!sid) {
          updateShenlunQuestion(session.id, question.id, {
            status: 'sync-pending',
            answerId: null,
          })
          appendToSession(
            session.id,
            createNoticeMessage(
              'info',
              `这次作答已经保存，${SHENLUN_SYNC_NOTICE}。记录出来后才能送去批改。`,
            ),
          )
          appendToSession(
            session.id,
            createActionsMessage(
              [{ label: '刷新记录', kind: 'command', command: '/shenlun sync' }],
              '接下来可以：',
            ),
          )
          return
        }

        updateShenlunQuestion(session.id, question.id, {
          status: 'submitting',
          answerId: String(sid),
        })

        await submitShenlunCorrection({ ...input, sid })

        updateShenlunQuestion(session.id, question.id, {
          status: 'polling',
          pollStartedAt: Date.now(),
        })
        appendToSession(
          session.id,
          createTextMessage('已经送去批改了，通常需要 1–3 分钟。我会自动刷新结果。'),
        )
        ensureShenlunReportMessage(session.id, question.id)
      } catch (error) {
        updateShenlunQuestion(session.id, question.id, {
          status: 'error',
          error: toUserMessage(error),
        })
        get().reportPracticeError(error, '/shenlun submit')
      } finally {
        endOperation(operationKey)
      }
    },

    async syncShenlunRecord(questionId) {
      const session = get().session
      const shenlun = session?.shenlun
      const question = shenlun ? findShenlunQuestion(shenlun, questionId) : null

      if (!session || !shenlun || !question) {
        appendAssistant(createNoticeMessage('info', '当前还没有正在作答的申论题目。'))
        return
      }
      if (!question.answer) {
        appendAssistant(createNoticeMessage('info', '先写完并保存一次作答，再来刷新记录。'))
        return
      }

      const token = useAuthStore.getState().token
      if (!token) {
        appendAssistant(createNoticeMessage('warning', '登录后才能同步申论作答记录。'))
        return
      }

      const operationKey = `sl:sync:${session.id}:${question.id}`
      if (!beginOperation(operationKey)) return

      const input = {
        paperId: shenlun.paperId,
        question: {
          id: question.id,
          content: question.content,
          plainContent: question.plainContent,
        },
        answer: question.answer,
        context: { baseUrl: useSettingsStore.getState().apiBaseUrl, token },
      }

      try {
        const record = await resolveShenlunRecord(input)

        if (!record) {
          updateShenlunQuestion(session.id, question.id, { status: 'sync-pending' })
          appendToSession(
            session.id,
            createNoticeMessage(
              'info',
              `${SHENLUN_SYNC_NOTICE}：暂时还没有找到这条作答记录，可以稍后再刷新。`,
            ),
          )
          appendToSession(
            session.id,
            createActionsMessage(
              [{ label: '再刷新一次', kind: 'command', command: '/shenlun sync' }],
              '接下来可以：',
            ),
          )
          return
        }

        updateShenlunQuestion(session.id, question.id, {
          status: 'saved',
          answerId: String(record.sid),
        })
        appendToSession(session.id, createTextMessage('记录已经同步，可以送去批改了。'))
        appendToSession(
          session.id,
          createActionsMessage(
            [
              {
                label: '送去批改',
                kind: 'command',
                command: `/shenlun submit ${question.id}`,
              },
            ],
            '接下来可以：',
          ),
        )
      } catch (error) {
        get().reportPracticeError(error, '/shenlun sync')
      } finally {
        endOperation(operationKey)
      }
    },

    async retryShenlunSubmit(questionId) {
      const session = get().session
      const shenlun = session?.shenlun
      const question = shenlun ? findShenlunQuestion(shenlun, questionId) : null

      if (!session || !shenlun || !question?.answer) {
        appendAssistant(createNoticeMessage('info', '还没有可以提交批改的作答。'))
        return
      }

      const token = useAuthStore.getState().token
      if (!token) {
        appendAssistant(createNoticeMessage('warning', '登录后才能提交申论批改。'))
        return
      }

      const operationKey = `sl:submit:${session.id}:${question.id}`
      if (!beginOperation(operationKey)) {
        appendAssistant(createNoticeMessage('info', '这次批改正在提交，请稍等。'))
        return
      }

      const input = {
        paperId: shenlun.paperId,
        question: {
          id: question.id,
          content: question.content,
          plainContent: question.plainContent,
        },
        answer: question.answer,
        context: { baseUrl: useSettingsStore.getState().apiBaseUrl, token },
      }

      try {
        const record = await resolveShenlunRecord(input)

        if (!record) {
          updateShenlunQuestion(session.id, question.id, { status: 'sync-pending' })
          appendToSession(
            session.id,
            createNoticeMessage(
              'info',
              `${SHENLUN_SYNC_NOTICE}：还没有找到这条作答记录，稍后再试。`,
            ),
          )
          appendToSession(
            session.id,
            createActionsMessage(
              [{ label: '刷新记录', kind: 'command', command: '/shenlun sync' }],
              '接下来可以：',
            ),
          )
          return
        }

        updateShenlunQuestion(session.id, question.id, {
          status: 'submitting',
          answerId: String(record.sid),
        })
        await submitShenlunCorrection({ ...input, sid: record.sid })
        updateShenlunQuestion(session.id, question.id, {
          status: 'polling',
          pollStartedAt: Date.now(),
        })
        appendToSession(session.id, createTextMessage('已经重新送去批改了，通常需要 1–3 分钟。'))
        ensureShenlunReportMessage(session.id, question.id)
      } catch (error) {
        updateShenlunQuestion(session.id, question.id, {
          status: 'error',
          error: toUserMessage(error),
        })
        get().reportPracticeError(error, '/shenlun submit')
      } finally {
        endOperation(operationKey)
      }
    },

    async refreshShenlunReport(questionId, options = {}) {
      const session = get().session
      const shenlun = session?.shenlun
      const question = shenlun ? findShenlunQuestion(shenlun, questionId) : null
      const manual = options.manual === true

      if (!session || !shenlun || !question) return

      if (!question.answerId) {
        if (manual) {
          appendAssistant(
            createNoticeMessage('info', '这条作答还没有同步出记录，暂时无法查看批改。'),
          )
        }
        return
      }

      if (!manual && shenlunPollingExpired(question.pollStartedAt)) {
        if (question.status !== 'timeout') {
          updateShenlunQuestion(session.id, question.id, { status: 'timeout' })
          appendToSession(
            session.id,
            createNoticeMessage('info', '批改还在生成中。自动刷新先暂停了，可以稍后手动刷新。'),
          )
        }
        return
      }

      const refreshKey = `${session.id}:${question.id}`
      if (shenlunRefreshing.has(refreshKey)) return
      shenlunRefreshing.add(refreshKey)

      try {
        const token = useAuthStore.getState().token
        const report = await loadShenlunReport(question.answerId, {
          baseUrl: useSettingsStore.getState().apiBaseUrl,
          token,
        })

        if (report === null || report === undefined) {
          if (manual) {
            appendToSession(
              session.id,
              createNoticeMessage('info', '批改还在生成中，可以稍后再刷新。'),
            )
          }
          return
        }

        ensureShenlunReportMessage(session.id, question.id)
        updateShenlunQuestion(session.id, question.id, {
          status: 'report',
          report,
          error: undefined,
        })
        appendToSession(session.id, createTextMessage('批改结果出来了。'))
      } catch (error) {
        updateShenlunQuestion(session.id, question.id, {
          status: 'error',
          error: toUserMessage(error),
        })
        if (manual) get().reportPracticeError(error, '/shenlun refresh')
      } finally {
        shenlunRefreshing.delete(refreshKey)
      }
    },

    startAnalyze(start) {
      const current = get().session
      const canReuse = canReuseChatForPractice(current)
      const base =
        canReuse && current ? current : createEmptySession(ANALYZE_SESSION_TITLE, 'analyze')
      const machine = practiceReducer(
        { messages: canReuse ? [] : base.messages, practice: null },
        {
          type: 'start',
          questions: start.questions,
          intro: start.intro,
          introKind: 'text',
          model: [],
          remote: false,
          flow: 'analyze',
          groupId: start.groupId,
        },
      )

      if (!machine.practice) {
        appendAssistant(
          createNoticeMessage('warning', '这组词语暂时没有可用的辨析题目，换一组试试。'),
        )
        return
      }

      const next: ChatSession = {
        ...base,
        title: ANALYZE_SESSION_TITLE,
        mode: 'analyze',
        messages: [
          ...machine.messages,
          createActionsMessage(createAnalyzeStartActions(), '也可以换个问法：'),
        ],
        draft: '',
        scrollTop: 0,
        updatedAt: Date.now(),
        practice: machine.practice,
        analyze: {
          groupId: start.groupId,
          words: start.words,
          mode: start.mode,
          mastered: false,
        },
      }

      delete next.shenlun

      set((state) => ({
        session: next,
        sessions: upsertSessionSummary(state.sessions, next).slice(0, MAX_SESSION_HISTORY),
        ui: { ...state.ui, sidebarOpen: false, toolsOpen: false },
      }))
      sessionCache.set(next.id, next)
      writeActiveSessionId(next.id)
    },

    async startAnalyzeFrom(loader, retryCommand) {
      const operationKey = `start:analyze:${retryCommand}`
      if (!beginOperation(operationKey)) return false

      try {
        const start = await loader()
        get().startAnalyze(start)
        return true
      } catch (error) {
        if (isAbortError(error)) return false
        get().reportPracticeError(error, retryCommand)
        return false
      } finally {
        endOperation(operationKey)
      }
    },

    switchAnalyzeMode(mode) {
      const session = get().session
      const analyze = session?.analyze

      if (!session || !analyze) {
        appendAssistant(
          createNoticeMessage('info', '当前没有正在进行的词语辨析，可以输入 /analyze 来一组。'),
        )
        return
      }

      if (analyze.mode === mode) {
        appendAssistant(createNoticeMessage('info', '现在已经是这种问法了。'))
        return
      }

      try {
        get().startAnalyze(prepareAnalyzeStart(analyze.words, mode, analyze.groupId))
      } catch (error) {
        get().reportPracticeError(error, '/analyze')
      }
    },

    async markAnalyzeMastered() {
      const session = get().session
      const analyze = session?.analyze

      if (!session || !analyze) {
        appendAssistant(
          createNoticeMessage('info', '当前没有词语辨析的记录，可以输入 /analyze 来一组。'),
        )
        return
      }

      if (analyze.mastered) {
        appendAssistant(createNoticeMessage('info', '这组词语已经标记为掌握了。'))
        return
      }

      const token = useAuthStore.getState().token
      if (!token) {
        appendAssistant(createNoticeMessage('warning', '登录后才能标记已掌握。'))
        appendAssistant(createActionsMessage([{ label: '去登录', kind: 'retry' }], '接下来可以：'))
        return
      }

      const operationKey = `analyze:master:${analyze.groupId}`
      if (!beginOperation(operationKey)) return

      try {
        await markAnalyzeGroupMastered(analyze.groupId, {
          baseUrl: useSettingsStore.getState().apiBaseUrl,
          token,
        })
        patchSession(session.id, (current) =>
          current.analyze
            ? { ...current, analyze: { ...current.analyze, mastered: true } }
            : current,
        )
        appendAssistant(createTextMessage('已把这组词标记为掌握。'))
      } catch (error) {
        if (error instanceof MembershipError) {
          useAuthStore.getState().handleMembershipExpired(toUserMessage(error))
          appendAssistant(
            createNoticeMessage('warning', '这组词语属于会员内容，暂时无法标记已掌握。'),
          )
          return
        }
        get().reportPracticeError(error, '/analyze')
      } finally {
        endOperation(operationKey)
      }
    },

    updateWordState(patch) {
      const session = get().session
      if (!session) return

      if (patch === null) {
        if (!session.word) return
        const next = { ...session }
        delete next.word
        commitSession(next, false)
        return
      }

      const previous = session.word
      const next: WordState = {
        kind: patch.kind ?? previous?.kind ?? 'idiom',
        query: patch.query ?? previous?.query ?? '',
        results: patch.results ?? previous?.results ?? [],
        savedIds: patch.savedIds ?? previous?.savedIds ?? [],
        highFrequency: patch.highFrequency ?? previous?.highFrequency ?? false,
      }

      if (patch.current !== undefined) next.current = patch.current
      else if (previous?.current) next.current = previous.current

      commitSession({ ...session, word: next }, false)
    },

    async refreshFavorites() {
      const token = useAuthStore.getState().token
      if (!token) {
        if (get().favoriteIds.length > 0) set({ favoriteIds: [] })
        return
      }

      const operationKey = 'tk:getMyMarkAll'
      if (!beginOperation(operationKey)) return

      try {
        const ids = await tk.listFavoriteIds({
          baseUrl: useSettingsStore.getState().apiBaseUrl,
          token,
        })
        set({ favoriteIds: ids })
      } catch {
        // Bookmark state is best-effort; the next explicit action retries it.
      } finally {
        endOperation(operationKey)
      }
    },

    async toggleFavorite(questionId) {
      const token = useAuthStore.getState().token
      if (!token) {
        appendAssistant(createNoticeMessage('warning', '登录后才能收藏题目。'))
        appendAssistant(createActionsMessage([{ label: '去登录', kind: 'retry' }], '接下来可以：'))
        return
      }

      const context = {
        baseUrl: useSettingsStore.getState().apiBaseUrl,
        token,
      }
      const isFavorite = get().favoriteIds.includes(questionId)
      const operationKey = `tk:favorite:${isFavorite ? 'remove' : 'add'}:${questionId}`
      if (!beginOperation(operationKey)) return

      try {
        if (isFavorite) {
          await tk.removeFavorite(questionId, context)
          set({ favoriteIds: get().favoriteIds.filter((id) => id !== questionId) })
          appendAssistant(createTextMessage('已取消收藏这道题。'))
        } else {
          await tk.addFavorite(questionId, context)
          set({ favoriteIds: [questionId, ...get().favoriteIds] })
          appendAssistant(createTextMessage('已收藏这道题，可以在收藏里找到。'))
        }
      } catch (error) {
        get().reportPracticeError(error, '/favorites')
      } finally {
        endOperation(operationKey)
      }
    },

    reportPracticeError(error, retryCommand) {
      if (isAbortError(error)) return

      if (error instanceof AuthError) {
        useAuthStore.getState().handleAuthFailure()
        appendAssistant(createNoticeMessage('warning', '登录状态已失效，请重新登录后再继续。'))
        appendAssistant(createActionsMessage([{ label: '去登录', kind: 'retry' }], '接下来可以：'))
        return
      }

      if (error instanceof MembershipError) {
        const message = toUserMessage(error)
        useAuthStore.getState().handleMembershipExpired(message)
        appendAssistant(createNoticeMessage('warning', `会员状态不可用：${message}`))
        return
      }

      if (error instanceof DecodeError) {
        // Surface the specific payload label (e.g. 专项练习) instead of a
        // generic sentence, then offer the same retry action.
        appendAssistant(createNoticeMessage('error', toUserMessage(error)))
        appendRetry(retryCommand)
        return
      }

      if (error instanceof NetworkError) {
        appendAssistant(createNoticeMessage('warning', '网络似乎断开了，请检查网络后重试。'))
        appendRetry(retryCommand)
        return
      }

      if (error instanceof HttpError || error instanceof ApiError) {
        appendAssistant(createNoticeMessage('warning', toUserMessage(error)))
        appendRetry(retryCommand)
        return
      }

      appendAssistant(createNoticeMessage('error', '出了点问题，请稍后再试。'))
      appendRetry(retryCommand)
    },

    showHelp() {
      appendAssistant(createHelpMessage())
    },

    openSettings(tab = 'appearance') {
      set((state) => ({
        ui: {
          ...state.ui,
          settingsOpen: true,
          settingsTab: tab,
          toolsOpen: false,
          sidebarOpen: false,
        },
      }))
    },

    closeSettings() {
      set((state) => ({ ui: { ...state.ui, settingsOpen: false } }))
    },

    openTools() {
      set((state) => ({
        ui: { ...state.ui, toolsOpen: true, settingsOpen: false, sidebarOpen: false },
      }))
    },

    closeTools() {
      set((state) => ({ ui: { ...state.ui, toolsOpen: false } }))
    },

    setSidebarOpen(open) {
      set((state) => ({ ui: { ...state.ui, sidebarOpen: open } }))
    },

    setPersistNotice(message) {
      set({ persistNotice: message })
    },

    dismissPersistNotice() {
      set({ persistNotice: null })
    },
  }
})

/** Test-only reset that keeps the store API stable for component tests. */
export function resetChatStore(): void {
  initializePromise = null
  sessionCache.clear()
  shenlunRefreshing.clear()
  activeOperations.clear()
  useChatStore.setState({
    session: null,
    sessions: [],
    status: 'idle',
    persistNotice: null,
    favoriteIds: [],
    ui: initialUi(),
  })
}
