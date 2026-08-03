'use client'

import type { TournamentDetail, Match } from '@/lib/bracket/types'
import { MatchCard } from './MatchCard'

interface BracketViewProps {
  detail: TournamentDetail
  onMatchClick?: (match: Match) => void
}

export function BracketView({ detail, onMatchClick }: BracketViewProps) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      {detail.rounds.map((round) => (
        <div key={round.id} className="flex-1">
          <h3 className="mb-2 text-sm font-medium text-gray-600">{round.name}</h3>
          <div className="flex flex-col gap-3">
            {round.matches.map((match) => (
              <MatchCard key={match.id} match={match} teams={detail.teams} onClick={onMatchClick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
