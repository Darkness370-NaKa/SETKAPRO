-- Secure Super Admin user administration.
-- Migration 001 creates profiles and gives every new account OBSERVER.

drop policy if exists "profile_select_self_or_admin" on public.profiles;
drop policy if exists "profile_update_self_or_admin" on public.profiles;
create policy "profile_select_self_or_superadmin" on public.profiles
for select to authenticated
using (id = (select auth.uid()) or public.has_any_role(array['SUPER_ADMIN']));
create policy "profile_update_self_or_superadmin" on public.profiles
for update to authenticated
using (id = (select auth.uid()) or public.has_any_role(array['SUPER_ADMIN']))
with check (id = (select auth.uid()) or public.has_any_role(array['SUPER_ADMIN']));

drop policy if exists "roles_select_self_or_admin" on public.user_roles;
drop policy if exists "roles_admin_insert" on public.user_roles;
drop policy if exists "roles_admin_update" on public.user_roles;
drop policy if exists "roles_admin_delete" on public.user_roles;
create policy "roles_select_self_or_superadmin" on public.user_roles
for select to authenticated
using (user_id = (select auth.uid()) or public.has_any_role(array['SUPER_ADMIN']));

revoke insert, update, delete on public.user_roles from authenticated;
grant select on public.user_roles to authenticated;

create or replace function public.admin_list_users()
returns table (user_id uuid, email text, full_name text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_any_role(array['SUPER_ADMIN']) then
    raise exception 'Only SUPER_ADMIN can list users';
  end if;
  return query
  select p.id, p.email, p.full_name, coalesce(r.role, 'OBSERVER'), p.created_at
  from public.profiles p
  left join lateral (
    select ur.role from public.user_roles ur where ur.user_id = p.id
    order by case ur.role
      when 'SUPER_ADMIN' then 1 when 'ADMIN' then 2 when 'ORGANIZER' then 3
      when 'SECRETARY' then 4 when 'WEIGH_IN_OPERATOR' then 5
      when 'CHIEF_JUDGE' then 6 when 'JUDGE' then 7 else 8 end
    limit 1
  ) r on true
  order by p.created_at desc;
end;
$$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_any_role(array['SUPER_ADMIN']) then
    raise exception 'Only SUPER_ADMIN can change user roles';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'You cannot change your own role';
  end if;
  if p_role not in ('ADMIN','ORGANIZER','SECRETARY','WEIGH_IN_OPERATOR','CHIEF_JUDGE','JUDGE','OBSERVER') then
    raise exception 'Invalid role. SUPER_ADMIN can only be assigned manually by the project owner.';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found';
  end if;
  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles(user_id, role, assigned_by)
  values (p_user_id, p_role, (select auth.uid()));
end;
$$;

revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_set_user_role(uuid, text) from public;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
