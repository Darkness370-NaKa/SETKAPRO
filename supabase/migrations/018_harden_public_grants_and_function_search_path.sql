-- Tighten exposed-schema grants without changing the application's row-level access model.
-- RLS remains responsible for row authorization; this removes unnecessary table privileges.

-- Anonymous access is intentionally limited to published tournament discovery.
revoke all privileges on all tables in schema public from anon;
grant select on table public.tournaments to anon;

-- TRUNCATE, REFERENCES and TRIGGER are not needed by the browser client and are
-- not governed by row-level security in the same way as ordinary DML.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Role lookup is intentionally SECURITY DEFINER because user_roles is protected by RLS.
-- Keep it callable by authenticated sessions (RLS policies depend on it), never anon/PUBLIC.
revoke all on function public.has_any_role(text[]) from public, anon;
grant execute on function public.has_any_role(text[]) to authenticated;

-- These RPCs are intentionally privileged but enforce SUPER_ADMIN inside the function.
-- Remove inherited PUBLIC/anonymous execution and grant only signed-in execution.
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

-- Trigger-only functions must not be exposed as callable API functions.
revoke all on function public.guard_application_update() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.log_match_change() from public, anon, authenticated;

-- All objects referenced by these trigger functions are schema-qualified.
-- An empty search_path prevents object-shadowing attacks.
create or replace function public.guard_application_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

revoke all on function public.guard_application_update() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.log_match_change() from public, anon, authenticated;
