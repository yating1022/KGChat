import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveBasename } from '../router'

describe('development server config', () => {
  it('uses port 4521 for dev and preview', () => {
    const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8')

    expect(config.match(/port:\s*4521/g)).toHaveLength(2)
  })

  it('derives the router basename from the serving directory', () => {
    expect(resolveBasename('https://chat.bjyt.de/')).toBeUndefined()
    expect(resolveBasename('https://chat.bjyt.de/login')).toBeUndefined()
    expect(resolveBasename('https://yating1022.github.io/KGChat/')).toBe('/KGChat')
    expect(resolveBasename('https://yating1022.github.io/KGChat/login')).toBe('/KGChat')
  })
})
