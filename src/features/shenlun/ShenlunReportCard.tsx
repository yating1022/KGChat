import { Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo } from 'react'

import { useChatStore } from '../../chat/chatStore'
import {
  SHENLUN_POLL_INTERVAL_MS,
  buildShenlunReport,
  hasShenlunReportContent,
} from './shenlunService'

export interface ShenlunReportCardProps {
  questionId: number
}

function rawJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

export function ShenlunReportCard({ questionId }: ShenlunReportCardProps) {
  const question = useChatStore(
    (state) => state.session?.shenlun?.questions.find((item) => item.id === questionId) ?? null,
  )
  const refreshShenlunReport = useChatStore((state) => state.refreshShenlunReport)
  const status = question?.status ?? 'idle'

  const report = useMemo(
    () => (question?.report === undefined ? null : buildShenlunReport(question.report)),
    [question?.report],
  )

  useEffect(() => {
    if (status !== 'polling') return

    const timer = window.setInterval(() => {
      void refreshShenlunReport(questionId)
    }, SHENLUN_POLL_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [status, refreshShenlunReport, questionId])

  if (!question) {
    return <p className="shenlun-report-note">这条批改记录已不在当前对话中。</p>
  }

  const refreshButton = (
    <button
      type="button"
      className="picker-chip shenlun-report-refresh"
      onClick={() => void refreshShenlunReport(questionId, { manual: true })}
      disabled={status === 'submitting' || status === 'saving'}
    >
      <RefreshCw size={13} aria-hidden="true" />
      <span>刷新报告</span>
    </button>
  )

  if (status === 'saving' || status === 'submitting') {
    return (
      <div className="shenlun-report shenlun-report--pending" role="status">
        <span className="shenlun-report-head">
          <Loader2 className="picker-spin" size={15} aria-hidden="true" />
          <span>正在准备批改…</span>
        </span>
      </div>
    )
  }

  if (status === 'polling') {
    return (
      <div className="shenlun-report shenlun-report--pending" role="status" aria-live="polite">
        <span className="shenlun-report-head">
          <Loader2 className="picker-spin" size={15} aria-hidden="true" />
          <span>批改还在生成中，通常需要 1–3 分钟。</span>
        </span>
        <p className="shenlun-report-note">我会每 5 秒自动刷新一次，也可以手动看看。</p>
        {refreshButton}
      </div>
    )
  }

  if (status === 'timeout') {
    return (
      <div className="shenlun-report shenlun-report--pending" role="status" aria-live="polite">
        <span className="shenlun-report-head">
          <span>批改生成得有点久，暂时还没有结果。</span>
        </span>
        <p className="shenlun-report-note">自动刷新已经暂停，可以稍后手动刷新。</p>
        {refreshButton}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="shenlun-report shenlun-report--pending" role="status">
        <span className="shenlun-report-head">这次批改没有取到结果。</span>
        <p className="shenlun-report-note">{question.error ?? '可以稍后再试一次。'}</p>
        {refreshButton}
      </div>
    )
  }

  if (!report || !hasShenlunReportContent(report)) {
    return (
      <div className="shenlun-report shenlun-report--pending" role="status">
        <span className="shenlun-report-head">批改结果已经生成，暂时没有可显示的文本。</span>
        {question.report !== undefined ? (
          <details className="shenlun-report-raw">
            <summary>查看原始批改数据</summary>
            <pre>{rawJson(question.report)}</pre>
          </details>
        ) : null}
      </div>
    )
  }

  return (
    <section className="shenlun-report" aria-label="申论批改结果">
      <header className="shenlun-report-head">
        <span>批改结果</span>
        {report.headline ? <strong>{report.headline}</strong> : null}
      </header>

      {report.info.length > 0 ? (
        <div className="shenlun-report-info">
          {report.info.map((item) => (
            <span key={item.label} className="shenlun-report-chip">
              {item.label}：{item.value}
            </span>
          ))}
        </div>
      ) : null}

      {report.subScores.length > 0 ? (
        <div className="shenlun-report-block">
          <p className="shenlun-report-block-title">分项评分</p>
          <ul className="shenlun-report-list">
            {report.subScores.map((item, index) => (
              <li key={`${item.itemName}-${index}`}>
                <span className="shenlun-report-item">
                  {item.itemName}
                  <span className="shenlun-report-score">{item.itemScore}</span>
                </span>
                {item.deductReason ? (
                  <span className="shenlun-report-reason">{item.deductReason}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.advantages.length > 0 ? (
        <div className="shenlun-report-block">
          <p className="shenlun-report-block-title">做得好的地方</p>
          <ul className="shenlun-report-list shenlun-report-list--good">
            {report.advantages.map((item, index) => (
              <li key={`advantage-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.errors.length > 0 ? (
        <div className="shenlun-report-block">
          <p className="shenlun-report-block-title">需要改进的地方</p>
          <ul className="shenlun-report-list shenlun-report-list--bad">
            {report.errors.map((item, index) => (
              <li key={`error-${index}`}>
                <span>{item.errorDesc}</span>
                {item.deductScore ? (
                  <span className="shenlun-report-score shenlun-report-score--bad">
                    −{item.deductScore}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.suggestions.length > 0 ? (
        <div className="shenlun-report-block">
          <p className="shenlun-report-block-title">下一步可以这样练</p>
          <ul className="shenlun-report-list">
            {report.suggestions.map((item, index) => (
              <li key={`suggestion-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.sections.length > 0 ? (
        <div className="shenlun-report-block">
          {report.sections.map((section, index) => (
            <div key={`${section.title}-${index}`} className="shenlun-report-section">
              <p className="shenlun-report-block-title">{section.title}</p>
              {section.body ? <p className="shenlun-report-body">{section.body}</p> : null}
              {section.items ? (
                <ul className="shenlun-report-list">
                  {section.items.map((item, itemIndex) => (
                    <li key={`${section.title}-${itemIndex}`}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <details className="shenlun-report-raw">
        <summary>查看原始批改数据</summary>
        <pre>{rawJson(question.report)}</pre>
      </details>
    </section>
  )
}
