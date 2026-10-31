-- SETKA PRO expansion: tournament operations and bracket manager data.
-- Run after 001_initial_schema.sql in Supabase SQL Editor.
-- All operational data is shared in Supabase; no localStorage-only records.

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  city text,
  federation text,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists clubs_name_city_unique
  on public.clubs (lower(name), lower(coalesce(city, '')));

create table if not exists public.athletes (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  birth_date date,
  gender text check (gender in ('male','female','other')),
  country text,
  city text,
  club_id uuid references public.clubs(id) on delete set null,
  weight numeric(6,2) check (weight is null or weight between 20 and 300),
  hand text not null default 'right' check (hand in ('left','right','both')),
  external_id text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists athletes_name_idx on public.athletes (lower(last_name), lower(first_name));
create index if not exists athletes_club_idx on public.athletes (club_id);

create table if not exists public.tournament_categories (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  gender text check (gender in ('male','female','mixed','other')),
  weight_min numeric(6,2),
  weight_max numeric(6,2),
  hand text not null default 'right' check (hand in ('left','right','both')),
  format text not null default 'single-elim'
    check (format in ('single-elim','double-elim','round-robin','groups-playoff')),
  settings jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (weight_min is null or weight_max is null or weight_min <= weight_max)
);
create index if not exists tournament_categories_tournament_idx
  on public.tournament_categories (tournament_id, sort_order);

create table if not exists public.category_athletes (
  category_id uuid not null references public.tournament_categories(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  seed integer,
  registration_status text not null default 'registered'
    check (registration_status in ('registered','checked_in','withdrawn','disqualified')),
  created_at timestamptz not null default now(),
  primary key (category_id, athlete_id)
);

create table if not exists public.brackets (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  category_id uuid references public.tournament_categories(id) on delete set null,
  name text not null,
  format text not null check (format in ('single-elim','double-elim','round-robin','groups-playoff')),
  status text not null default 'draft'
    check (status in ('draft','in_progress','completed','archived')),
  config jsonb not null default '{}'::jsonb,
  round_labels jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brackets_tournament_idx on public.brackets (tournament_id);
create index if not exists brackets_category_idx on public.brackets (category_id);

create table if not exists public.bracket_matches (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.brackets(id) on delete cascade,
  round_index integer not null default 0,
  position integer not null default 0,
  label text,
  side text not null default 'winners' check (side in ('winners','losers','groups','final')),
  athlete_a_id uuid references public.athletes(id) on delete set null,
  athlete_b_id uuid references public.athletes(id) on delete set null,
  score_a integer not null default 0 check (score_a >= 0),
  score_b integer not null default 0 check (score_b >= 0),
  winner_id uuid references public.athletes(id) on delete set null,
  loser_id uuid references public.athletes(id) on delete set null,
  status text not null default 'scheduled'
    check (status in ('empty','scheduled','ready','in_progress','completed','walkover','cancelled')),
  next_match_id uuid references public.bracket_matches(id) on delete set null,
  loser_next_match_id uuid references public.bracket_matches(id) on delete set null,
  canvas_x numeric not null default 60,
  canvas_y numeric not null default 60,
  table_number text,
  scheduled_at timestamptz,
  referee_user_id uuid references auth.users(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bracket_id, round_index, position, side)
);
create index if not exists bracket_matches_bracket_idx
  on public.bracket_matches (bracket_id, round_index, position);
create index if not exists bracket_matches_referee_idx
  on public.bracket_matches (referee_user_id);

create table if not exists public.bracket_history (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.brackets(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  details text,
  snapshot jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bracket_history_bracket_idx
  on public.bracket_history (bracket_id, created_at desc);

create table if not exists public.bracket_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  format text not null check (format in ('single-elim','double-elim','round-robin','groups-playoff')),
  config jsonb not null default '{}'::jsonb,
  owner_id uuid references auth.users(id) on delete set null,
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_weigh_ins (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  category_id uuid references public.tournament_categories(id) on delete set null,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  measured_weight numeric(6,2) not null check (measured_weight between 20 and 300),
  measured_at timestamptz not null default now(),
  measured_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','passed','overweight','underweight','recheck')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists tournament_weigh_ins_event_idx
  on public.tournament_weigh_ins (tournament_id, category_id, measured_at desc);

create table if not exists public.tournament_judges (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  assignment text not null default 'judge'
    check (assignment in ('chief_judge','judge','table_referee','secretary')),
  table_number text,
  category_id uuid references public.tournament_categories(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tournament_judges_event_idx on public.tournament_judges (tournament_id);

create table if not exists public.tournament_documents (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  title text not null,
  document_type text not null default 'other',
  storage_path text not null,
  content_type text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_team_scores (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  club_name text not null,
  points numeric(10,2) not null default 0,
  place integer,
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (tournament_id, club_name)
);

create table if not exists public.tournament_trash (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid,
  deleted_by uuid references auth.users(id) on delete set null,
  payload jsonb not null,
  deleted_at timestamptz not null default now()
);

-- Keep updated_at consistent on editable entities.
do $$
declare t text;
begin
  foreach t in array array['clubs','athletes','tournament_categories','brackets','bracket_matches','tournament_team_scores'] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute procedure public.set_updated_at()', t, t);
  end loop;
end $$;

-- Enable RLS on every new table.
alter table public.clubs enable row level security;
alter table public.athletes enable row level security;
alter table public.tournament_categories enable row level security;
alter table public.category_athletes enable row level security;
alter table public.brackets enable row level security;
alter table public.bracket_matches enable row level security;
alter table public.bracket_history enable row level security;
alter table public.bracket_templates enable row level security;
alter table public.tournament_weigh_ins enable row level security;
alter table public.tournament_judges enable row level security;
alter table public.tournament_documents enable row level security;
alter table public.tournament_team_scores enable row level security;
alter table public.tournament_trash enable row level security;

-- Read access for signed-in users; write access only for staff.
create policy "clubs_read_authenticated" on public.clubs for select to authenticated using (true);
create policy "clubs_manage_staff" on public.clubs for all to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

create policy "athletes_read_authenticated" on public.athletes for select to authenticated using (true);
create policy "athletes_manage_staff" on public.athletes for all to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

create policy "categories_read_authenticated" on public.tournament_categories for select to authenticated using (true);
create policy "categories_manage_staff" on public.tournament_categories for all to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

create policy "category_athletes_read_authenticated" on public.category_athletes for select to authenticated using (true);
create policy "category_athletes_manage_staff" on public.category_athletes for all to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

create policy "brackets_read_authenticated" on public.brackets for select to authenticated using (true);
create policy "brackets_manage_staff" on public.brackets for all to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','CHIEF_JUDGE']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','CHIEF_JUDGE']));

create policy "matches_read_authenticated" on public.bracket_matches for select to authenticated using (true);
create policy "matches_manage_staff" on public.bracket_matches for all to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','CHIEF_JUDGE','JUDGE']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','CHIEF_JUDGE','JUDGE']));

create policy "history_read_staff" on public.bracket_history for select to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','CHIEF_JUDGE']));
create policy "history_insert_staff" on public.bracket_history for insert to authenticated
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','CHIEF_JUDGE','JUDGE']));

create policy "templates_read_owner_or_shared" on public.bracket_templates for select to authenticated
  using (owner_id = (select auth.uid()) or is_shared or public.has_any_role(array['SUPER_ADMIN','ADMIN']));
create policy "templates_manage_owner_or_admin" on public.bracket_templates for all to authenticated
  using (owner_id = (select auth.uid()) or public.has_any_role(array['SUPER_ADMIN','ADMIN']))
  with check (owner_id = (select auth.uid()) or public.has_any_role(array['SUPER_ADMIN','ADMIN']));

create policy "weigh_ins_read_staff" on public.tournament_weigh_ins for select to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','WEIGH_IN_OPERATOR','CHIEF_JUDGE']));
create policy "weigh_ins_manage_staff" on public.tournament_weigh_ins for all to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','WEIGH_IN_OPERATOR']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','WEIGH_IN_OPERATOR']));

