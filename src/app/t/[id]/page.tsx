'use client'

import { use, useCallback, useEffect, useState } from 'react'
import type { Match, TournamentDetail } from '@/lib/bracket/types'
import { BracketView } from '@/components/bracket/BracketView'
import { CheckinModal } from '@/components/checkin/CheckinModal'
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches'

export default function PublicTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [detail, setDetail] = useState<TournamentDetail | null>(null)
  const [activeMatch, setActiveMatch] = useState<Match | null>(null)

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
      <BracketView detail={detail} onMatchClick={setActiveMatch} />
      {activeMatch && (
        <CheckinModal
          match={activeMatch}
          teams={detail.teams}
          onClose={() => setActiveMatch(null)}
          onCheckedIn={loadDetail}
        />
      )}
    </main>
  )
}
