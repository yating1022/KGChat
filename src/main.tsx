import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { ErrorBoundary } from './app/ErrorBoundary'
import { Providers } from './app/providers'
import { router } from './app/router'
import './styles/globals.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('找不到应用挂载节点。')
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </ErrorBoundary>
  </StrictMode>,
)
