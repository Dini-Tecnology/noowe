-- ADR-013 §2.9 — personalização de itens (20261001162000): modificadores obrigatórios/opcionais,
-- ingredientes removíveis e upsell. O servidor valida a escolha e precifica os extras
-- (invariante 2); o preço enviado pelo app nunca entra na conta.
begin;
select plan(15);

create temp table _mc(k text primary key, v uuid);
create function pg_temp.act(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.state_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
create function pg_temp.k(p text) returns uuid language sql as $$ select v from _mc where k = p $$;
create function pg_temp.opt(p_name text) returns uuid language sql as $$
  select o.id from public.menu_item_options o join public.menu_item_option_groups g on g.id = o.group_id
  where g.restaurant_id = 'c1000000-0000-4000-8000-000000000002' and o.name = p_name $$;
create function pg_temp.price(p_item uuid, p_selection jsonb) returns text language plpgsql as $$
begin
  return pg_temp.state_of(format('select private.price_item_customizations(%L, %L::jsonb)', p_item, p_selection));
end $$;

create function pg_temp.new_customer() returns uuid language plpgsql as $$
declare c uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (c, c || '@menu-custom.test');
  insert into public.profiles(id, full_name) values (c, 'Cliente Teste') on conflict do nothing;
  return c;
end $$;

create function pg_temp.order_qs(p_customer uuid, p_items jsonb) returns jsonb language plpgsql as $$
begin
  perform pg_temp.act(p_customer);
  return public.customer_create_order_v2('c1000000-0000-4000-8000-000000000002', 'quick_service', p_items,
    gen_random_uuid(), null, null, null, 'Ana', 'takeaway', true);
end $$;

do $$
declare r uuid := 'c1000000-0000-4000-8000-000000000002'; m1 uuid; m2 uuid; m3 uuid;
begin
  insert into _mc values ('restaurant', r), ('owner', 'c1000000-0000-4000-8000-000000000001');
  update public.restaurant_model_configs set
    service_models = array['casual_dining','quick_service']::public.noowe_service_model[] where restaurant_id = r;
  update public.restaurants set opening_hours = (
    select jsonb_object_agg(d, jsonb_build_object('closed', false,
      'shifts', jsonb_build_array(jsonb_build_object('open', '00:00', 'close', '23:59'))))
    from unnest(array['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) d
  ) where id = r;
  update public.restaurant_model_policies set close_orders_before_min = 0, accept_mode = 'auto', orders_paused = false
    where restaurant_id = r and service_model = 'quick_service';
  select id into m1 from public.menu_items where restaurant_id = r and is_available order by id limit 1;
  select id into m2 from public.menu_items where restaurant_id = r and is_available order by id offset 1 limit 1;
  select id into m3 from public.menu_items where restaurant_id = r and is_available order by id offset 2 limit 1;
  insert into _mc values ('m1', m1), ('m2', m2), ('m3', m3);
end $$;

-- 1. Só a equipe edita a personalização ------------------------------------------------------
do $$
declare c uuid := pg_temp.new_customer();
begin
  insert into _mc values ('c1', c);
  perform pg_temp.act(c);
  assert pg_temp.state_of(format($q$select public.restaurant_save_item_customization(%L, '[]', '{cebola}', '{}')$q$,
    pg_temp.k('m1'))) = '42501', 'cliente não pode editar o cardápio';
end $$;
select pass('cliente não edita a personalização do item');

-- 2. Faixas e referências inválidas são recusadas ---------------------------------------------
do $$
declare m1 uuid := pg_temp.k('m1');
  alheio uuid := coalesce((select id from public.menu_items where restaurant_id <> pg_temp.k('restaurant') limit 1), gen_random_uuid());
begin
  perform pg_temp.act(pg_temp.k('owner'));
  assert pg_temp.state_of(format($q$select public.restaurant_save_item_customization(%L,
    '[{"name":"Ponto","minSelect":2,"maxSelect":1,"options":[{"name":"A"},{"name":"B"}]}]', '{}', '{}')$q$, m1)) = '22023',
    'mínimo maior que máximo';
  assert pg_temp.state_of(format($q$select public.restaurant_save_item_customization(%L,
    '[{"name":"Vazio","minSelect":0,"maxSelect":1,"options":[]}]', '{}', '{}')$q$, m1)) = '22023',
    'grupo sem opções';
  assert pg_temp.state_of(format($q$select public.restaurant_save_item_customization(%L,
    '[{"name":"Ponto","minSelect":3,"maxSelect":3,"options":[{"name":"A"},{"name":"B"}]}]', '{}', '{}')$q$, m1)) = '22023',
    'mínimo impossível de cumprir';
  assert pg_temp.state_of(format($q$select public.restaurant_save_item_customization(%L, '[]', '{}', array[%L]::uuid[])$q$,
    m1, m1)) = '22023', 'item sugerindo a si mesmo';
  assert pg_temp.state_of(format($q$select public.restaurant_save_item_customization(%L, '[]', '{}', array[%L]::uuid[])$q$,
    m1, alheio)) = '22023', 'sugestão de outro restaurante';
end $$;
select pass('editor recusa faixa impossível, grupo vazio e upsell inválido');

-- 3. Configuração válida ------------------------------------------------------------------------
do $$
declare res jsonb;
begin
  perform pg_temp.act(pg_temp.k('owner'));
  res := public.restaurant_save_item_customization(pg_temp.k('m1'),
    '[{"name":"Ponto","minSelect":1,"maxSelect":1,"options":[{"name":"Mal passado"},{"name":"Ao ponto"}]},
      {"name":"Adicionais","minSelect":0,"maxSelect":2,"options":[
        {"name":"Bacon","priceDeltaCents":450},{"name":"Queijo","priceDeltaCents":300},
        {"name":"Ovo","priceDeltaCents":200,"isAvailable":false}]}]'::jsonb,
    array['cebola', ' picles ', 'cebola'], array[pg_temp.k('m2')]);
  assert (res->>'groups')::int = 2 and (res->>'removable')::int = 2 and (res->>'upsell')::int = 1, res::text;
  perform public.restaurant_save_item_customization(pg_temp.k('m3'),
    '[{"name":"Molho","minSelect":0,"maxSelect":1,"options":[{"name":"Barbecue","priceDeltaCents":100}]}]'::jsonb, '{}', '{}');
end $$;
select pass('dono salva grupos, ingredientes removíveis (sem repetição) e upsell');

-- 4. Leitura do cliente esconde opção indisponível ----------------------------------------------
do $$
declare map jsonb; item jsonb;
begin
  perform pg_temp.act(pg_temp.k('c1'));
  map := public.customer_get_menu_customizations(pg_temp.k('restaurant'));
  item := map->(pg_temp.k('m1')::text);
  assert jsonb_array_length(item->'groups') = 2, 'dois grupos';
  assert item->'groups'->0->>'name' = 'Ponto' and (item->'groups'->0->>'minSelect')::int = 1, 'ordem e obrigatoriedade';
  assert jsonb_array_length(item->'groups'->1->'options') = 2, 'Ovo indisponível não aparece';
  assert item->'removable' @> '["cebola","picles"]'::jsonb, 'ingredientes: ' || (item->'removable')::text;
  assert item->'upsellItemIds' = jsonb_build_array(pg_temp.k('m2')), 'upsell';
  assert map->(pg_temp.k('m2')::text) is null, 'item sem configuração fica fora do mapa';
end $$;
select pass('cliente lê grupos, ingredientes e upsell; opção indisponível fica oculta');

-- 5. Escrita direta nas tabelas é bloqueada ----------------------------------------------------
do $$
declare st text; owner_id uuid := pg_temp.k('owner');
  sql text := format($q$insert into public.menu_item_option_groups(restaurant_id, menu_item_id, name)
    values (%L, %L, 'Direto')$q$, pg_temp.k('restaurant'), pg_temp.k('m2'));
begin
  perform _test.as_user(owner_id);
  st := pg_temp.state_of(sql);
  perform _test.reset_role();
  assert st = '42501', 'insert direto deveria ser negado: ' || st;
end $$;
select pass('escrita direta nas tabelas de personalização é negada (só via RPC)');

-- 6. Validação da escolha ---------------------------------------------------------------------
select is(pg_temp.price(pg_temp.k('m1'), '{"options":[]}'), '22023', 'grupo obrigatório sem escolha é recusado');
select is(pg_temp.price(pg_temp.k('m1'),
  jsonb_build_object('options', jsonb_build_array(pg_temp.opt('Mal passado'), pg_temp.opt('Ao ponto')))),
  '22023', 'escolher acima do máximo do grupo é recusado');
do $$
begin
  assert pg_temp.price(pg_temp.k('m1'), jsonb_build_object('options',
    jsonb_build_array(pg_temp.opt('Ao ponto'), pg_temp.opt('Ovo')))) = '22023', 'opção indisponível';
  assert pg_temp.price(pg_temp.k('m1'), jsonb_build_object('options',
    jsonb_build_array(pg_temp.opt('Ao ponto'), pg_temp.opt('Barbecue')))) = '22023', 'opção de outro item';
  assert pg_temp.price(pg_temp.k('m1'), jsonb_build_object('options',
    jsonb_build_array(pg_temp.opt('Ao ponto'), pg_temp.opt('Bacon'), pg_temp.opt('Bacon')))) = '22023', 'opção repetida';
  assert pg_temp.price(pg_temp.k('m1'), jsonb_build_object('options',
    jsonb_build_array(pg_temp.opt('Ao ponto')), 'removed', jsonb_build_array('tomate'))) = '22023', 'ingrediente não removível';
  assert pg_temp.price(pg_temp.k('m1'), '{"options":"x"}') = '22023', 'formato inválido';
  assert pg_temp.price(pg_temp.k('m2'), null) = 'ok', 'item sem configuração aceita pedido sem escolha';
end $$;
select pass('opção indisponível, de outro item, repetida, ingrediente fixo e formato inválido são recusados');

-- 7. Preço calculado no servidor, em centavos exatos ------------------------------------------
do $$
declare c uuid := pg_temp.k('c1'); res jsonb; o uuid; li record; base1 numeric; base2 numeric; ord record;
begin
  select price into base1 from public.menu_items where id = pg_temp.k('m1');
  select price into base2 from public.menu_items where id = pg_temp.k('m2');
  res := pg_temp.order_qs(c, jsonb_build_array(
    jsonb_build_object('menu_item_id', pg_temp.k('m1'), 'quantity', 2, 'unit_price', 0.01, 'price', 0.01,
      'customizations', jsonb_build_object(
        'options', jsonb_build_array(pg_temp.opt('Ao ponto'), pg_temp.opt('Bacon'), pg_temp.opt('Queijo')),
        'removed', jsonb_build_array('cebola'))),
    jsonb_build_object('menu_item_id', pg_temp.k('m2'), 'quantity', 1)));
  o := (res->>'id')::uuid;
  insert into _mc values ('o1', o);
  select * into li from public.order_items where order_id = o and menu_item_id = pg_temp.k('m1');
  assert li.unit_price = base1 + 7.50, 'unitário com extras: ' || li.unit_price;
  assert li.total_price = (base1 + 7.50) * 2, 'total da linha';
  assert li.special_instructions like '%Ponto: Ao ponto%' and li.special_instructions like '%Adicionais: Bacon, Queijo%'
    and li.special_instructions like '%Sem cebola%', 'resumo para a cozinha: ' || li.special_instructions;
  assert jsonb_array_length(li.customizations) = 4, 'snapshot: ' || li.customizations::text;
  assert (select sum((e->>'priceDeltaCents')::bigint) from jsonb_array_elements(li.customizations) e
    where e->>'type' = 'option') = 750, 'snapshot guarda o extra cobrado';
  select * into ord from public.orders where id = o;
  assert ord.subtotal_cents = round(((base1 + 7.50) * 2 + base2) * 100)::bigint, 'subtotal em centavos: ' || ord.subtotal_cents;
  assert ord.total_cents = ord.subtotal_cents, 'sem combo, total = subtotal';
end $$;
select pass('extras são precificados no servidor e o preço enviado pelo app é ignorado');

-- 8. Pedido sem escolha obrigatória não nasce -----------------------------------------------------
do $$
declare c uuid := pg_temp.new_customer(); st text;
begin
  perform pg_temp.act(c);
  st := pg_temp.state_of(format($q$select public.customer_create_order_v2(%L, 'quick_service',
    jsonb_build_array(jsonb_build_object('menu_item_id', %L, 'quantity', 1)), gen_random_uuid(), null, null, null,
    'Ana', 'takeaway', true)$q$, pg_temp.k('restaurant'), pg_temp.k('m1')));
  assert st = '22023', 'pedido sem ponto deveria falhar: ' || st;
  assert not exists (select 1 from public.orders where customer_id = c), 'nenhum pedido órfão';
end $$;
select pass('pedido sem a escolha obrigatória é recusado inteiro, sem deixar pedido órfão');

-- 9. Personalização diferente não é pedido duplicado ---------------------------------------------
do $$
declare c uuid := pg_temp.k('c1'); st text; res jsonb;
begin
  res := pg_temp.order_qs(c, jsonb_build_array(
    jsonb_build_object('menu_item_id', pg_temp.k('m1'), 'quantity', 2, 'customizations', jsonb_build_object(
      'options', jsonb_build_array(pg_temp.opt('Mal passado'), pg_temp.opt('Bacon'), pg_temp.opt('Queijo')),
      'removed', jsonb_build_array('cebola'))),
    jsonb_build_object('menu_item_id', pg_temp.k('m2'), 'quantity', 1)));
  assert (res->>'id')::uuid <> pg_temp.k('o1'), 'outro ponto é outro pedido';
  perform pg_temp.act(c);
  st := pg_temp.state_of(format($q$select public.customer_create_order_v2(%L, 'quick_service', %L::jsonb,
    gen_random_uuid(), null, null, null, 'Ana', 'takeaway', true)$q$, pg_temp.k('restaurant'), jsonb_build_array(
    jsonb_build_object('menu_item_id', pg_temp.k('m1'), 'quantity', 2, 'customizations', jsonb_build_object(
      'options', jsonb_build_array(pg_temp.opt('Mal passado'), pg_temp.opt('Bacon'), pg_temp.opt('Queijo')),
      'removed', jsonb_build_array('cebola'))),
    jsonb_build_object('menu_item_id', pg_temp.k('m2'), 'quantity', 1))));
  assert st = 'P0005', 'mesma personalização repetida é duplicado: ' || st;
end $$;
select pass('o bloqueio de duplicado considera a personalização');

-- 10. Combo: o desconto incide no preço base; extra é cobrado cheio (ADR-013 §2.9) ----------------
do $$
declare c uuid := pg_temp.new_customer(); res jsonb; ord record; base_sum numeric; bps integer; line_sum numeric;
begin
  select combo_discount_bps into bps from public.restaurant_model_policies
    where restaurant_id = pg_temp.k('restaurant') and service_model = 'quick_service';
  select sum(price) into base_sum from public.menu_items where id in (pg_temp.k('m1'), pg_temp.k('m2'), pg_temp.k('m3'));
  res := pg_temp.order_qs(c, jsonb_build_array(
    jsonb_build_object('menu_item_id', pg_temp.k('m1'), 'quantity', 1, 'combo_group', 'g1', 'customizations',
      jsonb_build_object('options', jsonb_build_array(pg_temp.opt('Ao ponto'), pg_temp.opt('Bacon')))),
    jsonb_build_object('menu_item_id', pg_temp.k('m2'), 'quantity', 1, 'combo_group', 'g1'),
    jsonb_build_object('menu_item_id', pg_temp.k('m3'), 'quantity', 1, 'combo_group', 'g1')));
  select * into ord from public.orders where id = (res->>'id')::uuid;
  select sum(total_price) into line_sum from public.order_items where order_id = ord.id;
  assert line_sum = base_sum + 4.50, 'linhas trazem o extra: ' || line_sum;
  assert ord.discount_cents = round(base_sum * bps / 10000 * 100)::bigint, 'desconto só sobre o base: ' || ord.discount_cents;
  assert ord.total_cents = ord.subtotal_cents - ord.discount_cents, 'total = subtotal − desconto, sem centavo perdido';
end $$;
select pass('no combo o desconto incide sobre o preço base e o extra entra cheio');

-- 11. Item sem configuração mantém o comportamento anterior -------------------------------------
do $$
declare c uuid := pg_temp.new_customer(); res jsonb; li record;
begin
  res := pg_temp.order_qs(c, jsonb_build_array(jsonb_build_object('menu_item_id', pg_temp.k('m2'), 'quantity', 1,
    'special_instructions', 'Bem gelado')));
  select * into li from public.order_items where order_id = (res->>'id')::uuid;
  assert li.unit_price = (select price from public.menu_items where id = pg_temp.k('m2')), 'preço base';
  assert li.special_instructions = 'Bem gelado', 'observação intacta: ' || coalesce(li.special_instructions, '∅');
end $$;
select pass('item sem personalização segue com preço base e observação original');

-- 12. Resumo e snapshot estáveis (o app separa a observação original no "Pedir novamente") --------
do $$
declare a jsonb; b jsonb;
begin
  a := private.price_item_customizations(pg_temp.k('m1'), jsonb_build_object(
    'options', jsonb_build_array(pg_temp.opt('Ao ponto')), 'removed', jsonb_build_array('picles', 'cebola', 'picles')));
  b := private.price_item_customizations(pg_temp.k('m1'), jsonb_build_object(
    'options', jsonb_build_array(pg_temp.opt('Ao ponto')), 'removed', jsonb_build_array('cebola', 'picles')));
  assert a->>'summary' = 'Ponto: Ao ponto · Sem cebola, sem picles', 'resumo: ' || (a->>'summary');
  assert a->'normalized' = b->'normalized' and a->>'summary' = b->>'summary', 'mesma escolha, mesmo snapshot';
end $$;
select pass('ingrediente repetido ou fora de ordem gera o mesmo resumo e o mesmo snapshot');

-- 13. Reeditar mantém os ids (carrinho aberto e "Pedir novamente" seguem válidos) ---------------
do $$
declare g_ponto uuid; g_add uuid; o_ao uuid := pg_temp.opt('Ao ponto'); o_bacon uuid := pg_temp.opt('Bacon');
  o_mal uuid := pg_temp.opt('Mal passado'); n integer;
begin
  select id into g_ponto from public.menu_item_option_groups where menu_item_id = pg_temp.k('m1') and name = 'Ponto';
  select id into g_add from public.menu_item_option_groups where menu_item_id = pg_temp.k('m1') and name = 'Adicionais';
  perform pg_temp.act(pg_temp.k('owner'));
  -- Bacon fica mais caro, "Mal passado" e o grupo Adicionais (exceto Bacon) saem, entra "Bem passado".
  perform public.restaurant_save_item_customization(pg_temp.k('m1'), jsonb_build_array(
    jsonb_build_object('id', g_ponto, 'name', 'Ponto da carne', 'minSelect', 1, 'maxSelect', 1, 'options', jsonb_build_array(
      jsonb_build_object('id', o_ao, 'name', 'Ao ponto'), jsonb_build_object('name', 'Bem passado'))),
    jsonb_build_object('id', g_add, 'name', 'Adicionais', 'minSelect', 0, 'maxSelect', 1, 'options', jsonb_build_array(
      jsonb_build_object('id', o_bacon, 'name', 'Bacon', 'priceDeltaCents', 500)))),
    array['cebola'], '{}');
  assert pg_temp.opt('Ao ponto') = o_ao and pg_temp.opt('Bacon') = o_bacon, 'ids preservados';
  assert (select name from public.menu_item_option_groups where id = g_ponto) = 'Ponto da carne', 'grupo renomeado no lugar';
  assert (select price_delta_cents from public.menu_item_options where id = o_bacon) = 500, 'preço atualizado no lugar';
  assert not exists (select 1 from public.menu_item_options where id = o_mal), 'opção retirada do payload é apagada';
  select count(*) into n from public.menu_item_options o join public.menu_item_option_groups g on g.id = o.group_id
    where g.menu_item_id = pg_temp.k('m1');
  assert n = 3, 'Ao ponto, Bem passado e Bacon: ' || n;
  assert pg_temp.price(pg_temp.k('m1'), jsonb_build_object('options', jsonb_build_array(o_ao, o_bacon))) = 'ok',
    'a escolha antiga continua valendo';
  -- id de outro item não é sequestrado: vira opção nova neste item.
  perform public.restaurant_save_item_customization(pg_temp.k('m3'), jsonb_build_array(
    jsonb_build_object('name', 'Molho', 'minSelect', 0, 'maxSelect', 1, 'options', jsonb_build_array(
      jsonb_build_object('id', o_ao, 'name', 'Intruso')))), '{}', '{}');
  assert (select name from public.menu_item_options where id = o_ao) = 'Ao ponto', 'opção de outro item intacta';
end $$;
select pass('reeditar preserva ids, atualiza no lugar e apaga só o que saiu');

select * from finish();
rollback;
