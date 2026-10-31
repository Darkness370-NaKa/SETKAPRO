-- The applicant's declared weight is not an official weigh-in.
-- Keep it on the application; category eligibility uses weigh_ins recorded by staff.
create or replace function public.review_participation_application(
  p_application_id uuid,
  p_status text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_app public.participation_applications%rowtype;
  v_club_id uuid;
  v_athlete_id uuid;
  v_registration_id uuid;
begin
  if auth.uid() is null or not public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY']) then
    raise exception 'Недостаточно прав для рассмотрения заявки' using errcode = '42501';
  end if;
  if p_status not in ('approved','rejected') then
    raise exception 'Недопустимый статус заявки' using errcode = '22023';
  end if;

  select * into v_app from public.participation_applications where id = p_application_id for update;
  if not found then raise exception 'Заявка не найдена' using errcode = 'P0002'; end if;

  if p_status = 'rejected' then
    update public.participation_applications
      set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
          review_note = nullif(trim(p_review_note), '')
    where id = p_application_id;
    return jsonb_build_object('status','rejected','application_id',p_application_id);
  end if;

  if v_app.athlete_id is not null and v_app.registration_id is not null then
    v_athlete_id := v_app.athlete_id;
    v_registration_id := v_app.registration_id;
  else
    if nullif(trim(v_app.club_name), '') is not null then
      select id into v_club_id from public.clubs
      where lower(name) = lower(trim(v_app.club_name)) order by created_at limit 1;
      if v_club_id is null then
        insert into public.clubs(name) values (trim(v_app.club_name)) returning id into v_club_id;
      end if;
    end if;

    select id into v_athlete_id from public.athletes
    where lower(first_name) = lower(trim(v_app.first_name))
      and lower(last_name) = lower(trim(v_app.last_name))
      and birth_date is not distinct from v_app.birth_date
      and club_id is not distinct from v_club_id
      and gender = v_app.gender
    order by created_at limit 1;

    if v_athlete_id is null then
      insert into public.athletes(first_name,last_name,gender,birth_date,club_id)
      values (trim(v_app.first_name),trim(v_app.last_name),v_app.gender,v_app.birth_date,v_club_id)
      returning id into v_athlete_id;
    end if;

    insert into public.registrations(tournament_id,athlete_id,hand,status)
    values (v_app.tournament_id,v_athlete_id,v_app.arm,'approved')
    on conflict (tournament_id,athlete_id,hand) do update set status = 'approved'
    returning id into v_registration_id;
  end if;

  update public.participation_applications
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
        review_note = nullif(trim(p_review_note), ''),
        athlete_id = v_athlete_id, registration_id = v_registration_id
  where id = p_application_id;

  return jsonb_build_object('status','approved','application_id',p_application_id,
    'athlete_id',v_athlete_id,'registration_id',v_registration_id);
end;
$$;

-- Cover foreign keys used for joins, cascades and administrative lookups.
create index if not exists athletes_club_id_idx on public.athletes(club_id);
create index if not exists brackets_category_id_idx on public.brackets(category_id);
create index if not exists matches_athlete_a_id_idx on public.matches(athlete_a_id);
create index if not exists matches_athlete_b_id_idx on public.matches(athlete_b_id);
create index if not exists matches_winner_id_idx on public.matches(winner_id);
create index if not exists participation_applications_athlete_id_idx on public.participation_applications(athlete_id);
create index if not exists participation_applications_registration_id_idx on public.participation_applications(registration_id);
create index if not exists participation_applications_reviewed_by_idx on public.participation_applications(reviewed_by);
create index if not exists registrations_athlete_id_idx on public.registrations(athlete_id);
create index if not exists tournaments_created_by_idx on public.tournaments(created_by);
create index if not exists user_roles_assigned_by_idx on public.user_roles(assigned_by);
create index if not exists weigh_ins_operator_id_idx on public.weigh_ins(operator_id);

-- Keep the same authorization semantics while avoiding two permissive UPDATE policies.
drop policy if exists applications_update_own_pending_fields on public.participation_applications;
drop policy if exists applications_update_staff_review on public.participation_applications;
create policy applications_update_own_or_staff on public.participation_applications
for update to authenticated
using (
  (user_id = (select auth.uid()) and status = 'pending')
  or public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY'])
)
with check (
  (user_id = (select auth.uid()) and status = 'pending')
  or public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY'])
);
