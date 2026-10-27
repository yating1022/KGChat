import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isRequestInFlight, resetRequestGate, runOnce } from '../requestGate'

beforeEach(() => {
  resetRequestGate()
})

describe('requestGate', () => {
  it('shares one promise for concurrent duplicate calls', async () => {
    let resolveTask: (value: string) => void = () => {}
    const task = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveTask = resolve
        }),
    )

    const first = runOnce('tk:sourceInfo:1', task)
    const second = runOnce('tk:sourceInfo:1', task)

    expect(task).toHaveBeenCalledTimes(1)
    expect(isRequestInFlight('tk:sourceInfo:1')).toBe(true)

    resolveTask('ok')

    await expect(first).resolves.toBe('ok')
    await expect(second).resolves.toBe('ok')
    expect(isRequestInFlight('tk:sourceInfo:1')).toBe(false)
  })

  it('clears the key after a rejection so retry works', async () => {
    const failing = runOnce('tk:addRecord', async () => {
      throw new Error('boom')
    })

    await expect(failing).rejects.toThrow('boom')
    expect(isRequestInFlight('tk:addRecord')).toBe(false)

    await expect(runOnce('tk:addRecord', async () => 'retried')).resolves.toBe('retried')
  })

  it('keeps separate operations independent', async () => {
    const first = runOnce('tk:favorite:1', async () => 'one')
    const second = runOnce('tk:favorite:2', async () => 'two')

    await expect(first).resolves.toBe('one')
    await expect(second).resolves.toBe('two')
  })
})
