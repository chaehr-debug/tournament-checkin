import { cookies } from 'next/headers'
import { verifySessionToken } from './session'

export const ADMIN_SESSION_COOKIE = 'admin_session'

export async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies()
  return verifySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
}
