'use client'

import { use, useCallback, useEffect, useState } from 'react'
import type { TournamentDetail } from '@/lib/bracket/types'
import { RoundBuilder } from '@/components/admin/RoundBuilder'
import { TeamForm } from '@/components/admin/TeamForm'
import { BracketEditor } from '@/components/admin/BracketEditor'
import { LiveMatchCard } from '@/components/admin/LiveMatchCard'
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches'

export default function AdminTournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [detail, setDetail] = useState<TournamentDetail | null>(null)

  const loadDetail = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${id}`)
    if (!response.ok) return
    const body = await response.json()
    setDetail(body)
  }, [id])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  useRealtimeMatches(id, loadDetail)

  if (!detail) {
    return <main className="p-6">불러오는 중...</main>
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-xl font-semibold">{detail.tournament.name}</h1>
      <RoundBuilder tournamentId={id} rounds={detail.rounds} onChange={loadDetail} />
      <TeamForm tournamentId={id} onChange={loadDetail} />
      <BracketEditor rounds={detail.rounds} teams={detail.teams} onChange={loadDetail} />
      <section>
        <h2 className="mb-2 font-semibold">진행 현황</h2>
        <div className="flex flex-col gap-6 sm:flex-row">
          {detail.rounds.map((round) => (
            <div key={round.id} className="flex-1">
              <h3 className="mb-2 text-sm font-medium text-gray-600">{round.name}</h3>
              <div className="flex flex-col gap-3">
                {round.matches.map((match) => (
                  <LiveMatchCard key={match.id} match={match} teams={detail.teams} onChange={loadDetail} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
