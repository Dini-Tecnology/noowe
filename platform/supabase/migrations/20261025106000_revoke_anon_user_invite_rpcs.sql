-- Convidar e buscar usuários exige login; o papel anon herdava EXECUTE do privilégio padrão do Supabase.
revoke all on function public.customer_send_table_user_invite(uuid, text) from anon;
revoke all on function public.customer_search_users_for_table(uuid, text) from anon;
