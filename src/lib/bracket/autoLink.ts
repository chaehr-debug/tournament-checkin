export interface AutoLink {
  matchId: string
  nextMatchId: string
  nextMatchSlot: 'A' | 'B'
}

export function computeAutoLinks(
  previousRoundMatchIds: string[],
  nextRoundMatchIds: string[]
): AutoLink[] | null {
  if (
    previousRoundMatchIds.length === 0 ||
    previousRoundMatchIds.length !== nextRoundMatchIds.length * 2
  ) {
    return null
  }

  return previousRoundMatchIds.map((matchId, index) => ({
    matchId,
    nextMatchId: nextRoundMatchIds[Math.floor(index / 2)],
    nextMatchSlot: index % 2 === 0 ? 'A' : 'B',
  }))
}
