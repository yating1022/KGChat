import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetChatStore, useChatStore } from '../../../chat/chatStore'
import type { ChatSession, ShenlunQuestionState } from '../../../chat/chatTypes'
import { ShenlunReportCard } from '../ShenlunReportCard'

const report = {
  baseInfo: {
    questionType: '归纳概括',
    answerWordCount: 240,
    wordCountCheck: '符合要求',
    totalScore: 20,
  },
  finalScore: { actualScore: 15, level: '良好', scoreRate: '75%' },
  subScoreList: [
    { itemName: '要点完整', itemScore: 8, deductReason: '' },
    { itemName: '条理清晰', itemScore: 7, deductReason: '层次可以更清楚' },
  ],
  advantageList: ['要点覆盖较全'],
  errorList: [{ errorDesc: '表述略显口语', deductScore: 2 }],
  suggestList: ['多练习分条归纳'],
}

const question: ShenlunQuestionState = {
  id: 10011,
  content: '<p>请根据“给定资料1”概括做法。</p>',
  requirement: '要求：不超过250字。',
  plainContent: '请根据“给定资料1”概括做法。',
  answer: '作答内容',
  answerId: '80974',
  status: 'report',
  report,
}

function session(): ChatSession {
  return {
    id: 'chat-report',
    title: '聊聊申论',
    createdAt: 1,
    updatedAt: 1,
    messages: [],
    draft: '',
    scrollTop: 0,
    mode: 'shenlun',
    shenlun: { paperId: 7904460, questions: [question], index: 0, status: 'active' },
  }
}

beforeEach(() => {
  localStorage.clear()
  resetChatStore()
  const current = session()
  useChatStore.setState({
    session: current,
    sessions: [{ id: current.id, title: current.title, updatedAt: current.updatedAt }],
    status: 'ready',
  })
})

afterEach(() => {
  cleanup()
})

describe('ShenlunReportCard', () => {
  it('renders the live pgResp fields as a conversational report', () => {
    render(<ShenlunReportCard questionId={10011} />)

    expect(screen.getByText('实际得分 15 / 20 · 等级 良好 · 得分率 75%')).toBeTruthy()
    expect(screen.getByText('题型：归纳概括')).toBeTruthy()
    expect(screen.getByText('要点完整')).toBeTruthy()
    expect(screen.getByText('层次可以更清楚')).toBeTruthy()
    expect(screen.getByText('做得好的地方')).toBeTruthy()
    expect(screen.getByText('要点覆盖较全')).toBeTruthy()
    expect(screen.getByText('表述略显口语')).toBeTruthy()
    expect(screen.getByText('多练习分条归纳')).toBeTruthy()
    expect(screen.getByText('查看原始批改数据')).toBeTruthy()
    expect(screen.queryByText('保存本组记录')).toBeNull()
  })
})
