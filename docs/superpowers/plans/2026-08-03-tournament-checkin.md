# Tournament Check-in System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js + Supabase web app where an admin can create tournaments with custom round structures, register teams with PINs, assign teams into a bracket, and where teams check themselves in for their match by entering their team's PIN — with the whole bracket updating live for everyone watching.

**Architecture:** Next.js App Router (TypeScript) serves both the UI and the API routes. All writes (create tournament/round/team, assign teams, set winners, check-in) go through server-side API routes using a Supabase service-role client, so RLS only needs to allow public reads of non-sensitive data. The browser subscribes to Supabase Realtime `postgres_changes` on the `matches` table and refetches tournament detail on any change, so the public bracket and admin screen both update without a refresh.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Supabase (Postgres + Realtime + JS client v2), Tailwind CSS, bcryptjs, Vitest (unit tests), Vercel (deploy target).

## Global Constraints

- Admin auth is a single shared password from `ADMIN_PASSWORD` env var — no per-admin accounts.
- Team PINs are bcrypt-hashed at rest; plaintext PIN is only ever returned once, in the create-team API response.
- Check-in attempts are rate-limited: 5 failed attempts per `ip+team_id` triggers a 30s lockout.
- All admin-mutating API routes must verify the admin session cookie before doing anything.
- No score/points tracking, no double elimination, no team self-registration — winner selection and team registration are admin-only actions (spec: `docs/superpowers/specs/2026-08-03-tournament-checkin-design.md`).

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`, `.env.local.example`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`
- Create: `vitest.config.ts`

**Interfaces:**
- Produces: a runnable Next.js app (`npm run dev`) and a runnable test command (`npm test`) that later tasks add tests into.

- [ ] **Step 1: Scaffold the Next.js app**

