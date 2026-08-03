import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: matchId } = await context.params
  const { slot, teamId } = await request.json()
  if (slot !== 'A' && slot !== 'B') {
    return NextResponse.json({ error: "slot must be 'A' or 'B'" }, { status: 400 })
  }
  if (typeof teamId !== 'string') {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const column = slot === 'A' ? 'team_a_id' : 'team_b_id'
  const { data, error } = await supabase
    .from('matches')
    .update({ [column]: teamId })
    .eq('id', matchId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ match: data })
}
