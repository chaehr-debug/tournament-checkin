import { describe, it, expect, beforeEach } from 'vitest'
import { createSessionToken, verifySessionToken } from './session'

describe('session token', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret'
  })

  it('verifies a token it just created', () => {
    const token = createSessionToken()
    expect(verifySessionToken(token)).toBe(true)
  })

  it('rejects a tampered token', () => {
    const token = createSessionToken()
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
    expect(verifySessionToken(tampered)).toBe(false)
  })

  it('rejects undefined and empty tokens', () => {
    expect(verifySessionToken(undefined)).toBe(false)
    expect(verifySessionToken('')).toBe(false)
  })

  it('rejects an expired token', () => {
    const realNow = Date.now
    Date.now = () => realNow() - 13 * 60 * 60 * 1000 // 13 hours in the past
    const token = createSessionToken()
    Date.now = realNow
    expect(verifySessionToken(token)).toBe(false)
  })
})
