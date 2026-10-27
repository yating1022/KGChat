import { Fragment, type ReactNode } from 'react'

type MarkdownBlock =
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'blockquote'; blocks: MarkdownBlock[] }

function isListLine(line: string): boolean {
  return /^[-*]\s+/.test(line)
}

function listItemText(line: string): string {
  return line.replace(/^[-*]\s+/, '')
}

function isQuoteLine(line: string): boolean {
  return /^>\s?/.test(line)
}

function quoteLineText(line: string): string {
  return line.replace(/^>\s?/, '')
}

function parseBlocks(text: string): MarkdownBlock[] {
  const lines = text.trim().split(/\r?\n/)
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      index += 1
      continue
    }

    if (isQuoteLine(line)) {
      const quoted: string[] = []
      while (index < lines.length && isQuoteLine(lines[index])) {
        quoted.push(quoteLineText(lines[index]))
        index += 1
      }
      blocks.push({ kind: 'blockquote', blocks: parseBlocks(quoted.join('\n')) })
      continue
    }

    if (isListLine(line)) {
      const items: string[] = []
      while (index < lines.length && isListLine(lines[index])) {
        items.push(listItemText(lines[index]).trim())
        index += 1
      }
      blocks.push({ kind: 'list', items })
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isQuoteLine(lines[index]) &&
      !isListLine(lines[index])
    ) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push({ kind: 'paragraph', lines: paragraph })
  }

  return blocks
}

/** Renders inline `**bold**` runs as React nodes; everything else stays text. */
function inlineNodes(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    return <Fragment key={key}>{part}</Fragment>
  })
}

function Paragraph({ lines }: { lines: string[] }) {
  return (
    <p>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 ? <br /> : null}
          {inlineNodes(line, `line-${index}`)}
        </Fragment>
      ))}
    </p>
  )
}

function Blocks({ blocks }: { blocks: MarkdownBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === 'list') {
          return (
            <ul className="chat-md-list" key={`list-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${index}-${itemIndex}`}>
                  {inlineNodes(item, `item-${index}-${itemIndex}`)}
                </li>
              ))}
            </ul>
          )
        }

        if (block.kind === 'blockquote') {
          return (
            <blockquote className="chat-md-quote" key={`quote-${index}`}>
              <Blocks blocks={block.blocks} />
            </blockquote>
          )
        }

        return <Paragraph lines={block.lines} key={`paragraph-${index}`} />
      })}
    </>
  )
}

export interface ChatMarkdownProps {
  text: string
}

/**
 * Minimal safe renderer for plain assistant text (bold, quotes, lists). It supports only
 * bold, blockquotes, and dash lists, and never injects raw HTML.
 */
export function ChatMarkdown({ text }: ChatMarkdownProps) {
  return (
    <div className="chat-md">
      <Blocks blocks={parseBlocks(text)} />
    </div>
  )
}
