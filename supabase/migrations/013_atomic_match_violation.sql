-- Serialize referee foul/remark updates so simultaneous judges cannot overwrite each other.
create or replace function public.record_match_violation(
  p_match_id uuid,
  p_side text,
  p_kind text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_match public.matches%rowtype;
  v_fouls integer;
  v_remarks integer;
  v_winner uuid := null;
begin
  if auth.uid() is null
     or not public.has_any_role(array[
       'SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY',
       'WEIGH_IN_OPERATOR','CHIEF_JUDGE','JUDGE'
     ]) then
    raise exception 'Недостаточно прав для записи нарушения'
      using errcode = '42501';
  end if;

  if p_side not in ('a','b') or p_kind not in ('foul','remark') then
    raise exception 'Некорректный тип нарушения или сторона'
      using errcode = '22023';
  end if;

  select * into v_match
    from public.matches
   where id = p_match_id
   for update;

  if not found then
    raise exception 'Матч не найден' using errcode = 'P0002';
  end if;
  if v_match.status = 'completed' then
    raise exception 'Матч уже завершён' using errcode = '55000';
  end if;
  if v_match.athlete_a_id is null or v_match.athlete_b_id is null then
    raise exception 'Для записи нарушения нужны оба участника'
      using errcode = '22023';
  end if;

  if p_side = 'a' then
    v_fouls := v_match.fouls_a;
    v_remarks := v_match.remarks_a;
  else
    v_fouls := v_match.fouls_b;
    v_remarks := v_match.remarks_b;
  end if;

  if p_kind = 'foul' then
    v_fouls := v_fouls + 1;
    v_remarks := 0;
  else
    v_remarks := v_remarks + 1;
    if v_remarks >= 2 then
      v_remarks := 0;
      v_fouls := v_fouls + 1;
    end if;
  end if;

  if v_fouls >= 2 then
    v_winner := case when p_side = 'a'
      then v_match.athlete_b_id else v_match.athlete_a_id end;
  end if;

  if p_side = 'a' then
    update public.matches
       set fouls_a = v_fouls,
           remarks_a = v_remarks,
           winner_id = coalesce(v_winner, winner_id),
           status = case when v_winner is not null then 'completed' else status end,
           finish_reason = case when v_winner is not null then 'fouls' else finish_reason end,
           score_a = case when v_winner is not null then null else score_a end,
           score_b = case when v_winner is not null then null else score_b end
     where id = p_match_id;
  else
    update public.matches
       set fouls_b = v_fouls,
           remarks_b = v_remarks,
           winner_id = coalesce(v_winner, winner_id),
           status = case when v_winner is not null then 'completed' else status end,
           finish_reason = case when v_winner is not null then 'fouls' else finish_reason end,
           score_a = case when v_winner is not null then null else score_a end,
           score_b = case when v_winner is not null then null else score_b end
     where id = p_match_id;
  end if;

  return jsonb_build_object(
    'match_id', p_match_id, 'side', p_side, 'kind', p_kind,
    'fouls', v_fouls, 'remarks', v_remarks,
    'winner_id', v_winner, 'completed', v_winner is not null
  );
end;
$function$;

revoke execute on function public.record_match_violation(uuid,text,text) from public, anon;
grant execute on function public.record_match_violation(uuid,text,text) to authenticated;
