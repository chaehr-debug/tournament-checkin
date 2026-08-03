'use client'

import { useState } from 'react'
import type { Match, Team } from '@/lib/bracket/types'

interface LiveMatchCardProps {
  match: Match
  teams: Team[]
  onChange: () => void
}

export function LiveMatchCard({ match, teams, onChange }: LiveMatchCardProps) {
  const [error, setError] = useState<string | null>(null)

  function teamName(teamId: string | null) {
    return teams.find((team) => team.id === teamId)?.name ?? '(미배정)'
  }

  async function pickWinner(winnerId: string) {
    setError(null)
    const response = await fetch(`/api/matches/${match.id}/winner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerId }),
    })
    if (!response.ok) {
      const body = await response.json()
      setError(body.error ?? '승자 지정에 실패했습니다')
      return
    }
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
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
