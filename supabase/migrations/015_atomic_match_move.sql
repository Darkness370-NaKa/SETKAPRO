-- Move a match and compact both affected rounds atomically.
create or replace function public.move_bracket_match(
  p_match_id uuid,
  p_target_round integer,
  p_target_index integer
)
returns void
language plpgsql
security invoker
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
     or not public.has_any_role(array[
       'SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY',
       'WEIGH_IN_OPERATOR','CHIEF_JUDGE','JUDGE'
     ]) then
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

  -- Move affected rows to temporary negative positions before assigning final slots.
  update public.matches
     set match_no = -match_no - 1000000
   where bracket_id = v_bracket_id
     and (round_no = p_target_round or round_no = v_source_round)
     and (round_no <> v_source_round or id <> p_match_id);

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

revoke execute on function public.move_bracket_match(uuid,integer,integer) from public, anon;
grant execute on function public.move_bracket_match(uuid,integer,integer) to authenticated;
