import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const routeSource = readFileSync(join(__dirname, 'route.ts'), 'utf-8')

describe('tournaments/[id] route teams query sanitization', () => {
  it('selects only the public-safe team columns (no pin_hash)', () => {
    expect(routeSource).toContain(".select('id, tournament_id, name, members')")
  })

  it('never references pin_hash in this public route', () => {
    expect(routeSource).not.toContain('pin_hash')
  })
})
