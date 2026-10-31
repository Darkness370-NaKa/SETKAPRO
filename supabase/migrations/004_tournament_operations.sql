-- SETKA PRO: tournament operations modules
create table if not exists public.clubs (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 city text,
 country text,
 created_at timestamptz not null default now()
);
create table if not exists public.athletes (
 id uuid primary key default gen_random_uuid(),
 first_name text not null,
 last_name text not null,
 gender text not null default 'male' check (gender in ('male','female','other')),
 birth_date date,
 club_id uuid references public.clubs(id) on delete set null,
 city text,
 country text,
 created_at timestamptz not null default now()
);
create table if not exists public.registrations (
 id uuid primary key default gen_random_uuid(),
 tournament_id uuid not null references public.tournaments(id) on delete cascade,
 athlete_id uuid not null references public.athletes(id) on delete cascade,
 hand text not null default 'right' check (hand in ('left','right','both')),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 unique(tournament_id,athlete_id,hand)
);
create table if not exists public.weigh_ins (
 id uuid primary key default gen_random_uuid(),
 registration_id uuid not null references public.registrations(id) on delete cascade,
 weight numeric(5,2) not null check(weight between 20 and 250),
 operator_id uuid references auth.users(id),
 measured_at timestamptz not null default now(),
 note text
);
create table if not exists public.tournament_categories (
 id uuid primary key default gen_random_uuid(),
 tournament_id uuid not null references public.tournaments(id) on delete cascade,
 name text not null,
 gender text not null default 'male' check(gender in ('male','female','other')),
 min_weight numeric(5,2),
 max_weight numeric(5,2),
 hand text not null default 'right' check(hand in ('left','right','both')),
 format text not null default 'single' check(format in ('single','double','rr')),
 created_at timestamptz not null default now(),
 check(min_weight is null or max_weight is null or min_weight <= max_weight)
);
create table if not exists public.brackets (
 id uuid primary key default gen_random_uuid(),
 category_id uuid not null references public.tournament_categories(id) on delete cascade,
 name text not null,
 format text not null default 'single',
 created_at timestamptz not null default now()
);
create table if not exists public.matches (
 id uuid primary key default gen_random_uuid(),
 bracket_id uuid not null references public.brackets(id) on delete cascade,
 round_no integer not null default 1,
 match_no integer not null default 1,
 athlete_a_id uuid references public.athletes(id) on delete set null,
 athlete_b_id uuid references public.athletes(id) on delete set null,
 score_a integer,
 score_b integer,
 winner_id uuid references public.athletes(id) on delete set null,
 status text not null default 'pending' check(status in ('pending','completed','bye')),
 created_at timestamptz not null default now()
);
create index if not exists registrations_tournament_idx on public.registrations(tournament_id,status);
create index if not exists weighins_registration_idx on public.weigh_ins(registration_id,measured_at desc);
create index if not exists categories_tournament_idx on public.tournament_categories(tournament_id);
create index if not exists matches_bracket_idx on public.matches(bracket_id,round_no,match_no);
alter table public.clubs enable row level security;
alter table public.athletes enable row level security;
alter table public.registrations enable row level security;
alter table public.weigh_ins enable row level security;
alter table public.tournament_categories enable row level security;
alter table public.brackets enable row level security;
alter table public.matches enable row level security;
do $$
declare t text;
begin
 foreach t in array array['clubs','athletes','registrations','weigh_ins','tournament_categories','brackets','matches'] loop
  execute format('drop policy if exists %I on public.%I',t||'_read_authenticated',t);
  execute format('create policy %I on public.%I for select to authenticated using (true)',t||'_read_authenticated',t);
  execute format('drop policy if exists %I on public.%I',t||'_staff_insert',t);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.has_any_role(array[''SUPER_ADMIN'',''ADMIN'',''ORGANIZER'',''SECRETARY'',''WEIGH_IN_OPERATOR'',''CHIEF_JUDGE'',''JUDGE'']))',t||'_staff_insert',t);
  execute format('drop policy if exists %I on public.%I',t||'_staff_update',t);
  execute format('create policy %I on public.%I for update to authenticated using (public.has_any_role(array[''SUPER_ADMIN'',''ADMIN'',''ORGANIZER'',''SECRETARY'',''WEIGH_IN_OPERATOR'',''CHIEF_JUDGE'',''JUDGE''])) with check (public.has_any_role(array[''SUPER_ADMIN'',''ADMIN'',''ORGANIZER'',''SECRETARY'',''WEIGH_IN_OPERATOR'',''CHIEF_JUDGE'',''JUDGE'']))',t||'_staff_update',t);
  execute format('drop policy if exists %I on public.%I',t||'_staff_delete',t);
  execute format('create policy %I on public.%I for delete to authenticated using (public.has_any_role(array[''SUPER_ADMIN'',''ADMIN'',''ORGANIZER'',''SECRETARY'']))',t||'_staff_delete',t);
 end loop;
end $$;
grant select,insert,update,delete on public.clubs,public.athletes,public.registrations,public.weigh_ins,public.tournament_categories,public.brackets,public.matches to authenticated;
