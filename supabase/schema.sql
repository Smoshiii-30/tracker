-- Hiwa Cut Tracker database.
-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run.
-- It is safe to run again; nothing is dropped.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  calorie_target integer not null default 2150 check (calorie_target between 1200 and 6000),
  protein_target integer not null default 150 check (protein_target between 30 and 400),
  updated_at timestamptz not null default now()
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  eaten_on date not null,
  name text not null check (char_length(name) between 1 and 120),
  calories integer not null check (calories between 0 and 10000),
  protein numeric not null default 0 check (protein >= 0),
  carbs numeric check (carbs >= 0),
  fat numeric check (fat >= 0),
  source text not null default 'manual' check (source in ('manual', 'staple', 'recent', 'photo')),
  created_at timestamptz not null default now()
);

create table if not exists public.weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_on date not null,
  kg numeric not null check (kg between 20 and 400),
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  performed_on date not null,
  day_key text not null,
  exercise text not null check (char_length(exercise) between 1 and 80),
  set_number smallint not null check (set_number between 1 and 20),
  weight_kg numeric check (weight_kg >= 0),
  reps smallint check (reps between 0 and 200),
  created_at timestamptz not null default now(),
  unique (user_id, performed_on, exercise, set_number)
);

create index if not exists meals_user_day on public.meals (user_id, eaten_on);
create index if not exists workout_sets_user_exercise on public.workout_sets (user_id, exercise, performed_on);

-- Row-level security: every signed-in person can read and write only their own rows.
alter table public.profiles enable row level security;
alter table public.meals enable row level security;
alter table public.weights enable row level security;
alter table public.workout_sets enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "own meals" on public.meals;
create policy "own meals" on public.meals
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own weights" on public.weights;
create policy "own weights" on public.weights
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own workout sets" on public.workout_sets;
create policy "own workout sets" on public.workout_sets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Newer Supabase projects do not expose new tables to the API automatically.
grant select, insert, update, delete on public.profiles, public.meals, public.weights, public.workout_sets to authenticated;
