import { FileDown, FileUp, Loader2, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'

import {
  MAX_IMPORT_TITLE_LENGTH,
  downloadHistoryBackup,
  importHistoryJson,
  normalizeImportTitle,
} from '../../chat/historyTransfer'
import { useChatStore } from '../../chat/chatStore'
import { saveSession } from '../../chat/sessionRepository'

const MAX_IMPORT_BYTES = 5 * 1024 * 1024

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '出了点问题，请稍后再试。'
}

export function PrivacyPanel() {
  const sessionCount = useChatStore((state) => state.sessions.length)
  const session = useChatStore((state) => state.session)
  const clearChatHistory = useChatStore((state) => state.clearChatHistory)
  const reloadFromStorage = useChatStore((state) => state.reloadFromStorage)

  const [confirmingClear, setConfirmingClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importTitle, setImportTitle] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clear = async () => {
    if (clearing) return
    setClearing(true)
    setError(null)
    setNotice(null)

    try {
      await clearChatHistory()
      setConfirmingClear(false)
      setNotice('本机聊天记录已清空，账号、登录信息与已保存密码不受影响。')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setClearing(false)
    }
  }

  const exportHistory = async () => {
    if (exporting || importing) return
    setExporting(true)
    setError(null)
    setNotice(null)

    try {
      // Flush the in-memory session first so the newest messages are included.
      if (session) await saveSession(session)
      await downloadHistoryBackup()
      setNotice('对话备份已导出。文件中不包含账号、登录信息或密码。')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setExporting(false)
    }
  }

  const importHistory = async (file: File) => {
    if (importing || exporting) return
    setError(null)
    setNotice(null)

    if (file.size > MAX_IMPORT_BYTES) {
      setError('备份文件太大，请选择 5 MB 以内的 JSON 文件。')
      return
    }

    setImporting(true)

    try {
      const raw = await file.text()
      const title = normalizeImportTitle(importTitle)
      const result = await importHistoryJson(raw, title ? { title } : {})
      await reloadFromStorage()

      if (result.imported === 0) {
        setError('没有可导入的有效对话，文件结构可能已损坏。')
        return
      }

      setImportTitle('')
      setNotice(
        `已导入 ${result.imported} 段对话${title ? `「${title}」` : ''}${
          result.skipped > 0 ? `，跳过 ${result.skipped} 条无效记录` : ''
        }。`,
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="settings-panel">
      <section className="settings-section" aria-labelledby="privacy-storage">
        <h3 id="privacy-storage" className="settings-heading">
          本机聊天记录
        </h3>
        <p className="settings-hint">
          当前保存了 {sessionCount} 段对话，存放在浏览器 IndexedDB 中。清空操作只删除本机聊天内容，不会退出登录，也不会改动远端练习记录。
        </p>

        {confirmingClear ? (
          <div className="settings-confirm" data-confirm-open="true">
            <p className="settings-warning">确认清空全部本机聊天记录？此操作无法撤销。</p>
            <div className="settings-actions">
              <button
                type="button"
                className="settings-button settings-button--quiet"
                onClick={() => setConfirmingClear(false)}
                disabled={clearing}
              >
                取消
              </button>
              <button
                type="button"
                className="settings-button settings-button--danger"
                onClick={() => void clear()}
                disabled={clearing}
              >
                <Trash2 size={15} aria-hidden="true" />
                {clearing ? '正在清空…' : '确认清空'}
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-actions">
            <button
              type="button"
              className="settings-button settings-button--quiet"
              onClick={() => {
                setError(null)
                setNotice(null)
                setConfirmingClear(true)
              }}
            >
              <Trash2 size={15} aria-hidden="true" />
              清空本机聊天记录
            </button>
          </div>
        )}
      </section>

      <section className="settings-section" aria-labelledby="privacy-backup">
        <h3 id="privacy-backup" className="settings-heading">
          备份与恢复
        </h3>
        <p className="settings-hint">
          导出为 JSON 文件，只包含对话、进度与草稿。导入时可以给对话起一个标题，方便在左侧列表中区分多个备份；文件会重新校验结构并移除登录信息、密码等敏感字段。
        </p>

        <label className="settings-field">
          <span className="settings-field-label">对话标题（可选）</span>
          <input
            className="settings-input"
            type="text"
            value={importTitle}
            maxLength={MAX_IMPORT_TITLE_LENGTH}
            placeholder="留空则使用文件里的标题"
            onChange={(event) => setImportTitle(event.target.value)}
            disabled={importing}
          />
        </label>

        <div className="settings-actions">
          <button
            type="button"
            className="settings-button"
            onClick={() => void exportHistory()}
            disabled={exporting || importing}
          >
            {exporting ? (
              <Loader2 className="picker-spin" size={15} aria-hidden="true" />
            ) : (
              <FileDown size={15} aria-hidden="true" />
            )}
            {exporting ? '正在导出…' : '导出对话备份'}
          </button>

          <label className="settings-button settings-file-button">
            {importing ? (
              <Loader2 className="picker-spin" size={15} aria-hidden="true" />
            ) : (
              <FileUp size={15} aria-hidden="true" />
            )}
            {importing ? '正在导入…' : '导入对话备份'}
            <input
              type="file"
              className="settings-file-input"
              accept="application/json,.json"
              disabled={importing || exporting}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void importHistory(file)
              }}
            />
          </label>
        </div>

        {notice ? <p className="settings-success">{notice}</p> : null}
        {error ? <p className="settings-error">{error}</p> : null}
      </section>

      <section className="settings-section">
        <h3 className="settings-heading">隐私说明</h3>
        <p className="settings-hint">
          <ShieldCheck size={14} aria-hidden="true" /> 聊天记录只保存在当前浏览器，不会上传。请勿在共享设备上使用「记住密码」。
        </p>
      </section>
    </div>
  )
}
