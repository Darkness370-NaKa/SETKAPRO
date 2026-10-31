-- SECURITY DEFINER routines use fully-qualified object references; keep search_path empty.
alter function public.admin_list_users() set search_path = '';
alter function public.admin_set_user_role(uuid,text) set search_path = '';
alter function public.has_any_role(text[]) set search_path = '';
