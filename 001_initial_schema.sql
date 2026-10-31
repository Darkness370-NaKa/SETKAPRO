-- SETKA PRO: initial schema + role-based access control.
-- Run in Supabase SQL Editor as the project owner before enabling sign-ups.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in (
    'SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY',
    'WEIGH_IN_OPERATOR','CHIEF_JUDGE','JUDGE','OBSERVER'
  )),
  assigned_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','published','registration_closed','completed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.participation_applications (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  birth_date date,
  club_name text,
  body_weight numeric(5,2) check (body_weight is null or body_weight between 20 and 250),
  arm text not null default 'right' check (arm in ('left','right','both')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists applications_user_idx on public.participation_applications(user_id, created_at desc);
create index if not exists applications_tournament_idx on public.participation_applications(tournament_id, status);
create index if not exists tournaments_status_start_idx on public.tournaments(status, starts_at);

-- Security-definer helper: role checks do not depend on caller's RLS visibility.
create or replace function public.has_any_role(required_roles text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = any(required_roles)
  );
$$;

revoke all on function public.has_any_role(text[]) from public;
grant execute on function public.has_any_role(text[]) to authenticated;

-- Every new account receives OBSERVER. The client cannot choose a role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do update set email = excluded.email;

  insert into public.user_roles (user_id, role)
  values (new.id, 'OBSERVER')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_setka on auth.users;
create trigger on_auth_user_created_setka
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- updated_at utility
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists tournaments_updated_at on public.tournaments;
create trigger tournaments_updated_at before update on public.tournaments
for each row execute procedure public.set_updated_at();

drop trigger if exists applications_updated_at on public.participation_applications;
create trigger applications_updated_at before update on public.participation_applications
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.tournaments enable row level security;
alter table public.participation_applications enable row level security;

-- Profiles: users see/edit only their own basic profile; admins can view all.
drop policy if exists "profile_select_self_or_admin" on public.profiles;
create policy "profile_select_self_or_admin" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or public.has_any_role(array['SUPER_ADMIN','ADMIN']));

drop policy if exists "profile_update_self_or_admin" on public.profiles;
create policy "profile_update_self_or_admin" on public.profiles
for update to authenticated
using (id = (select auth.uid()) or public.has_any_role(array['SUPER_ADMIN','ADMIN']))
with check (id = (select auth.uid()) or public.has_any_role(array['SUPER_ADMIN','ADMIN']));

-- Role assignments: users can read their own roles; admins can read/manage all roles.
drop policy if exists "roles_select_self_or_admin" on public.user_roles;
create policy "roles_select_self_or_admin" on public.user_roles
for select to authenticated
using (user_id = (select auth.uid()) or public.has_any_role(array['SUPER_ADMIN','ADMIN']));

drop policy if exists "roles_admin_insert" on public.user_roles;
create policy "roles_admin_insert" on public.user_roles
for insert to authenticated
with check (public.has_any_role(array['SUPER_ADMIN','ADMIN']));

drop policy if exists "roles_admin_update" on public.user_roles;
create policy "roles_admin_update" on public.user_roles
for update to authenticated
using (public.has_any_role(array['SUPER_ADMIN','ADMIN']))
with check (public.has_any_role(array['SUPER_ADMIN','ADMIN']));

drop policy if exists "roles_admin_delete" on public.user_roles;
create policy "roles_admin_delete" on public.user_roles
for delete to authenticated
using (public.has_any_role(array['SUPER_ADMIN','ADMIN']));

-- Public tournament catalogue only shows published/registration-closed events.
drop policy if exists "tournaments_public_read" on public.tournaments;
create policy "tournaments_public_read" on public.tournaments
for select to anon, authenticated
using (
  status in ('published','registration_closed')
  or public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY'])
);

drop policy if exists "tournaments_staff_insert" on public.tournaments;
create policy "tournaments_staff_insert" on public.tournaments
for insert to authenticated
with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER']));

drop policy if exists "tournaments_staff_update" on public.tournaments;
create policy "tournaments_staff_update" on public.tournaments
for update to authenticated
using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER']))
with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER']));

drop policy if exists "tournaments_admin_delete" on public.tournaments;
create policy "tournaments_admin_delete" on public.tournaments
for delete to authenticated
using (public.has_any_role(array['SUPER_ADMIN','ADMIN']));


-- Prevent applicants from forging review metadata or changing application status.
create or replace function public.guard_application_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is not null
     and not public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']) then
    if old.user_id <> (select auth.uid()) then
      raise exception 'You may update only your own application';
    end if;
    if old.status <> 'pending' or new.status <> old.status then
      raise exception 'Only pending applications can be edited by applicants';
    end if;
    if new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.review_note is distinct from old.review_note then
      raise exception 'Applicants cannot change review fields';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_application_update_trigger on public.participation_applications;
create trigger guard_application_update_trigger
before update on public.participation_applications
for each row execute procedure public.guard_application_update();

-- Applications: observer inserts only as self and only for published tournaments.
drop policy if exists "applications_insert_own_pending" on public.participation_applications;
create policy "applications_insert_own_pending" on public.participation_applications
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1 from public.tournaments t
    where t.id = tournament_id and t.status = 'published'
  )
);

-- Applicants see only their own records. Authorized staff can see all applications.
drop policy if exists "applications_select_own_or_staff" on public.participation_applications;
create policy "applications_select_own_or_staff" on public.participation_applications
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY'])
);

-- Applicant may edit own pending application but cannot change status/ownership via column-level grants.
-- Restrict table-level update; grant only safe columns to authenticated. Staff uses separate policy.
revoke update on public.participation_applications from authenticated;
grant update (first_name,last_name,birth_date,club_name,body_weight,arm) on public.participation_applications to authenticated;
grant update (status,reviewed_by,reviewed_at,review_note) on public.participation_applications to authenticated;

drop policy if exists "applications_update_own_pending_fields" on public.participation_applications;
create policy "applications_update_own_pending_fields" on public.participation_applications
for update to authenticated
using (user_id = (select auth.uid()) and status = 'pending')
with check (user_id = (select auth.uid()) and status = 'pending');

drop policy if exists "applications_update_staff_review" on public.participation_applications;
create policy "applications_update_staff_review" on public.participation_applications
for update to authenticated
using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']))
with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

drop policy if exists "applications_delete_own_pending_or_admin" on public.participation_applications;
create policy "applications_delete_own_pending_or_admin" on public.participation_applications
for delete to authenticated
using (
  (user_id = (select auth.uid()) and status = 'pending')
  or public.has_any_role(array['SUPER_ADMIN','ADMIN'])
);

-- Grants for browser client. RLS remains the authorization boundary.
grant usage on schema public to anon, authenticated;
grant select on public.tournaments to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
grant select, insert, update, delete on public.participation_applications to authenticated;

-- IMPORTANT: Bootstrap the first administrator manually in SQL Editor after signup:
-- 1) Register your own account in the app and confirm email.
-- 2) Find your UUID: select id,email from auth.users where email = 'YOUR_EMAIL';
-- 3) Run (replace UUID):
--    insert into public.user_roles(user_id, role) values ('YOUR-USER-UUID','SUPER_ADMIN')
--    on conflict (user_id, role) do nothing;
-- Never expose service_role key in frontend code.
