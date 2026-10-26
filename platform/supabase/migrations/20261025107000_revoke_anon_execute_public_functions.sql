-- O papel anon herdava EXECUTE em toda função criada no schema public (privilégio padrão do Supabase).
-- Os apps só chamam RPCs depois do login e as Edge Functions não usam a chave anon: fecha tudo,
-- exceto o hook de token do Auth, que tem concessão própria ao papel do Auth.
do $$
declare v_fn record;
begin
  for v_fn in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname <> 'custom_access_token_hook'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    execute format('revoke all on function %s from anon', v_fn.sig);
  end loop;
end $$;

-- Funções novas não nascem mais abertas ao anon: quem precisar, concede de propósito.
alter default privileges for role postgres in schema public revoke execute on functions from anon;
