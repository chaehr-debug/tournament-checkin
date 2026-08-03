'use client'

import { useState } from 'react'
import type { Match, Team } from '@/lib/bracket/types'

interface CheckinModalProps {
  match: Match
  teams: Team[]
  onClose: () => void
  onCheckedIn: () => void
}

export function CheckinModal({ match, teams, onClose, onCheckedIn }: CheckinModalProps) {
  const options = ([
    { slot: 'A' as const, teamId: match.team_a_id, checkedIn: match.team_a_checked_in },
    { slot: 'B' as const, teamId: match.team_b_id, checkedIn: match.team_b_checked_in },
  ]).filter((option) => option.teamId)

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  function teamName(teamId: string | null) {
    return teams.find((team) => team.id === teamId)?.name ?? '(미배정)'
  }

  async function handleCheckin(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!selectedTeamId) return

    const response = await fetch(`/api/matches/${match.id}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: selectedTeamId, pin }),
    })

    if (!response.ok) {
      const body = await response.json()
      setError(body.error ?? '체크인에 실패했습니다')
      return
    }

    onCheckedIn()
    onClose()
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded bg-white p-4">
        <h2 className="mb-3 font-semibold">체크인</h2>
        <div className="mb-3 flex flex-col gap-2">
          {options.map((option) => (
            <button
              key={option.slot}
              type="button"
              disabled={option.checkedIn}
              onClick={() => setSelectedTeamId(option.teamId)}
              className={`rounded border px-3 py-2 text-left ${
                selectedTeamId === option.teamId ? 'border-black' : ''
              } ${option.checkedIn ? 'bg-gray-100 text-gray-400' : ''}`}
            >
              {teamName(option.teamId)} {option.checkedIn ? '— 체크인 완료됨' : ''}
            </button>
          ))}
        </div>
        {selectedTeamId && (
          <form onSubmit={handleCheckin} className="flex flex-col gap-2">
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="팀 PIN"
              className="rounded border px-3 py-2"
              autoFocus
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="rounded bg-black px-3 py-2 text-white">
              체크인
            </button>
          </form>
        )}
        <button type="button" onClick={onClose} className="mt-3 text-sm text-gray-500">
          닫기
        </button>
      </div>
    </div>
  )
}
