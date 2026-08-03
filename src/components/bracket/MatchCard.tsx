'use client'

import type { Match, Team } from '@/lib/bracket/types'

interface MatchCardProps {
  match: Match
  teams: Team[]
  onClick?: (match: Match) => void
}

export function MatchCard({ match, teams, onClick }: MatchCardProps) {
  function teamName(teamId: string | null) {
    return teams.find((team) => team.id === teamId)?.name ?? '(미배정)'
  }

  return (
    <button
      type="button"
      onClick={() => onClick?.(match)}
      className="w-full rounded border p-3 text-left hover:bg-gray-50"
    >
      <div className="flex items-center justify-between text-sm">
        <span>
          {teamName(match.team_a_id)} {match.team_a_checked_in ? '✅' : '⏳'}
        </span>
        <span className="text-gray-400">vs</span>
        <span>
          {match.team_b_checked_in ? '✅' : '⏳'} {teamName(match.team_b_id)}
        </span>
      </div>
      {match.winner_id && (
        <p className="mt-1 text-xs font-medium text-green-700">승자: {teamName(match.winner_id)}</p>
      )}
    </button>
  )
}
