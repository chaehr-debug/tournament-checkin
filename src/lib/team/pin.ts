import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS)
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash)
}

export function generateRandomPin(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 10000
  return String(value).padStart(4, '0')
}
