import { describe, it, expect } from 'vitest'
import { hashPin, verifyPin, generateRandomPin } from './pin'

describe('team pin', () => {
  it('hashes and verifies a matching pin', async () => {
    const hash = await hashPin('1234')
    expect(await verifyPin('1234', hash)).toBe(true)
  })

  it('rejects a non-matching pin', async () => {
    const hash = await hashPin('1234')
    expect(await verifyPin('9999', hash)).toBe(false)
  })

  it('generates a 4-digit numeric pin', () => {
    const pin = generateRandomPin()
    expect(pin).toMatch(/^\d{4}$/)
  })
})
