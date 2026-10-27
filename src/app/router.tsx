import { createBrowserRouter } from 'react-router-dom'

import { App } from './App'

const base = import.meta.env.BASE_URL || '/'
const basename = base === '/' ? undefined : base.replace(/\/$/, '')

export const router = createBrowserRouter(
  [
    { path: '/', element: <App /> },
    { path: '/login', element: <App /> },
    { path: '*', element: <App /> },
  ],
  { basename },
)
