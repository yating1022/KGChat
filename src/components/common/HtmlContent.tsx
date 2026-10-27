import { useMemo, type ElementType } from 'react'

import { sanitizeHtml } from '../../lib/sanitize'

export interface HtmlContentProps {
  html?: string | null
  className?: string
  as?: ElementType
}

/**
 * Renders sanitized API HTML. Used for question stems, materials, option text,
 * and analysis so untrusted markup never reaches the live DOM.
 */
export function HtmlContent({ html, className, as: Tag = 'div' }: HtmlContentProps) {
  const clean = useMemo(() => sanitizeHtml(html), [html])

  if (!clean) return null

  const classes = className ? `html-content ${className}` : 'html-content'

  return <Tag className={classes} dangerouslySetInnerHTML={{ __html: clean }} />
}
