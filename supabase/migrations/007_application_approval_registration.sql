-- Connect reviewed participation applications to the operational athlete and registration records.
alter table public.participation_applications
  add column if not exists gender text not null default 'male'
    check (gender in ('male','female','other')),
  add column if not exists athlete_id uuid references public.athletes(id) on delete set null,
  add column if not exists registration_id uuid references public.registrations(id) on delete set null;

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

  select * into v_app
  from public.participation_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Заявка не найдена' using errcode = 'P0002';
  end if;

  if p_status = 'rejected' then
    update public.participation_applications
      set status = 'rejected', reviewed_by = auth.uid(),
          reviewed_at = now(), review_note = nullif(trim(p_review_note), '')
    where id = p_application_id;
    return jsonb_build_object('status','rejected','application_id',p_application_id);
  end if;

  if v_app.athlete_id is not null and v_app.registration_id is not null then
    v_athlete_id := v_app.athlete_id;
    v_registration_id := v_app.registration_id;
  else
    if nullif(trim(v_app.club_name), '') is not null then
      select id into v_club_id
      from public.clubs
      where lower(name) = lower(trim(v_app.club_name))
      order by created_at
      limit 1;
      if v_club_id is null then
        insert into public.clubs(name) values (trim(v_app.club_name))
        returning id into v_club_id;
      end if;
    end if;

    select id into v_athlete_id
    from public.athletes
    where lower(first_name) = lower(trim(v_app.first_name))
      and lower(last_name) = lower(trim(v_app.last_name))
      and birth_date is not distinct from v_app.birth_date
      and club_id is not distinct from v_club_id
      and gender = v_app.gender
    order by created_at
    limit 1;

    if v_athlete_id is null then
      insert into public.athletes(first_name,last_name,gender,birth_date,club_id)
      values (trim(v_app.first_name),trim(v_app.last_name),v_app.gender,v_app.birth_date,v_club_id)
      returning id into v_athlete_id;
    end if;

    insert into public.registrations(tournament_id,athlete_id,hand,status)
    values (v_app.tournament_id,v_athlete_id,v_app.arm,'approved')
    on conflict (tournament_id,athlete_id,hand)
    do update set status = 'approved'
    returning id into v_registration_id;

    if v_app.body_weight is not null then
      insert into public.weigh_ins(registration_id,weight,operator_id,note)
      values (v_registration_id,v_app.body_weight,auth.uid(),'Вес из заявки; требуется подтверждение официальным взвешиванием');
    end if;
  end if;

  update public.participation_applications
    set status = 'approved', reviewed_by = auth.uid(),
        reviewed_at = now(), review_note = nullif(trim(p_review_note), ''),
        athlete_id = v_athlete_id, registration_id = v_registration_id
  where id = p_application_id;

  return jsonb_build_object(
    'status','approved',
    'application_id',p_application_id,
    'athlete_id',v_athlete_id,
    'registration_id',v_registration_id
  );
end;
$$;

revoke all on function public.review_participation_application(uuid,text,text) from public, anon;
grant execute on function public.review_participation_application(uuid,text,text) to authenticated;
