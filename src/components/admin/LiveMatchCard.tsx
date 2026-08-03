'use client'

import type { Match, Team } from '@/lib/bracket/types'

interface LiveMatchCardProps {
  match: Match
  teams: Team[]
  onChange: () => void
}

export function LiveMatchCard({ match, teams, onChange }: LiveMatchCardProps) {
  function teamName(teamId: string | null) {
    return teams.find((team) => team.id === teamId)?.name ?? '(미배정)'
  }

  async function pickWinner(winnerId: string) {
    await fetch(`/api/matches/${match.id}/winner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerId }),
    })
    onChange()
  }

  const canPickWinner = Boolean(match.team_a_id && match.team_b_id) && !match.winner_id

  return (
    <div className="rounded border p-3">
      <div className="flex items-center justify-between text-sm">
        <span>
          {teamName(match.team_a_id)} {match.team_a_checked_in ? '✅' : '⏳'}
        </span>
        <span className="text-gray-400">vs</span>
        <span>
          {match.team_b_checked_in ? '✅' : '⏳'} {teamName(match.team_b_id)}
        </span>
      </div>
      {match.winner_id ? (
        <p className="mt-2 text-sm font-medium text-green-700">승자: {teamName(match.winner_id)}</p>
      ) : (
        canPickWinner && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => pickWinner(match.team_a_id as string)}
              className="rounded border px-2 py-1 text-xs"
            >
              {teamName(match.team_a_id)} 승리
            </button>
            <button
              onClick={() => pickWinner(match.team_b_id as string)}
              className="rounded border px-2 py-1 text-xs"
            >
              {teamName(match.team_b_id)} 승리
            </button>
          </div>
        )
      )}
    </div>
  )
}
