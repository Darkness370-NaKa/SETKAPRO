-- Audit history for every match change, including score, winner and foul updates.
create table if not exists public.match_change_log (
 id uuid primary key default gen_random_uuid(),
 match_id uuid,
 bracket_id uuid,
 changed_by uuid references auth.users(id) on delete set null,
 action text not null,
 old_data jsonb,
 new_data jsonb,
 changed_at timestamptz not null default now()
);
create index if not exists match_change_log_match_changed_idx on public.match_change_log(match_id, changed_at desc);
create index if not exists match_change_log_bracket_changed_idx on public.match_change_log(bracket_id, changed_at desc);
alter table public.match_change_log enable row level security;
drop policy if exists "match_change_log_select_staff" on public.match_change_log;
create policy "match_change_log_select_staff" on public.match_change_log
 for select to authenticated
 using (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','CHIEF_JUDGE','JUDGE']));
drop policy if exists "match_change_log_insert_staff" on public.match_change_log;
create policy "match_change_log_insert_staff" on public.match_change_log
 for insert to authenticated
 with check (public.has_any_role(array['SUPER_ADMIN','ADMIN','ORGANIZER','SECRETARY','CHIEF_JUDGE','JUDGE']));
create or replace function public.log_match_change()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
 if tg_op = 'INSERT' then
  insert into public.match_change_log(match_id,bracket_id,changed_by,action,new_data)
  values(new.id,new.bracket_id,auth.uid(),'INSERT',to_jsonb(new));
  return new;
 elsif tg_op = 'UPDATE' then
  if to_jsonb(old) is distinct from to_jsonb(new) then
   insert into public.match_change_log(match_id,bracket_id,changed_by,action,old_data,new_data)
   values(new.id,new.bracket_id,auth.uid(),'UPDATE',to_jsonb(old),to_jsonb(new));
  end if;
  return new;
 else
  insert into public.match_change_log(match_id,bracket_id,changed_by,action,old_data)
  values(old.id,old.bracket_id,auth.uid(),'DELETE',to_jsonb(old));
  return old;
 end if;
end;
$$;
drop trigger if exists matches_change_log on public.matches;
create trigger matches_change_log after insert or update or delete on public.matches
for each row execute function public.log_match_change();
