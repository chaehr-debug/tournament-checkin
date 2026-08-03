import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createSessionToken } from '@/lib/auth/session'
import { ADMIN_SESSION_COOKIE } from '@/lib/auth/adminGuard'

function passwordsMatch(input: string, expected: string): boolean {
  const inputBuffer = Buffer.from(input)
  const expectedBuffer = Buffer.from(expected)
  if (inputBuffer.length !== expectedBuffer.length) return false
  return crypto.timingSafeEqual(inputBuffer, expectedBuffer)
}

export async function POST(request: Request) {
  const { password } = await request.json()
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword || typeof password !== 'string' || !passwordsMatch(password, adminPassword)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(ADMIN_SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 12,
    path: '/',
  })
  return response
}
