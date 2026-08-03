import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: matchId } = await context.params
  const { winnerId } = await request.json()
  if (typeof winnerId !== 'string') {
    return NextResponse.json({ error: 'winnerId is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single()

  if (matchError) return NextResponse.json({ error: matchError.message }, { status: 500 })
  if (winnerId !== match.team_a_id && winnerId !== match.team_b_id) {
    return NextResponse.json({ error: 'winnerId must be one of the match teams' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('matches')
    .update({ winner_id: winnerId })
    .eq('id', matchId)
    .select('*')
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  if (updated.next_match_id && updated.next_match_slot) {
    const column = updated.next_match_slot === 'A' ? 'team_a_id' : 'team_b_id'
    const { error: propagateError } = await supabase
      .from('matches')
      .update({ [column]: winnerId })
      .eq('id', updated.next_match_id)
    if (propagateError) return NextResponse.json({ error: propagateError.message }, { status: 500 })
  }

  return NextResponse.json({ match: updated })
}
