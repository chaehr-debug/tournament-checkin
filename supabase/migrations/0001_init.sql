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
