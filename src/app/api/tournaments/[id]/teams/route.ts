import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { createServiceClient } from '@/lib/supabase/server'
import { hashPin, generateRandomPin } from '@/lib/team/pin'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: tournamentId } = await context.params
  const { name, pin, members } = await request.json()
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const plainPin = typeof pin === 'string' && pin.trim().length > 0 ? pin.trim() : generateRandomPin()
  const pinHash = await hashPin(plainPin)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('teams')
    .insert({
      tournament_id: tournamentId,
      name: name.trim(),
      pin_hash: pinHash,
      members: typeof members === 'string' ? members : null,
    })
    .select('id, tournament_id, name, members')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ team: data, pin: plainPin }, { status: 201 })
}
