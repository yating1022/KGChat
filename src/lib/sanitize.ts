import DOMPurify from 'dompurify'

/** Public SaDuck origin used to resolve relative images from question HTML. */
export const SADUCK_WEB_ORIGIN = 'https://saduck.top'

const SANITIZE_CONFIG = {
  // Keep tables, images, `<font color>`, `<mark>`, and `<ins>` from the API,
  // while removing anything that can run code or submit data.
  FORBID_TAGS: [
    'script',
    'style',
    'iframe',
    'frame',
    'frameset',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'option',
    'link',
    'meta',
    'base',
    'svg',
    'math',
  ],
  FORBID_ATTR: [
    'srcdoc',
    'formaction',
    'action',
    'method',
    'xlink:href',
    'onerror',
    'onload',
    'onclick',
    'onmouseover',
    'onfocus',
    'onbegin',
  ],
  ADD_ATTR: ['target', 'rel', 'loading', 'referrerpolicy'],
}

function absoluteUrl(value: string): string {
  const source = value.trim()
  if (!source) return source
  if (/^(?:https?:)?\/\//i.test(source)) return source
  if (/^(?:data|blob|mailto|tel):/i.test(source)) return source

  try {
    return new URL(source, SADUCK_WEB_ORIGIN).toString()
  } catch {
    return source
  }
}

/**
 * Resolves relative media and link targets before sanitizing. Parsing is inert
 * (`DOMParser` does not execute scripts), and DOMPurify still runs afterwards.
 */
function prepareHtml(raw: string): string {
  if (typeof DOMParser === 'undefined') return raw

  try {
    const document = new DOMParser().parseFromString(raw, 'text/html')

    for (const image of Array.from(document.querySelectorAll('img'))) {
      const source = image.getAttribute('src')
      if (source) image.setAttribute('src', absoluteUrl(source))
      image.setAttribute('loading', 'lazy')
      image.setAttribute('referrerpolicy', 'no-referrer')
    }

    for (const anchor of Array.from(document.querySelectorAll('a'))) {
      const href = anchor.getAttribute('href')
      if (href) anchor.setAttribute('href', absoluteUrl(href))
      anchor.setAttribute('target', '_blank')
      anchor.setAttribute('rel', 'noopener noreferrer')
    }

    return document.body.innerHTML
  } catch {
    return raw
  }
}

/**
 * Sanitizes API HTML for `dangerouslySetInnerHTML`. Relative images resolve
 * against the SaDuck site so remote question assets keep loading.
 */
export function sanitizeHtml(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || !raw.trim()) return ''
  return String(DOMPurify.sanitize(prepareHtml(raw), SANITIZE_CONFIG))
}

/** Cheap check used by small inline labels that are usually plain text. */
export function containsHtml(value: string): boolean {
  return /<\/?[a-z][^>]*>/i.test(value)
}

/**
 * Converts API HTML into a short plain-text line for conversational feedback.
 * The full sanitized HTML remains available behind the explicit analysis
 * action; this helper is only for a brief post-answer hint.
 */
export function htmlToText(raw: string | null | undefined, maxLength = 120): string {
  if (typeof raw !== 'string' || !raw.trim()) return ''

  let text: string
  if (typeof DOMParser !== 'undefined') {
    try {
      text = new DOMParser().parseFromString(raw, 'text/html').body.textContent ?? ''
    } catch {
      text = raw.replace(/<[^>]*>/g, ' ')
    }
  } else {
    text = raw.replace(/<[^>]*>/g, ' ')
  }

  const normalized = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()

  if (maxLength <= 0 || normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trimEnd()}…`
}
