import { createBrowserRouter } from 'react-router-dom'

import { App } from './App'

/**
 * Derives the router basename from the directory the document was served from:
 * `/KGChat/login` -> `/KGChat`, `/login` (reverse proxy at root) -> undefined.
 */
export function resolveBasename(
  href: string = typeof window === 'undefined' ? '' : window.location.href,
): string | undefined {
  if (!href) return undefined
  const dir = new URL('.', href).pathname.replace(/\/+$/, '')
  return dir || undefined
}

const basename = resolveBasename()

export const router = createBrowserRouter(
  [
    { path: '/', element: <App /> },
    { path: '/login', element: <App /> },
    { path: '*', element: <App /> },
  ],
  { basename },
)
