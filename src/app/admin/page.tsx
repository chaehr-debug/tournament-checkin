'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Tournament } from '@/lib/bracket/types'

export default function AdminDashboardPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function loadTournaments() {
    const response = await fetch('/api/tournaments')
    if (response.status === 401) {
      window.location.href = '/admin/login'
      return
    }
    const body = await response.json()
    setTournaments(body.tournaments ?? [])
  }

  useEffect(() => {
    loadTournaments()
  }, [])

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const response = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!response.ok) {
      setError('토너먼트 생성에 실패했습니다')
      return
    }
    setName('')
    await loadTournaments()
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-semibold">토너먼트 대시보드</h1>
      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="새 토너먼트 이름"
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          생성
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
        {tournaments.map((tournament) => (
          <li key={tournament.id}>
            <Link
              href={`/admin/tournaments/${tournament.id}`}
              className="block rounded border px-3 py-2 hover:bg-gray-50"
            >
              {tournament.name}{' '}
              <span className="text-sm text-gray-500">({tournament.status})</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
