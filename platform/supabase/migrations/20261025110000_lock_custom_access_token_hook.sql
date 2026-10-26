-- O hook de token só é chamado pelo Auth (supabase_auth_admin); nenhum cliente precisa executá-lo.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from anon, authenticated, public;
