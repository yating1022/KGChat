import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('development server config', () => {
  it('uses port 4521 for dev and preview', () => {
    const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8')

    expect(config.match(/port:\s*4521/g)).toHaveLength(2)
  })
})
