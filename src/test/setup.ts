import { webcrypto } from 'node:crypto'

// jsdom does not expose SubtleCrypto. The credential vault needs AES-GCM, so
// fall back to Node's standards-compliant WebCrypto implementation.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: false,
  })
}
