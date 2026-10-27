/**
 * Tiny in-flight request gate.
 *
 * Rapid duplicate clicks can fire before React re-renders a disabled button.
 * `runOnce` keeps one promise per operation key so the second click joins the
 * first request instead of sending another one. Keys contain operation names
 * and payload identifiers only — never credentials or tokens.
 */

const inFlight = new Map<string, Promise<unknown>>()

export function isRequestInFlight(key: string): boolean {
  return inFlight.has(key)
}

/** Runs `task` once per key while it is pending; duplicates share the promise. */
export function runOnce<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>

  const promise = task().finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key)
  })

  inFlight.set(key, promise)
  return promise
}

/** Test-only reset. */
export function resetRequestGate(): void {
  inFlight.clear()
}