create policy "judges_read_staff" on public.tournament_judges for select to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','CHIEF_JUDGE','JUDGE']));
create policy "judges_manage_admin" on public.tournament_judges for all to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','CHIEF_JUDGE']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','CHIEF_JUDGE']));

create policy "documents_read_staff" on public.tournament_documents for select to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','CHIEF_JUDGE']));
create policy "documents_manage_staff" on public.tournament_documents for all to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

create policy "team_scores_read_authenticated" on public.tournament_team_scores for select to authenticated using (true);
create policy "team_scores_manage_staff" on public.tournament_team_scores for all to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

create policy "trash_manage_admin" on public.tournament_trash for all to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN']));

grant select, insert, update, delete on public.clubs to authenticated;
grant select, insert, update, delete on public.athletes to authenticated;
grant select, insert, update, delete on public.tournament_categories to authenticated;
grant select, insert, update, delete on public.category_athletes to authenticated;
grant select, insert, update, delete on public.brackets to authenticated;
grant select, insert, update, delete on public.bracket_matches to authenticated;
grant select, insert on public.bracket_history to authenticated;
grant select, insert, update, delete on public.bracket_templates to authenticated;
grant select, insert, update, delete on public.tournament_weigh_ins to authenticated;
grant select, insert, update, delete on public.tournament_judges to authenticated;
grant select, insert, update, delete on public.tournament_documents to authenticated;
grant select, insert, update, delete on public.tournament_team_scores to authenticated;
grant select, insert, update, delete on public.tournament_trash to authenticated;

-- Public read-only tournament catalogue remains governed by the policies in 001.
