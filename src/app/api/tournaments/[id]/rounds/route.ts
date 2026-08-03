import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { createServiceClient } from '@/lib/supabase/server'
import { computeAutoLinks } from '@/lib/bracket/autoLink'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: tournamentId } = await context.params
  const { name, matchCount } = await request.json()
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (typeof matchCount !== 'number' || matchCount < 1) {
    return NextResponse.json({ error: 'matchCount must be at least 1' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: existingRounds, error: roundsError } = await supabase
    .from('rounds')
    .select('id, order, match_count')
    .eq('tournament_id', tournamentId)
    .order('order', { ascending: false })
    .limit(1)

  if (roundsError) return NextResponse.json({ error: roundsError.message }, { status: 500 })

  const previousRound = existingRounds?.[0] ?? null
  const nextOrder = previousRound ? previousRound.order + 1 : 0

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .insert({ tournament_id: tournamentId, name: name.trim(), order: nextOrder, match_count: matchCount })
    .select('*')
    .single()

  if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

  const matchRows = Array.from({ length: matchCount }, (_, slot) => ({
    round_id: round.id,
    slot,
  }))
  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .insert(matchRows)
    .select('*')
    .order('slot', { ascending: true })

  if (matchError) return NextResponse.json({ error: matchError.message }, { status: 500 })

  if (previousRound) {
    const { data: previousMatches, error: previousMatchesError } = await supabase
      .from('matches')
      .select('id')
      .eq('round_id', previousRound.id)
      .order('slot', { ascending: true })

    if (previousMatchesError) {
      return NextResponse.json({ error: previousMatchesError.message }, { status: 500 })
    }

    const links = computeAutoLinks(
      previousMatches.map((match) => match.id),
      matches.map((match) => match.id)
    )

    if (links) {
      for (const link of links) {
        const { error: linkError } = await supabase
          .from('matches')
          .update({ next_match_id: link.nextMatchId, next_match_slot: link.nextMatchSlot })
          .eq('id', link.matchId)
        if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ round, matches }, { status: 201 })
}
