-- SETKAPRO: least-privilege operational access.
-- This migration intentionally replaces the broad policies from 004.
-- It does not alter application data or table structure.

begin;

-- Remove the existing per-table policies so permissive policies cannot OR
-- together and silently preserve broader access.
drop policy if exists clubs_read_authenticated on public.clubs;
drop policy if exists clubs_staff_insert on public.clubs;
drop policy if exists clubs_staff_update on public.clubs;
drop policy if exists clubs_staff_delete on public.clubs;

drop policy if exists athletes_read_authenticated on public.athletes;
drop policy if exists athletes_staff_insert on public.athletes;
drop policy if exists athletes_staff_update on public.athletes;
drop policy if exists athletes_staff_delete on public.athletes;

drop policy if exists registrations_read_authenticated on public.registrations;
drop policy if exists registrations_staff_insert on public.registrations;
drop policy if exists registrations_staff_update on public.registrations;
drop policy if exists registrations_staff_delete on public.registrations;

drop policy if exists weigh_ins_read_authenticated on public.weigh_ins;
drop policy if exists weigh_ins_staff_insert on public.weigh_ins;
drop policy if exists weigh_ins_staff_update on public.weigh_ins;
drop policy if exists weigh_ins_staff_delete on public.weigh_ins;

drop policy if exists tournament_categories_read_authenticated on public.tournament_categories;
drop policy if exists tournament_categories_staff_insert on public.tournament_categories;
drop policy if exists tournament_categories_staff_update on public.tournament_categories;
drop policy if exists tournament_categories_staff_delete on public.tournament_categories;

drop policy if exists brackets_read_authenticated on public.brackets;
drop policy if exists brackets_staff_insert on public.brackets;
drop policy if exists brackets_staff_update on public.brackets;
drop policy if exists brackets_staff_delete on public.brackets;

drop policy if exists matches_read_authenticated on public.matches;
drop policy if exists matches_staff_insert on public.matches;
drop policy if exists matches_staff_update on public.matches;
drop policy if exists matches_staff_delete on public.matches;

-- Read access remains available to authenticated users, including OBSERVER.
create policy clubs_read_authenticated on public.clubs
  for select to authenticated using (true);
create policy athletes_read_authenticated on public.athletes
  for select to authenticated using (true);
create policy registrations_read_authenticated on public.registrations
  for select to authenticated using (true);
create policy weigh_ins_read_authenticated on public.weigh_ins
  for select to authenticated using (true);
create policy tournament_categories_read_authenticated on public.tournament_categories
  for select to authenticated using (true);
create policy brackets_read_authenticated on public.brackets
  for select to authenticated using (true);
create policy matches_read_authenticated on public.matches
  for select to authenticated using (true);

-- Competition administration: SUPER_ADMIN, ADMIN, ORGANIZER, SECRETARY.
create policy clubs_admin_insert on public.clubs
  for insert to authenticated
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));
create policy clubs_admin_update on public.clubs
  for update to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));
create policy clubs_admin_delete on public.clubs
  for delete to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

create policy athletes_admin_insert on public.athletes
  for insert to authenticated
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));
create policy athletes_admin_update on public.athletes
  for update to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));
create policy athletes_admin_delete on public.athletes
  for delete to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

create policy registrations_admin_insert on public.registrations
  for insert to authenticated
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));
create policy registrations_admin_update on public.registrations
  for update to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));
create policy registrations_admin_delete on public.registrations
  for delete to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

create policy categories_admin_insert on public.tournament_categories
  for insert to authenticated
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));
create policy categories_admin_update on public.tournament_categories
  for update to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));
create policy categories_admin_delete on public.tournament_categories
  for delete to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

create policy brackets_admin_insert on public.brackets
  for insert to authenticated
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));
create policy brackets_admin_update on public.brackets
  for update to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));
create policy brackets_admin_delete on public.brackets
  for delete to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

-- Weigh-in operators may record and correct weigh-ins, but cannot administer
-- athletes, clubs, registrations, categories, or bracket structure.
create policy weigh_ins_staff_insert on public.weigh_ins
  for insert to authenticated
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','WEIGH_IN_OPERATOR']));
create policy weigh_ins_staff_update on public.weigh_ins
  for update to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','WEIGH_IN_OPERATOR']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','WEIGH_IN_OPERATOR']));
create policy weigh_ins_admin_delete on public.weigh_ins
  for delete to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

-- Judges can update match operations/results only. Creating, deleting, or
-- restructuring brackets and matches remains an administrator task.
create policy matches_admin_insert on public.matches
  for insert to authenticated
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));
create policy matches_judges_update on public.matches
  for update to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','CHIEF_JUDGE','JUDGE']))
  with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','CHIEF_JUDGE','JUDGE']));
create policy matches_admin_delete on public.matches
  for delete to authenticated
  using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']));

commit;
