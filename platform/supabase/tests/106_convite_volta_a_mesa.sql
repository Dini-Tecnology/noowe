-- CT-08 (ADR-021): quem saiu sem pagar e aceita um convite novo volta para a mesma comanda;
-- reaceitar o convite já usado é recusado com mensagem, nunca "aceito" sem estar na mesa.
begin;
select plan(3);

create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true) $$;
create temp table _r(k text primary key, v text);

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002'; owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); t jsonb; sid uuid; menu uuid; o uuid; inv1 uuid; inv2 uuid; res jsonb;
begin
  update public.restaurant_model_configs set user_invite_enabled = true where restaurant_id = r;
  insert into auth.users(id, email) values (a, a || '@volta.test'), (b, b || '@volta.test');
  insert into public.profiles(id, full_name, username) values (a, 'Ana Volta', 'ana' || left(replace(a::text,'-',''), 10)),
    (b, 'Bia Volta', 'bia' || left(replace(b::text,'-',''), 10)) on conflict (id) do nothing;
  select id into menu from public.menu_items where restaurant_id = r limit 1;
  perform pg_temp.act(owner_id); t := public.restaurant_create_table(r, 'volta-' || a, 4);
  perform pg_temp.act(a); sid := (public.customer_open_table_session(t->>'qr_code')->>'tableSessionId')::uuid;
  perform pg_temp.act(b); perform public.customer_open_table_session(t->>'qr_code');
  insert into public.orders(restaurant_id, customer_id, table_session_id) values (r, b, sid) returning id into o;
  insert into public.order_items(order_id, menu_item_id, quantity, unit_price, total_price) values (o, menu, 1, 20, 20);
  -- B sai sem pagar (marca walkout_at/left_unpaid_at; a parte fica com o titular).
  update public.table_session_participants set walkout_at = now(), left_unpaid_at = now()
    where table_session_id = sid and user_id = b;

  perform pg_temp.act(a);
  insert into public.table_session_user_invites(restaurant_id, table_session_id, inviter_id, invitee_id, status, expires_at, responded_at)
    values (r, sid, a, b, 'accepted', now() + interval '10 min', now()) returning id into inv1;
  insert into public.table_session_user_invites(restaurant_id, table_session_id, inviter_id, invitee_id, status, expires_at, responded_at)
    values (r, sid, a, b, 'pending', now() + interval '10 min', null) returning id into inv2;

  perform pg_temp.act(b);
  begin
    perform public.customer_accept_table_user_invite(inv1);
    insert into _r values ('old', 'aceito');
  exception when sqlstate 'P0001' then insert into _r values ('old', sqlerrm); end;
  res := public.customer_accept_table_user_invite(inv2);
  insert into _r values ('new', res->>'status'),
    ('in', (exists (select 1 from public.table_session_participants where table_session_id = sid and user_id = b and walkout_at is null))::text);
end $$;

select matches((select v from _r where k = 'old'), 'saiu desta mesa', 'convite já usado por quem saiu é recusado com mensagem');
select is((select v from _r where k = 'new'), 'accepted', 'convite novo é aceito');
select is((select v from _r where k = 'in'), 'true', 'e a pessoa volta de fato para a mesma comanda');

select * from finish();
rollback;
