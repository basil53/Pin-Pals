-- Run this in Supabase → SQL Editor → New Query

create table if not exists players (
  id text primary key,
  first_name text not null,
  last_name text,
  nickname text not null,
  location text,
  created_at bigint not null
);

create table if not exists sessions (
  id text primary key,
  player_id text not null references players(id),
  frames jsonb not null,
  score integer not null,
  date text not null,
  venue text,
  source text default 'live',
  created_at bigint not null
);

-- Allow anyone to read/write (no login required for the app)
alter table players enable row level security;
alter table sessions enable row level security;

create policy "Public read players" on players for select using (true);
create policy "Public insert players" on players for insert with check (true);
create policy "Public update players" on players for update using (true);

create policy "Public read sessions" on sessions for select using (true);
create policy "Public insert sessions" on sessions for insert with check (true);
create policy "Public update sessions" on sessions for update using (true);
