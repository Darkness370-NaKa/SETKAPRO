-- Enforce match-result invariants in the database, not only in the browser.
-- Existing production rows were checked before rollout; this migration does not rewrite data.

create or replace function public.validate_match_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.athlete_a_id is not null
     and new.athlete_a_id = new.athlete_b_id then
    raise exception 'Один спортсмен не может занимать оба места в матче'
      using errcode = '23514';
  end if;

  if new.score_a is not null and new.score_a < 0
     or new.score_b is not null and new.score_b < 0 then
    raise exception 'Счёт матча не может быть отрицательным'
      using errcode = '23514';
  end if;

  if new.winner_id is not null
     and new.winner_id is distinct from new.athlete_a_id
     and new.winner_id is distinct from new.athlete_b_id then
    raise exception 'Победитель должен быть одним из участников матча'
      using errcode = '23514';
  end if;

  if new.status = 'completed' then
    if new.athlete_a_id is null or new.athlete_b_id is null then
      raise exception 'Для завершения матча необходимы оба участника'
        using errcode = '23514';
    end if;

    if new.winner_id is null then
      raise exception 'Для завершённого матча необходимо указать победителя'
        using errcode = '23514';
    end if;

    if new.finish_reason is distinct from 'fouls' then
      if new.score_a is null or new.score_b is null then
        raise exception 'Для результата по счёту необходимо указать оба значения'
          using errcode = '23514';
      end if;

      if new.score_a = new.score_b then
        raise exception 'Ничья не может завершить матч на выбывание'
          using errcode = '23514';
      end if;

      if (new.winner_id = new.athlete_a_id and new.score_a <= new.score_b)
         or (new.winner_id = new.athlete_b_id and new.score_b <= new.score_a) then
        raise exception 'Победитель не соответствует счёту матча'
          using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists matches_validate_integrity on public.matches;
create trigger matches_validate_integrity
before insert or update on public.matches
for each row execute function public.validate_match_integrity();

revoke all on function public.validate_match_integrity() from public, anon, authenticated;
