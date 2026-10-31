-- SETKA PRO: harden public function execution privileges.
-- Trigger functions execute through their attached triggers; API roles do not
-- need direct EXECUTE privileges on these trigger entry points.

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_application_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_any_role(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- These three functions are intentionally callable by signed-in clients:
-- admin functions perform an explicit SUPER_ADMIN check; has_any_role only
-- evaluates the caller's own auth.uid() against the requested role list.
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(text[]) TO authenticated;

-- Pin search_path for the ordinary trigger helper flagged by the advisor.
ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public;
