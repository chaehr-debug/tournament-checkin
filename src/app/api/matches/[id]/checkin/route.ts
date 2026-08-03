import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyPin } from '@/lib/team/pin'
import { isLockedOut, recordFailure, recordSuccess } from '@/lib/checkin/rateLimit'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: matchId } = await context.params
  const { teamId, pin } = await request.json()
  if (typeof teamId !== 'string' || typeof pin !== 'string') {
    return NextResponse.json({ error: 'teamId and pin are required' }, { status: 400 })
  }

  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  const rateLimitKey = `${ip}:${teamId}`
  const now = Date.now()

  if (isLockedOut(rateLimitKey, now)) {
    return NextResponse.json({ error: '너무 많이 실패했습니다. 30초 후 다시 시도하세요.' }, { status: 429 })
  }

  const supabase = createServiceClient()
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single()
  if (matchError) return NextResponse.json({ error: matchError.message }, { status: 404 })

  let slot: 'A' | 'B' | null = null
  if (match.team_a_id === teamId) slot = 'A'
  if (match.team_b_id === teamId) slot = 'B'
  if (!slot) {
    return NextResponse.json({ error: '이 매치에 배정된 팀이 아닙니다' }, { status: 400 })
  }

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('pin_hash')
    .eq('id', teamId)
    .single()
  if (teamError) return NextResponse.json({ error: teamError.message }, { status: 404 })

  const valid = await verifyPin(pin, team.pin_hash)
  if (!valid) {
    recordFailure(rateLimitKey, now)
    return NextResponse.json({ error: 'PIN이 올바르지 않습니다' }, { status: 401 })
  }
  recordSuccess(rateLimitKey)

  const column = slot === 'A' ? 'team_a_checked_in' : 'team_b_checked_in'
  const { data: updated, error: updateError } = await supabase
    .from('matches')
    .update({ [column]: true })
    .eq('id', matchId)
    .select('*')
    .single()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ match: updated })
}
