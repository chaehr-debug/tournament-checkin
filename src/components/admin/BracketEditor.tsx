'use client'

import type { Round, Match, Team } from '@/lib/bracket/types'

interface BracketEditorProps {
  rounds: Array<Round & { matches: Match[] }>
  teams: Team[]
  onChange: () => void
}

export function BracketEditor({ rounds, teams, onChange }: BracketEditorProps) {
  async function assign(matchId: string, slot: 'A' | 'B', teamId: string) {
    if (!teamId) return
    await fetch(`/api/matches/${matchId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, teamId }),
    })
    onChange()
  }

  async function setNextMatch(matchId: string, value: string) {
    if (!value) return
    const [nextMatchId, nextMatchSlot] = value.split('::')
    await fetch(`/api/matches/${matchId}/next-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nextMatchId, nextMatchSlot }),
    })
    onChange()
  }

  function teamName(teamId: string | null) {
    return teams.find((team) => team.id === teamId)?.name ?? '(미배정)'
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 font-semibold">대진 배치</h2>
      <div className="flex flex-col gap-6">
        {rounds.map((round, roundIndex) => (
          <div key={round.id}>
            <h3 className="mb-2 text-sm font-medium text-gray-600">{round.name}</h3>
            <div className="flex flex-col gap-2">
              {round.matches.map((match) => {
                const nextRound = rounds[roundIndex + 1]
                return (
                  <div key={match.id} className="rounded border p-2">
                    {(['A', 'B'] as const).map((slot) => (
                      <div key={slot} className="mb-1 flex items-center gap-2">
                        <span className="w-24 text-sm">{teamName(slot === 'A' ? match.team_a_id : match.team_b_id)}</span>
                        <select
                          defaultValue=""
                          onChange={(event) => assign(match.id, slot, event.target.value)}
                          className="rounded border px-2 py-1 text-sm"
                        >
                          <option value="" disabled>
                            팀 선택
                          </option>
                          {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    {nextRound && (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-gray-500">다음 진출 경기:</span>
                        <select
                          defaultValue={
                            match.next_match_id ? `${match.next_match_id}::${match.next_match_slot}` : ''
                          }
                          onChange={(event) => setNextMatch(match.id, event.target.value)}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          <option value="" disabled>
                            선택
                          </option>
                          {nextRound.matches.flatMap((nextMatch) =>
                            (['A', 'B'] as const).map((slot) => (
                              <option
                                key={`${nextMatch.id}-${slot}`}
                                value={`${nextMatch.id}::${slot}`}
                              >
                                {nextRound.name} #{nextMatch.slot + 1} - {slot}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
