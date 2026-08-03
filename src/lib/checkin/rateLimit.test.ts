import { describe, it, expect, beforeEach } from 'vitest'
import { isLockedOut, recordFailure, recordSuccess } from './rateLimit'

describe('check-in rate limiter', () => {
  const key = 'test-key'
  let now = 0

  beforeEach(() => {
    now = 1_000_000
    recordSuccess(key) // clear any state from a previous test
  })

  it('is not locked out before any failures', () => {
    expect(isLockedOut(key, now)).toBe(false)
  })

  it('locks out after 5 failures', () => {
    for (let i = 0; i < 5; i++) recordFailure(key, now)
    expect(isLockedOut(key, now)).toBe(true)
  })

  it('unlocks after the lockout window passes', () => {
    for (let i = 0; i < 5; i++) recordFailure(key, now)
    expect(isLockedOut(key, now + 31_000)).toBe(false)
  })

  it('clears state on success', () => {
    for (let i = 0; i < 4; i++) recordFailure(key, now)
    recordSuccess(key)
    for (let i = 0; i < 4; i++) recordFailure(key, now)
    expect(isLockedOut(key, now)).toBe(false)
  })
})
