import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '../../../auth/authStore'
import type { TagNode } from '../../../api/types'
import { SpecialPicker } from '../SpecialPicker'
import type * as PracticeService from '../practiceService'

const { fetchTagTreeMock } = vi.hoisted(() => ({ fetchTagTreeMock: vi.fn() }))

vi.mock('../practiceService', async (importOriginal) => {
  const actual = await importOriginal<typeof PracticeService>()
  return { ...actual, fetchTagTree: fetchTagTreeMock }
})

const tree: TagNode[] = [
  {
    id: '政治理论',
    parentId: null,
    sort: 1,
    zqc: 0,
    cwc: 0,
    count: 12,
    ise: false,
    children: [
      {
        id: '理论政策',
        parentId: '政治理论',
        sort: 1,
        zqc: 3,
        cwc: 0,
        count: 12,
        ise: false,
        children: [],
      },
    ],
  },
]

const mixedTree: TagNode[] = [
  ...tree,
  {
    id: '资料分析',
    parentId: null,
    sort: 2,
    zqc: 0,
    cwc: 0,
    count: 8,
    ise: false,
    children: [
      {
        id: '文字资料',
        parentId: '资料分析',
        sort: 1,
        zqc: 0,
        cwc: 0,
        count: 8,
        ise: false,
        children: [],
      },
    ],
  },
]

function renderPicker() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      <SpecialPicker />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  fetchTagTreeMock.mockReset()
  fetchTagTreeMock.mockResolvedValue(tree)
  useAuthStore.setState({
    status: 'authenticated',
    token: 'test-token',
    profile: { email: 'test@example.com', vipType: 1, vipStartTime: null, vipEndTime: null },
    membershipExpired: false,
    loginPending: false,
    verifying: false,
    lastError: null,
  })
})

afterEach(() => {
  cleanup()
  useAuthStore.setState({
    status: 'anonymous',
    token: null,
    profile: null,
    membershipExpired: false,
    lastError: null,
  })
})

describe('SpecialPicker', () => {
  it('adds a selected leaf and updates the estimated total', async () => {
    const user = userEvent.setup()
    renderPicker()

    const leaf = await screen.findByRole('checkbox', { name: '理论政策' })
    expect((leaf as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText(/合计 0 题/)).toBeTruthy()

    await user.click(leaf)

    expect((leaf as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText(/合计 5 题/)).toBeTruthy()
    expect((screen.getByLabelText('理论政策 题数') as HTMLSelectElement).value).toBe('5')
  })

  it('does not mix a material leaf with a non-material knowledge point', async () => {
    fetchTagTreeMock.mockResolvedValueOnce(mixedTree)
    const user = userEvent.setup()
    renderPicker()

    const theory = (await screen.findByRole('checkbox', {
      name: '理论政策',
    })) as HTMLInputElement
    const material = screen.getByRole('checkbox', { name: '文字资料' }) as HTMLInputElement

    await user.click(theory)
    expect(theory.checked).toBe(true)
    expect(material.disabled).toBe(true)

    await user.click(theory)
    expect(theory.checked).toBe(false)
    expect(material.disabled).toBe(false)

    await user.click(material)
    expect(material.checked).toBe(true)
    expect(theory.disabled).toBe(true)
  })
})
