import crypto from 'crypto'

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12 // 12 hours

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return secret
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
}

export function createSessionToken(): string {
  const expires = Date.now() + SESSION_MAX_AGE_MS
  const payload = String(expires)
  return `${payload}.${sign(payload)}`
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false

  const expected = sign(payload)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (signatureBuffer.length !== expectedBuffer.length) return false
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return false

  const expires = Number(payload)
  return Number.isFinite(expires) && Date.now() < expires
}
