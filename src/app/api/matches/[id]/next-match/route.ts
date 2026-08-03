import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: matchId } = await context.params
  const { nextMatchId, nextMatchSlot } = await request.json()
  if (typeof nextMatchId !== 'string' || (nextMatchSlot !== 'A' && nextMatchSlot !== 'B')) {
    return NextResponse.json(
      { error: 'nextMatchId and nextMatchSlot (A|B) are required' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('matches')
    .update({ next_match_id: nextMatchId, next_match_slot: nextMatchSlot })
    .eq('id', matchId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ match: data })
}
