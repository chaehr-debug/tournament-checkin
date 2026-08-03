import { describe, it, expect } from 'vitest'
import { computeAutoLinks } from './autoLink'

describe('computeAutoLinks', () => {
  it('links a 4-match round to a 2-match round in slot order', () => {
    const result = computeAutoLinks(['m0', 'm1', 'm2', 'm3'], ['n0', 'n1'])
    expect(result).toEqual([
      { matchId: 'm0', nextMatchId: 'n0', nextMatchSlot: 'A' },
      { matchId: 'm1', nextMatchId: 'n0', nextMatchSlot: 'B' },
      { matchId: 'm2', nextMatchId: 'n1', nextMatchSlot: 'A' },
      { matchId: 'm3', nextMatchId: 'n1', nextMatchSlot: 'B' },
    ])
  })

  it('links a 2-match round to a 1-match final', () => {
    const result = computeAutoLinks(['m0', 'm1'], ['n0'])
    expect(result).toEqual([
      { matchId: 'm0', nextMatchId: 'n0', nextMatchSlot: 'A' },
      { matchId: 'm1', nextMatchId: 'n0', nextMatchSlot: 'B' },
    ])
  })

  it('returns null when the next round is not exactly half the size', () => {
    expect(computeAutoLinks(['m0', 'm1', 'm2'], ['n0', 'n1'])).toBeNull()
  })

  it('returns null for an empty previous round', () => {
    expect(computeAutoLinks([], ['n0'])).toBeNull()
  })
})
