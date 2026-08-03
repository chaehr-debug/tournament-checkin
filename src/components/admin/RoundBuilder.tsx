'use client'

import { useState } from 'react'
import type { Round, Match } from '@/lib/bracket/types'

interface RoundBuilderProps {
  tournamentId: string
  rounds: Array<Round & { matches: Match[] }>
  onChange: () => void
}

export function RoundBuilder({ tournamentId, rounds, onChange }: RoundBuilderProps) {
  const [name, setName] = useState('')
  const [matchCount, setMatchCount] = useState(1)
  const [error, setError] = useState<string | null>(null)

  async function handleAddRound(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const response = await fetch(`/api/tournaments/${tournamentId}/rounds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, matchCount }),
    })
    if (!response.ok) {
      setError('라운드 추가에 실패했습니다')
      return
    }
    setName('')
    setMatchCount(1)
    onChange()
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 font-semibold">라운드</h2>
      <ul className="mb-3 flex flex-col gap-1">
        {rounds.map((round) => (
          <li key={round.id} className="text-sm text-gray-700">
            {round.name} — {round.matches.length}경기
          </li>
        ))}
      </ul>
      <form onSubmit={handleAddRound} className="flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="라운드 이름 (예: 8강)"
          className="flex-1 rounded border px-3 py-2"
        />
        <input
          type="number"
          min={1}
          value={matchCount}
          onChange={(event) => setMatchCount(Number(event.target.value))}
          className="w-24 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          라운드 추가
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  )
}
