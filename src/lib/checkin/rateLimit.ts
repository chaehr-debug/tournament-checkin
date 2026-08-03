interface Attempt {
  count: number
  lockedUntil: number | null
}

// Process-local: acceptable for this draft's scale (small internal
// tournaments). A multi-instance deploy would need a shared store instead.
const attempts = new Map<string, Attempt>()

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 30_000

export function isLockedOut(key: string, now: number): boolean {
  const attempt = attempts.get(key)
  if (!attempt || attempt.lockedUntil === null) return false
  return now < attempt.lockedUntil
}

export function recordFailure(key: string, now: number): void {
  const attempt = attempts.get(key) ?? { count: 0, lockedUntil: null }
  attempt.count += 1
  if (attempt.count >= MAX_ATTEMPTS) {
    attempt.lockedUntil = now + LOCKOUT_MS
    attempt.count = 0
  }
  attempts.set(key, attempt)
}

export function recordSuccess(key: string): void {
  attempts.delete(key)
}
