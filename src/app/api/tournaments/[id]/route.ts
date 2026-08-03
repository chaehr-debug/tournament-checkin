import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await context.params
  const supabase = createServiceClient()

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single()
  if (tournamentError) return NextResponse.json({ error: tournamentError.message }, { status: 404 })

  const { data: rounds, error: roundsError } = await supabase
    .from('rounds')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('order', { ascending: true })
  if (roundsError) return NextResponse.json({ error: roundsError.message }, { status: 500 })

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('*')
    .in('round_id', rounds.map((round) => round.id))
    .order('slot', { ascending: true })
  if (matchesError) return NextResponse.json({ error: matchesError.message }, { status: 500 })

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, tournament_id, name, members')
    .eq('tournament_id', tournamentId)
  if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 })

  const roundsWithMatches = rounds.map((round) => ({
    ...round,
    matches: matches.filter((match) => match.round_id === round.id),
  }))

  return NextResponse.json({ tournament, rounds: roundsWithMatches, teams })
}
