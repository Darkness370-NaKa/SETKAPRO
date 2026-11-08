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


-- Database-level field guard: judges may record scores, results and penalties,
-- but cannot alter bracket membership, round/order, athlete slots or match links.
create or replace function public.guard_judge_match_update()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if public.has_any_role(array['CHIEF_JUDGE','JUDGE'])
     and not public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']) then
    if (to_jsonb(new) - array[
          'score_a','score_b','winner_id','status',
          'fouls_a','fouls_b','remarks_a','remarks_b','finish_reason'
        ]) is distinct from
       (to_jsonb(old) - array[
          'score_a','score_b','winner_id','status',
          'fouls_a','fouls_b','remarks_a','remarks_b','finish_reason'
        ]) then
      raise exception 'Судья может изменять только счёт, результат и нарушения матча'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_judge_match_update on public.matches;
create trigger guard_judge_match_update
  before update on public.matches
  for each row execute function public.guard_judge_match_update();

revoke all on function public.guard_judge_match_update() from public, anon, authenticated;

-- Moving a match changes bracket structure, so it is an administrator action.
create or replace function public.move_bracket_match(
  p_match_id uuid,
  p_target_round integer,
  p_target_index integer
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_bracket_id uuid;
  v_source_round integer;
  v_target_ids uuid[];
  v_source_ids uuid[];
  v_insert_pos integer;
  v_i integer;
begin
  if auth.uid() is null
     or not public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']) then
    raise exception 'Недостаточно прав для перемещения матча'
      using errcode = '42501';
  end if;

  if p_target_round is null or p_target_round < 1
     or p_target_index is null or p_target_index < 0 then
    raise exception 'Некорректная позиция матча' using errcode = '22023';
  end if;

  select bracket_id, round_no
    into v_bracket_id, v_source_round
    from public.matches
   where id = p_match_id
   for update;

  if not found then
    raise exception 'Матч не найден' using errcode = 'P0002';
  end if;

  perform id
    from public.matches
   where bracket_id = v_bracket_id
   order by id
   for update;

  select coalesce(array_agg(id order by match_no, id), '{}'::uuid[])
    into v_target_ids
    from public.matches
   where bracket_id = v_bracket_id
     and round_no = p_target_round
     and id <> p_match_id;

  v_insert_pos := greatest(1, least(p_target_index + 1, cardinality(v_target_ids) + 1));
  v_target_ids := v_target_ids[1:v_insert_pos - 1]
                  || array[p_match_id]::uuid[]
                  || v_target_ids[v_insert_pos:cardinality(v_target_ids)];

  if v_source_round <> p_target_round then
    select coalesce(array_agg(id order by match_no, id), '{}'::uuid[])
      into v_source_ids
      from public.matches
     where bracket_id = v_bracket_id
       and round_no = v_source_round
       and id <> p_match_id;
  else
    v_source_ids := '{}'::uuid[];
  end if;

  update public.matches
     set match_no = -match_no - 1000000
   where bracket_id = v_bracket_id
     and (round_no = p_target_round or round_no = v_source_round)
     and id <> p_match_id;

  update public.matches
     set round_no = p_target_round, match_no = -2000000
   where id = p_match_id;

  for v_i in 1..cardinality(v_target_ids) loop
    update public.matches
       set round_no = p_target_round, match_no = v_i
     where id = v_target_ids[v_i];
  end loop;

  for v_i in 1..cardinality(v_source_ids) loop
    update public.matches
       set round_no = v_source_round, match_no = v_i
     where id = v_source_ids[v_i];
  end loop;
end;
$function$;

commit;