Run in `C:\Users\cogyf\projects\tournament-checkin`:

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir=false --import-alias "@/*" --eslint --use-npm --yes
```

If prompted interactively despite `--yes`, accept the defaults (App Router, Tailwind, `src/` directory, `@/*` import alias).

- [ ] **Step 2: Add remaining dependencies**

```bash
npm install @supabase/supabase-js bcryptjs
npm install -D vitest @vitejs/plugin-react
```

- [ ] **Step 3: Add a test script and Vitest config**

Add to `package.json` `"scripts"`:

```json
"test": "vitest run"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 4: Create the env example file**

Create `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD=
SESSION_SECRET=
```

- [ ] **Step 5: Verify the app builds and runs**

Run: `npm run build`
Expected: build completes with no errors (default `create-next-app` starter page).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind and Vitest"
```

---

### Task 2: Supabase schema and typed clients

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `src/lib/bracket/types.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/browser.ts`

**Interfaces:**
- Produces: `Tournament`, `Team`, `Round`, `Match`, `TournamentDetail` types (used by every later task); `createServiceClient()` (server-only, service-role Supabase client); `supabaseBrowser` (anon-key Supabase client for client components).

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0001_init.sql`:

```sql
create extension if not exists "pgcrypto";

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'setup' check (status in ('setup', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  pin_hash text not null,
  members text
);

create table rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  "order" int not null,
  match_count int not null
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  slot int not null,
  team_a_id uuid references teams(id),
  team_b_id uuid references teams(id),
  team_a_checked_in boolean not null default false,
  team_b_checked_in boolean not null default false,
  winner_id uuid references teams(id),
  next_match_id uuid references matches(id),
  next_match_slot text check (next_match_slot in ('A', 'B'))
);

alter table tournaments enable row level security;
alter table teams enable row level security;
alter table rounds enable row level security;
alter table matches enable row level security;

-- Public (anon key) may only read tournaments/rounds/matches. Teams are never
-- read directly by the anon key (pin_hash lives there) -- team names reach
-- the browser only via the sanitized API route in Task 13.
create policy "public read tournaments" on tournaments for select using (true);
create policy "public read rounds" on rounds for select using (true);
create policy "public read matches" on matches for select using (true);
```

This file is applied manually by the user against their Supabase project (see Task 17) — it is not run by an automated step in this plan.

- [ ] **Step 2: Write shared types**

Create `src/lib/bracket/types.ts`:

```ts
export type TournamentStatus = 'setup' | 'in_progress' | 'done'

export interface Tournament {
  id: string
  name: string
  status: TournamentStatus
  created_at: string
}

export interface Team {
  id: string
  tournament_id: string
  name: string
  members: string | null
}

export interface Round {
  id: string
  tournament_id: string
  name: string
  order: number
  match_count: number
}

export interface Match {
  id: string
  round_id: string
  slot: number
  team_a_id: string | null
  team_b_id: string | null
  team_a_checked_in: boolean
  team_b_checked_in: boolean
  winner_id: string | null
  next_match_id: string | null
  next_match_slot: 'A' | 'B' | null
}

export interface TournamentDetail {
  tournament: Tournament
  rounds: Array<Round & { matches: Match[] }>
  teams: Team[]
}
```

- [ ] **Step 3: Write the server (service-role) Supabase client**

Create `src/lib/supabase/server.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase service credentials are not set')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}
```

- [ ] **Step 4: Write the browser (anon key) Supabase client**

Create `src/lib/supabase/browser.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

export const supabaseBrowser = createClient(url, anonKey)
```

- [ ] **Step 5: Verify the project still builds**

Run: `npm run build`
Expected: build succeeds (these files aren't wired into any page yet, but must type-check).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Supabase schema, shared types, and typed clients"
```

---

### Task 3: Admin session signing

**Files:**
- Create: `src/lib/auth/session.ts`
- Test: `src/lib/auth/session.test.ts`

**Interfaces:**
- Consumes: `process.env.SESSION_SECRET`
- Produces: `createSessionToken(): string`, `verifySessionToken(token: string | undefined | null): boolean` — used by Task 4's login route and every admin-only API route.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/session.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createSessionToken, verifySessionToken } from './session'

describe('session token', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret'
  })

  it('verifies a token it just created', () => {
    const token = createSessionToken()
    expect(verifySessionToken(token)).toBe(true)
  })

  it('rejects a tampered token', () => {
    const token = createSessionToken()
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
    expect(verifySessionToken(tampered)).toBe(false)
  })

  it('rejects undefined and empty tokens', () => {
    expect(verifySessionToken(undefined)).toBe(false)
    expect(verifySessionToken('')).toBe(false)
  })

  it('rejects an expired token', () => {
    const realNow = Date.now
    Date.now = () => realNow() - 13 * 60 * 60 * 1000 // 13 hours in the past
    const token = createSessionToken()
    Date.now = realNow
    expect(verifySessionToken(token)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/auth/session.test.ts`
Expected: FAIL — `./session` has no exported member `createSessionToken`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/auth/session.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/auth/session.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts
git commit -m "feat: add signed admin session tokens"
```

---

### Task 4: Admin login/logout

**Files:**
- Create: `src/lib/auth/adminGuard.ts`
- Create: `src/app/api/admin/login/route.ts`
- Create: `src/app/api/admin/logout/route.ts`
- Create: `src/app/admin/login/page.tsx`

**Interfaces:**
- Consumes: `verifySessionToken`, `createSessionToken` from Task 3.
- Produces: `requireAdmin(): Promise<boolean>` (used by every admin-only API route in later tasks); cookie name `admin_session`; page route `/admin/login`.

- [ ] **Step 1: Write the admin guard helper**

Create `src/lib/auth/adminGuard.ts`:

```ts
import { cookies } from 'next/headers'
import { verifySessionToken } from './session'

export const ADMIN_SESSION_COOKIE = 'admin_session'

export async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies()
  return verifySessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)
}
```

- [ ] **Step 2: Write the login route**

Create `src/app/api/admin/login/route.ts`:

```ts
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
```

- [ ] **Step 3: Write the logout route**

Create `src/app/api/admin/logout/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE } from '@/lib/auth/adminGuard'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(ADMIN_SESSION_COOKIE)
  return response
}
```

- [ ] **Step 4: Write the login page**

Create `src/app/admin/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!response.ok) {
      setError('비밀번호가 올바르지 않습니다')
      return
    }
    router.push('/admin')
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">관리자 로그인</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="관리자 비밀번호"
          className="rounded border px-3 py-2"
          autoFocus
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          입장
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add admin login/logout and login page"
```

---

### Task 5: Team PIN hashing

**Files:**
- Create: `src/lib/team/pin.ts`
- Test: `src/lib/team/pin.test.ts`

**Interfaces:**
- Produces: `hashPin(pin: string): Promise<string>`, `verifyPin(pin: string, hash: string): Promise<boolean>`, `generateRandomPin(): string` — used by Task 10 (team creation) and Task 15 (check-in).

- [ ] **Step 1: Write the failing test**

Create `src/lib/team/pin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hashPin, verifyPin, generateRandomPin } from './pin'

describe('team pin', () => {
  it('hashes and verifies a matching pin', async () => {
    const hash = await hashPin('1234')
    expect(await verifyPin('1234', hash)).toBe(true)
  })

  it('rejects a non-matching pin', async () => {
    const hash = await hashPin('1234')
    expect(await verifyPin('9999', hash)).toBe(false)
  })

  it('generates a 4-digit numeric pin', () => {
    const pin = generateRandomPin()
    expect(pin).toMatch(/^\d{4}$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/team/pin.test.ts`
Expected: FAIL — module `./pin` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/team/pin.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/team/pin.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/team/pin.ts src/lib/team/pin.test.ts
git commit -m "feat: add team pin hashing and generation"
```

---

### Task 6: Bracket auto-link algorithm

**Files:**
- Create: `src/lib/bracket/autoLink.ts`
- Test: `src/lib/bracket/autoLink.test.ts`

**Interfaces:**
- Produces: `computeAutoLinks(previousRoundMatchIds: string[], nextRoundMatchIds: string[]): AutoLink[] | null` where `AutoLink = { matchId: string; nextMatchId: string; nextMatchSlot: 'A' | 'B' }` — used by Task 9 (round creation).

- [ ] **Step 1: Write the failing test**

Create `src/lib/bracket/autoLink.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeAutoLinks } from './autoLink'

describe('computeAutoLinks', () => {
  it('links a 4-match round to a 2-match round in slot order', () => {
    const result = computeAutoLinks(['m0', 'm1', 'm2', 'm3'], ['n0', 'n1'])
    expect(result).toEqual([
      { matchId: 'm0', nextMatchId: 'n0', nextMatchSlot: 'A' },
      { matchId: 'm1', nextMatchId: 'n0', nextMatchSlot: 'B' },
      { matchId: 'm2', nextMatchId: 'n1', nextMatchSlot: 'A' },
      { matchId: 'm3', nextMatchId: 'n1', nextMatchSlot: 'B' },
    ])
  })

  it('links a 2-match round to a 1-match final', () => {
    const result = computeAutoLinks(['m0', 'm1'], ['n0'])
    expect(result).toEqual([
      { matchId: 'm0', nextMatchId: 'n0', nextMatchSlot: 'A' },
      { matchId: 'm1', nextMatchId: 'n0', nextMatchSlot: 'B' },
    ])
  })

  it('returns null when the next round is not exactly half the size', () => {
    expect(computeAutoLinks(['m0', 'm1', 'm2'], ['n0', 'n1'])).toBeNull()
  })

  it('returns null for an empty previous round', () => {
    expect(computeAutoLinks([], ['n0'])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bracket/autoLink.test.ts`
Expected: FAIL — module `./autoLink` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/bracket/autoLink.ts`:

```ts
export interface AutoLink {
  matchId: string
  nextMatchId: string
  nextMatchSlot: 'A' | 'B'
}

export function computeAutoLinks(
  previousRoundMatchIds: string[],
  nextRoundMatchIds: string[]
): AutoLink[] | null {
  if (
    previousRoundMatchIds.length === 0 ||
    previousRoundMatchIds.length !== nextRoundMatchIds.length * 2
  ) {
    return null
  }

  return previousRoundMatchIds.map((matchId, index) => ({
    matchId,
    nextMatchId: nextRoundMatchIds[Math.floor(index / 2)],
    nextMatchSlot: index % 2 === 0 ? 'A' : 'B',
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bracket/autoLink.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/bracket/autoLink.ts src/lib/bracket/autoLink.test.ts
git commit -m "feat: add bracket auto-link algorithm"
```

---

### Task 7: Check-in rate limiter

**Files:**
- Create: `src/lib/checkin/rateLimit.ts`
- Test: `src/lib/checkin/rateLimit.test.ts`

**Interfaces:**
- Produces: `isLockedOut(key: string, now: number): boolean`, `recordFailure(key: string, now: number): void`, `recordSuccess(key: string): void` — used by Task 15 (check-in route). `now` is injected (not `Date.now()`) so it stays unit-testable.

- [ ] **Step 1: Write the failing test**

Create `src/lib/checkin/rateLimit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { isLockedOut, recordFailure, recordSuccess } from './rateLimit'

describe('check-in rate limiter', () => {
  const key = 'test-key'
  let now = 0

  beforeEach(() => {
    now = 1_000_000
    recordSuccess(key) // clear any state from a previous test
  })

  it('is not locked out before any failures', () => {
    expect(isLockedOut(key, now)).toBe(false)
  })

  it('locks out after 5 failures', () => {
    for (let i = 0; i < 5; i++) recordFailure(key, now)
    expect(isLockedOut(key, now)).toBe(true)
  })

  it('unlocks after the lockout window passes', () => {
    for (let i = 0; i < 5; i++) recordFailure(key, now)
    expect(isLockedOut(key, now + 31_000)).toBe(false)
  })

  it('clears state on success', () => {
    for (let i = 0; i < 4; i++) recordFailure(key, now)
    recordSuccess(key)
    for (let i = 0; i < 4; i++) recordFailure(key, now)
    expect(isLockedOut(key, now)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/checkin/rateLimit.test.ts`
Expected: FAIL — module `./rateLimit` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/checkin/rateLimit.ts`:

```ts
interface Attempt {
  count: number
  lockedUntil: number | null
}

// Process-local: acceptable for this draft's scale (small internal
// tournaments). A multi-instance deploy would need a shared store instead.
const attempts = new Map<string, Attempt>()

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 30_000

export function isLockedOut(key: string, now: number): boolean {
  const attempt = attempts.get(key)
  if (!attempt || attempt.lockedUntil === null) return false
  return now < attempt.lockedUntil
}

export function recordFailure(key: string, now: number): void {
  const attempt = attempts.get(key) ?? { count: 0, lockedUntil: null }
  attempt.count += 1
  if (attempt.count >= MAX_ATTEMPTS) {
    attempt.lockedUntil = now + LOCKOUT_MS
    attempt.count = 0
  }
  attempts.set(key, attempt)
}

export function recordSuccess(key: string): void {
  attempts.delete(key)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/checkin/rateLimit.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/checkin/rateLimit.ts src/lib/checkin/rateLimit.test.ts
git commit -m "feat: add check-in rate limiter"
```

---

### Task 8: Tournaments API + admin dashboard

**Files:**
- Create: `src/app/api/tournaments/route.ts`
- Create: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (Task 4), `createServiceClient` (Task 2), `Tournament` type (Task 2).
- Produces: `GET/POST /api/tournaments`; page route `/admin` (links to `/admin/tournaments/[id]`, built in Task 16).

- [ ] **Step 1: Write the tournaments route**

Create `src/app/api/tournaments/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tournaments: data })
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name } = await request.json()
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tournaments')
    .insert({ name: name.trim() })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tournament: data }, { status: 201 })
}
```

- [ ] **Step 2: Write the admin dashboard page**

Create `src/app/admin/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Tournament } from '@/lib/bracket/types'

export default function AdminDashboardPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function loadTournaments() {
    const response = await fetch('/api/tournaments')
    if (response.status === 401) {
      window.location.href = '/admin/login'
      return
    }
    const body = await response.json()
    setTournaments(body.tournaments ?? [])
  }

  useEffect(() => {
    loadTournaments()
  }, [])

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const response = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!response.ok) {
      setError('토너먼트 생성에 실패했습니다')
      return
    }
    setName('')
    await loadTournaments()
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-semibold">토너먼트 대시보드</h1>
      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="새 토너먼트 이름"
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          생성
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-2">
        {tournaments.map((tournament) => (
          <li key={tournament.id}>
            <Link
              href={`/admin/tournaments/${tournament.id}`}
              className="block rounded border px-3 py-2 hover:bg-gray-50"
            >
              {tournament.name}{' '}
              <span className="text-sm text-gray-500">({tournament.status})</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add tournaments API and admin dashboard"
```

---

### Task 9: Rounds API + RoundBuilder UI

**Files:**
- Create: `src/app/api/tournaments/[id]/rounds/route.ts`
- Create: `src/components/admin/RoundBuilder.tsx`

**Interfaces:**
- Consumes: `computeAutoLinks` (Task 6), `requireAdmin`, `createServiceClient`, `Round`/`Match` types.
- Produces: `POST /api/tournaments/[id]/rounds`; `<RoundBuilder tournamentId={string} onChange={() => void} />` component (mounted in Task 16).

- [ ] **Step 1: Write the rounds route**

Create `src/app/api/tournaments/[id]/rounds/route.ts`:

```ts
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
```

- [ ] **Step 2: Write the RoundBuilder component**

Create `src/components/admin/RoundBuilder.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { Round, Match } from '@/lib/bracket/types'

interface RoundBuilderProps {
  tournamentId: string
  rounds: Array<Round & { matches: Match[] }>
  onChange: () => void
}

export function RoundBuilder({ tournamentId, rounds, onChange }: RoundBuilderProps) {
  const [name, setName] = useState('')
  const [matchCount, setMatchCount] = useState(1)
  const [error, setError] = useState<string | null>(null)

  async function handleAddRound(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const response = await fetch(`/api/tournaments/${tournamentId}/rounds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, matchCount }),
    })
    if (!response.ok) {
      setError('라운드 추가에 실패했습니다')
      return
    }
    setName('')
    setMatchCount(1)
    onChange()
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 font-semibold">라운드</h2>
      <ul className="mb-3 flex flex-col gap-1">
        {rounds.map((round) => (
          <li key={round.id} className="text-sm text-gray-700">
            {round.name} — {round.matches.length}경기
          </li>
        ))}
      </ul>
      <form onSubmit={handleAddRound} className="flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="라운드 이름 (예: 8강)"
          className="flex-1 rounded border px-3 py-2"
        />
        <input
          type="number"
          min={1}
          value={matchCount}
          onChange={(event) => setMatchCount(Number(event.target.value))}
          className="w-24 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          라운드 추가
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  )
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add rounds API with auto-link and RoundBuilder UI"
```

---

### Task 10: Teams API + TeamForm UI

**Files:**
- Create: `src/app/api/tournaments/[id]/teams/route.ts`
- Create: `src/components/admin/TeamForm.tsx`

**Interfaces:**
- Consumes: `hashPin`, `generateRandomPin` (Task 5), `requireAdmin`, `createServiceClient`.
- Produces: `POST /api/tournaments/[id]/teams` (response includes plaintext `pin`, once); `<TeamForm tournamentId={string} onChange={() => void} />` (mounted in Task 16).

- [ ] **Step 1: Write the teams route**

Create `src/app/api/tournaments/[id]/teams/route.ts`:

```ts
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
```

- [ ] **Step 2: Write the TeamForm component**

Create `src/components/admin/TeamForm.tsx`:

```tsx
'use client'

import { useState } from 'react'

interface TeamFormProps {
  tournamentId: string
  onChange: () => void
}

export function TeamForm({ tournamentId, onChange }: TeamFormProps) {
  const [name, setName] = useState('')
  const [members, setMembers] = useState('')
  const [lastCreated, setLastCreated] = useState<{ name: string; pin: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const response = await fetch(`/api/tournaments/${tournamentId}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, members }),
    })
    if (!response.ok) {
      setError('팀 등록에 실패했습니다')
      return
    }
    const body = await response.json()
    setLastCreated({ name: body.team.name, pin: body.pin })
    setName('')
    setMembers('')
    onChange()
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 font-semibold">팀 등록</h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="팀 이름"
          className="flex-1 rounded border px-3 py-2"
        />
        <input
          value={members}
          onChange={(event) => setMembers(event.target.value)}
          placeholder="참가자 명단 (선택)"
          className="flex-1 rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          팀 추가
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {lastCreated && (
        <p className="mt-2 rounded bg-yellow-50 p-2 text-sm">
          <strong>{lastCreated.name}</strong>의 PIN: <strong>{lastCreated.pin}</strong> — 이 화면을
          벗어나면 다시 볼 수 없으니 지금 팀에 전달하세요.
        </p>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add teams API and TeamForm UI"
```

---

### Task 11: Match assignment + next-match override API + BracketEditor UI

**Files:**
- Create: `src/app/api/matches/[id]/assign/route.ts`
- Create: `src/app/api/matches/[id]/next-match/route.ts`
- Create: `src/components/admin/BracketEditor.tsx`

**Interfaces:**
- Consumes: `requireAdmin`, `createServiceClient`, `Match`/`Team`/`Round` types.
- Produces: `POST /api/matches/[id]/assign`, `POST /api/matches/[id]/next-match`; `<BracketEditor tournamentId rounds teams onChange />` (mounted in Task 16).

- [ ] **Step 1: Write the assign route**

Create `src/app/api/matches/[id]/assign/route.ts`:

```ts
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
```

- [ ] **Step 2: Write the next-match override route**

Create `src/app/api/matches/[id]/next-match/route.ts`:

```ts
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
```

- [ ] **Step 3: Write the BracketEditor component**

Create `src/components/admin/BracketEditor.tsx`:

```tsx
'use client'

import type { Round, Match, Team } from '@/lib/bracket/types'

interface BracketEditorProps {
  rounds: Array<Round & { matches: Match[] }>
  teams: Team[]
  onChange: () => void
}

export function BracketEditor({ rounds, teams, onChange }: BracketEditorProps) {
  async function assign(matchId: string, slot: 'A' | 'B', teamId: string) {
    if (!teamId) return
    await fetch(`/api/matches/${matchId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, teamId }),
    })
    onChange()
  }

  async function setNextMatch(matchId: string, value: string) {
    if (!value) return
    const [nextMatchId, nextMatchSlot] = value.split('::')
    await fetch(`/api/matches/${matchId}/next-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nextMatchId, nextMatchSlot }),
    })
    onChange()
  }

  function teamName(teamId: string | null) {
    return teams.find((team) => team.id === teamId)?.name ?? '(미배정)'
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 font-semibold">대진 배치</h2>
      <div className="flex flex-col gap-6">
        {rounds.map((round, roundIndex) => (
          <div key={round.id}>
            <h3 className="mb-2 text-sm font-medium text-gray-600">{round.name}</h3>
            <div className="flex flex-col gap-2">
              {round.matches.map((match) => {
                const nextRound = rounds[roundIndex + 1]
                return (
                  <div key={match.id} className="rounded border p-2">
                    {(['A', 'B'] as const).map((slot) => (
                      <div key={slot} className="mb-1 flex items-center gap-2">
                        <span className="w-24 text-sm">{teamName(slot === 'A' ? match.team_a_id : match.team_b_id)}</span>
                        <select
                          defaultValue=""
                          onChange={(event) => assign(match.id, slot, event.target.value)}
                          className="rounded border px-2 py-1 text-sm"
                        >
                          <option value="" disabled>
                            팀 선택
                          </option>
                          {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    {nextRound && (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-gray-500">다음 진출 경기:</span>
                        <select
                          defaultValue={
                            match.next_match_id ? `${match.next_match_id}::${match.next_match_slot}` : ''
                          }
                          onChange={(event) => setNextMatch(match.id, event.target.value)}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          <option value="" disabled>
                            선택
                          </option>
                          {nextRound.matches.flatMap((nextMatch) =>
                            (['A', 'B'] as const).map((slot) => (
                              <option
                                key={`${nextMatch.id}-${slot}`}
                                value={`${nextMatch.id}::${slot}`}
                              >
                                {nextRound.name} #{nextMatch.slot + 1} - {slot}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add match assignment API and BracketEditor UI"
```

---

### Task 12: Winner selection API + LiveMatchCard UI

**Files:**
- Create: `src/app/api/matches/[id]/winner/route.ts`
- Create: `src/components/admin/LiveMatchCard.tsx`

**Interfaces:**
- Consumes: `requireAdmin`, `createServiceClient`, `Match`/`Team` types.
- Produces: `POST /api/matches/[id]/winner`; `<LiveMatchCard match={Match} teams={Team[]} onChange={() => void} />` (mounted in Task 16).

- [ ] **Step 1: Write the winner route**

Create `src/app/api/matches/[id]/winner/route.ts`:

```ts
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
```

- [ ] **Step 2: Write the LiveMatchCard component**

Create `src/components/admin/LiveMatchCard.tsx`:

```tsx
'use client'

import type { Match, Team } from '@/lib/bracket/types'

interface LiveMatchCardProps {
  match: Match
  teams: Team[]
  onChange: () => void
}

export function LiveMatchCard({ match, teams, onChange }: LiveMatchCardProps) {
  function teamName(teamId: string | null) {
    return teams.find((team) => team.id === teamId)?.name ?? '(미배정)'
  }

  async function pickWinner(winnerId: string) {
    await fetch(`/api/matches/${match.id}/winner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerId }),
    })
    onChange()
  }

  const canPickWinner = Boolean(match.team_a_id && match.team_b_id) && !match.winner_id

  return (
    <div className="rounded border p-3">
      <div className="flex items-center justify-between text-sm">
        <span>
          {teamName(match.team_a_id)} {match.team_a_checked_in ? '✅' : '⏳'}
        </span>
        <span className="text-gray-400">vs</span>
        <span>
          {match.team_b_checked_in ? '✅' : '⏳'} {teamName(match.team_b_id)}
        </span>
      </div>
      {match.winner_id ? (
        <p className="mt-2 text-sm font-medium text-green-700">승자: {teamName(match.winner_id)}</p>
      ) : (
        canPickWinner && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => pickWinner(match.team_a_id as string)}
              className="rounded border px-2 py-1 text-xs"
            >
              {teamName(match.team_a_id)} 승리
            </button>
            <button
              onClick={() => pickWinner(match.team_b_id as string)}
              className="rounded border px-2 py-1 text-xs"
            >
              {teamName(match.team_b_id)} 승리
            </button>
          </div>
        )
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add winner selection API and LiveMatchCard UI"
```

---

### Task 13: Public tournament detail API + BracketView/MatchCard components

**Files:**
- Create: `src/app/api/tournaments/[id]/route.ts`
- Create: `src/components/bracket/MatchCard.tsx`
- Create: `src/components/bracket/BracketView.tsx`

**Interfaces:**
- Consumes: `createServiceClient`, `TournamentDetail`/`Team`/`Match`/`Round` types.
- Produces: `GET /api/tournaments/[id]` (public, sanitized — team objects have no `pin_hash`); `<BracketView detail={TournamentDetail} onMatchClick={(match) => void} />` (used in Task 14/16).

- [ ] **Step 1: Write the public tournament detail route**

Create `src/app/api/tournaments/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: tournamentId } = await context.params
  const supabase = createServiceClient()

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single()
  if (tournamentError) return NextResponse.json({ error: tournamentError.message }, { status: 404 })

  const { data: rounds, error: roundsError } = await supabase
    .from('rounds')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('order', { ascending: true })
  if (roundsError) return NextResponse.json({ error: roundsError.message }, { status: 500 })

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('*')
    .in('round_id', rounds.map((round) => round.id))
    .order('slot', { ascending: true })
  if (matchesError) return NextResponse.json({ error: matchesError.message }, { status: 500 })

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, tournament_id, name, members')
    .eq('tournament_id', tournamentId)
  if (teamsError) return NextResponse.json({ error: teamsError.message }, { status: 500 })

  const roundsWithMatches = rounds.map((round) => ({
    ...round,
    matches: matches.filter((match) => match.round_id === round.id),
  }))

  return NextResponse.json({ tournament, rounds: roundsWithMatches, teams })
}
```

- [ ] **Step 2: Write the MatchCard component**

Create `src/components/bracket/MatchCard.tsx`:

```tsx
'use client'

import type { Match, Team } from '@/lib/bracket/types'

interface MatchCardProps {
  match: Match
  teams: Team[]
  onClick?: (match: Match) => void
}

export function MatchCard({ match, teams, onClick }: MatchCardProps) {
  function teamName(teamId: string | null) {
    return teams.find((team) => team.id === teamId)?.name ?? '(미배정)'
  }

  return (
    <button
      type="button"
      onClick={() => onClick?.(match)}
      className="w-full rounded border p-3 text-left hover:bg-gray-50"
    >
      <div className="flex items-center justify-between text-sm">
        <span>
          {teamName(match.team_a_id)} {match.team_a_checked_in ? '✅' : '⏳'}
        </span>
        <span className="text-gray-400">vs</span>
        <span>
          {match.team_b_checked_in ? '✅' : '⏳'} {teamName(match.team_b_id)}
        </span>
      </div>
      {match.winner_id && (
        <p className="mt-1 text-xs font-medium text-green-700">승자: {teamName(match.winner_id)}</p>
      )}
    </button>
  )
}
```

- [ ] **Step 3: Write the BracketView component**

Create `src/components/bracket/BracketView.tsx`:

```tsx
'use client'

import type { TournamentDetail, Match } from '@/lib/bracket/types'
import { MatchCard } from './MatchCard'

interface BracketViewProps {
  detail: TournamentDetail
  onMatchClick?: (match: Match) => void
}

export function BracketView({ detail, onMatchClick }: BracketViewProps) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      {detail.rounds.map((round) => (
        <div key={round.id} className="flex-1">
          <h3 className="mb-2 text-sm font-medium text-gray-600">{round.name}</h3>
          <div className="flex flex-col gap-3">
            {round.matches.map((match) => (
              <MatchCard key={match.id} match={match} teams={detail.teams} onClick={onMatchClick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add public tournament detail API and bracket view components"
```

---

### Task 14: Realtime hook

**Files:**
- Create: `src/hooks/useRealtimeMatches.ts`

**Interfaces:**
- Consumes: `supabaseBrowser` (Task 2).
- Produces: `useRealtimeMatches(tournamentId: string, onChange: () => void): void` — subscribes once per `tournamentId`, calls `onChange` on any `matches` table change. Used by Task 15 (public page) and Task 16 (admin page).

- [ ] **Step 1: Write the hook**

Create `src/hooks/useRealtimeMatches.ts`:

```ts
'use client'

import { useEffect } from 'react'
import { supabaseBrowser } from '@/lib/supabase/browser'

export function useRealtimeMatches(tournamentId: string, onChange: () => void) {
  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`matches-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        onChange()
      })
      .subscribe()

    return () => {
      supabaseBrowser.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])
}
```

Note: the subscription listens to the whole `matches` table (no server-side filter) and relies on the caller refetching the single tournament's detail on every event; this is fine at the scale of a handful of concurrent tournaments and avoids relying on Realtime's `in` filter support.

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add realtime matches subscription hook"
```

---

### Task 15: Check-in API + CheckinModal UI + public page

**Files:**
- Create: `src/app/api/matches/[id]/checkin/route.ts`
- Create: `src/components/checkin/CheckinModal.tsx`
- Create: `src/app/t/[id]/page.tsx`

**Interfaces:**
- Consumes: `verifyPin` (Task 5), `isLockedOut`/`recordFailure`/`recordSuccess` (Task 7), `createServiceClient`, `BracketView` (Task 13), `useRealtimeMatches` (Task 14).
- Produces: `POST /api/matches/[id]/checkin`; page route `/t/[id]` (public bracket view with check-in).

- [ ] **Step 1: Write the check-in route**

Create `src/app/api/matches/[id]/checkin/route.ts`:

```ts
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
```

- [ ] **Step 2: Write the CheckinModal component**

Create `src/components/checkin/CheckinModal.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { Match, Team } from '@/lib/bracket/types'

interface CheckinModalProps {
  match: Match
  teams: Team[]
  onClose: () => void
  onCheckedIn: () => void
}

export function CheckinModal({ match, teams, onClose, onCheckedIn }: CheckinModalProps) {
  const options = ([
    { slot: 'A' as const, teamId: match.team_a_id, checkedIn: match.team_a_checked_in },
    { slot: 'B' as const, teamId: match.team_b_id, checkedIn: match.team_b_checked_in },
  ]).filter((option) => option.teamId)

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  function teamName(teamId: string | null) {
    return teams.find((team) => team.id === teamId)?.name ?? '(미배정)'
  }

  async function handleCheckin(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!selectedTeamId) return

    const response = await fetch(`/api/matches/${match.id}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: selectedTeamId, pin }),
    })

    if (!response.ok) {
      const body = await response.json()
      setError(body.error ?? '체크인에 실패했습니다')
      return
    }

    onCheckedIn()
    onClose()
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded bg-white p-4">
        <h2 className="mb-3 font-semibold">체크인</h2>
        <div className="mb-3 flex flex-col gap-2">
          {options.map((option) => (
            <button
              key={option.slot}
              type="button"
              disabled={option.checkedIn}
              onClick={() => setSelectedTeamId(option.teamId)}
              className={`rounded border px-3 py-2 text-left ${
                selectedTeamId === option.teamId ? 'border-black' : ''
              } ${option.checkedIn ? 'bg-gray-100 text-gray-400' : ''}`}
            >
              {teamName(option.teamId)} {option.checkedIn ? '— 체크인 완료됨' : ''}
            </button>
          ))}
        </div>
        {selectedTeamId && (
          <form onSubmit={handleCheckin} className="flex flex-col gap-2">
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="팀 PIN"
              className="rounded border px-3 py-2"
              autoFocus
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="rounded bg-black px-3 py-2 text-white">
              체크인
            </button>
          </form>
        )}
        <button type="button" onClick={onClose} className="mt-3 text-sm text-gray-500">
          닫기
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write the public tournament page**

Create `src/app/t/[id]/page.tsx`:

```tsx
'use client'

import { use, useCallback, useEffect, useState } from 'react'
import type { Match, TournamentDetail } from '@/lib/bracket/types'
import { BracketView } from '@/components/bracket/BracketView'
import { CheckinModal } from '@/components/checkin/CheckinModal'
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches'

export default function PublicTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [detail, setDetail] = useState<TournamentDetail | null>(null)
  const [activeMatch, setActiveMatch] = useState<Match | null>(null)

  const loadDetail = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${id}`)
    if (!response.ok) return
    const body = await response.json()
    setDetail(body)
  }, [id])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  useRealtimeMatches(id, loadDetail)

  if (!detail) {
    return <main className="p-6">불러오는 중...</main>
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-xl font-semibold">{detail.tournament.name}</h1>
      <BracketView detail={detail} onMatchClick={setActiveMatch} />
      {activeMatch && (
        <CheckinModal
          match={activeMatch}
          teams={detail.teams}
          onClose={() => setActiveMatch(null)}
          onCheckedIn={loadDetail}
        />
      )}
    </main>
  )
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add check-in API, CheckinModal, and public tournament page"
```

---

### Task 16: Admin tournament detail page

**Files:**
- Create: `src/app/admin/tournaments/[id]/page.tsx`

**Interfaces:**
- Consumes: `RoundBuilder` (Task 9), `TeamForm` (Task 10), `BracketEditor` (Task 11), `LiveMatchCard` (Task 12), `useRealtimeMatches` (Task 14), public detail API (Task 13).

- [ ] **Step 1: Write the admin tournament detail page**

Create `src/app/admin/tournaments/[id]/page.tsx`:

```tsx
'use client'

import { use, useCallback, useEffect, useState } from 'react'
import type { TournamentDetail } from '@/lib/bracket/types'
import { RoundBuilder } from '@/components/admin/RoundBuilder'
import { TeamForm } from '@/components/admin/TeamForm'
import { BracketEditor } from '@/components/admin/BracketEditor'
import { LiveMatchCard } from '@/components/admin/LiveMatchCard'
import { useRealtimeMatches } from '@/hooks/useRealtimeMatches'

export default function AdminTournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [detail, setDetail] = useState<TournamentDetail | null>(null)

  const loadDetail = useCallback(async () => {
    const response = await fetch(`/api/tournaments/${id}`)
    if (!response.ok) return
    const body = await response.json()
    setDetail(body)
  }, [id])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  useRealtimeMatches(id, loadDetail)

  if (!detail) {
    return <main className="p-6">불러오는 중...</main>
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-xl font-semibold">{detail.tournament.name}</h1>
      <RoundBuilder tournamentId={id} rounds={detail.rounds} onChange={loadDetail} />
      <TeamForm tournamentId={id} onChange={loadDetail} />
      <BracketEditor rounds={detail.rounds} teams={detail.teams} onChange={loadDetail} />
      <section>
        <h2 className="mb-2 font-semibold">진행 현황</h2>
        <div className="flex flex-col gap-6 sm:flex-row">
          {detail.rounds.map((round) => (
            <div key={round.id} className="flex-1">
              <h3 className="mb-2 text-sm font-medium text-gray-600">{round.name}</h3>
              <div className="flex flex-col gap-3">
                {round.matches.map((match) => (
                  <LiveMatchCard key={match.id} match={match} teams={detail.teams} onChange={loadDetail} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: assemble admin tournament detail page"
```

---

### Task 17: Supabase project setup and manual end-to-end verification

This task cannot be automated — it requires a Supabase account and a running dev server watched in a browser.

**Files:** none (configuration and manual verification only).

- [ ] **Step 1: Create a Supabase project and apply the migration**

In the Supabase dashboard: create a new project, open the SQL editor, and run the contents of `supabase/migrations/0001_init.sql`.

- [ ] **Step 2: Fill in `.env.local`**

Copy `.env.local.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from Supabase project settings → API.
- `ADMIN_PASSWORD` — any password to protect `/admin`.
- `SESSION_SECRET` — any long random string (e.g. `openssl rand -hex 32`).

- [ ] **Step 3: Run the full unit test suite**

Run: `npm test`
Expected: all tests from Tasks 3, 5, 6, 7 pass.

- [ ] **Step 4: Manually walk the admin flow**

Run: `npm run dev`, open `http://localhost:3000/admin/login`.

- Log in with `ADMIN_PASSWORD`.
- Create a tournament.
- Add rounds: "8강" (4 matches), "4강" (2 matches), "결승" (1 match) — confirm auto-link fills in silently (no errors).
- Add 8 teams, noting each PIN shown.
- Assign all 8 teams into the "8강" round's match slots.
- Confirm the "진행 현황" section shows all 4 first-round matches with both teams and ⏳ status.

- [ ] **Step 5: Manually walk the check-in + progression flow**

Open `http://localhost:3000/t/<tournament-id>` in a second browser (or incognito window).

- Click a match, select a team, enter the wrong PIN — confirm it's rejected.
- Enter the correct PIN — confirm the card flips to ✅ and the admin screen updates within a couple seconds without a manual refresh.
- Repeat for the other team in that match.
- Back in the admin screen, click "승리" for one team in that match — confirm the winner shows, and that team now appears in the correct "4강" match slot.
- Repeat until the "결승" match is fully populated and a winner can be picked.

- [ ] **Step 6: Commit any final fixes discovered during manual verification**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end verification"
```

(Skip this commit if no changes were needed.)
