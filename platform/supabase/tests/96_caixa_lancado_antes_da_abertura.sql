-- QA 25/11/2026 — VM-06: o dinheiro recebido sem caixa aberto aparece na tela do caixa, como "Lançado antes da abertura".
begin;
select plan(3);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _ctx(k text primary key, v uuid);
create function pg_temp.ctx(p text) returns uuid language sql as $$ select v from _ctx where k = p $$;
do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; u uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (u, u || '@cx96.test');
  insert into public.profiles(id, full_name) values (u, 'Gerente 96') on conflict (id) do nothing;
  insert into public.user_roles(user_id, restaurant_id, role, is_active) values (u, r, 'manager', true);
  insert into _ctx values ('r', r), ('gerente', u), ('dono', 'c1000000-0000-4000-8000-000000000001');
  update public.cash_register_sessions set status = 'closed', closed_at = now() where restaurant_id = r and status = 'open';
  delete from private.cash_outside_register where restaurant_id = r and movement_id is null;
  perform pg_temp.act(u);
  perform private.cash_record(r, 'sale', 2500, 'Mesa 3');
end $$;

select is((select jsonb_agg(x->>'description') from jsonb_array_elements(public.restaurant_get_cash_register(pg_temp.ctx('r'))->'before_opening') x),
  '["Mesa 3 · Lançado antes da abertura"]'::jsonb, 'sem caixa aberto, a tela lista o dinheiro que espera a abertura');

do $$ begin perform pg_temp.act(pg_temp.ctx('dono')); perform public.restaurant_open_cash_register(pg_temp.ctx('r'), 100); end $$;
select pg_temp.act(pg_temp.ctx('gerente'));
select is((select jsonb_agg(jsonb_build_object('d', x->>'description', 'b', x->'before_opening', 'c', x->'amount_cents'))
    from jsonb_array_elements(public.restaurant_get_cash_register(pg_temp.ctx('r'))->'session'->'movements') x),
  '[{"d": "Mesa 3 · Lançado antes da abertura", "b": true, "c": 2500}]'::jsonb, 'com o caixa aberto, o Gerente vê o lançado antes da abertura');
select is(jsonb_array_length(public.restaurant_get_cash_register(pg_temp.ctx('r'))->'before_opening'), 0, 'e ele não aparece duas vezes');
select * from finish();
rollback;
