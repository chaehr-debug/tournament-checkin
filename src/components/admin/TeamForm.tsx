'use client'

import { useState } from 'react'

interface TeamFormProps {
  tournamentId: string
  onChange: () => void
}

export function TeamForm({ tournamentId, onChange }: TeamFormProps) {
  const [name, setName] = useState('')
  const [members, setMembers] = useState('')
  const [lastCreated, setLastCreated] = useState<{ name: string; pin: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const response = await fetch(`/api/tournaments/${tournamentId}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, members }),
    })
    if (!response.ok) {
      setError('팀 등록에 실패했습니다')
      return
    }
    const body = await response.json()
    setLastCreated({ name: body.team.name, pin: body.pin })
    setName('')
    setMembers('')
    onChange()
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 font-semibold">팀 등록</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="팀 이름"
          className="flex-1 rounded border px-3 py-2"
        />
        <input
          value={members}
          onChange={(event) => setMembers(event.target.value)}
          placeholder="참가자 명단 (선택)"
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          팀 추가
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {lastCreated && (
        <p className="mt-2 rounded bg-yellow-50 p-2 text-sm">
          <strong>{lastCreated.name}</strong>의 PIN: <strong>{lastCreated.pin}</strong> — 이 화면을
          벗어나면 다시 볼 수 없으니 지금 팀에 전달하세요.
        </p>
      )}
    </section>
  )
}
