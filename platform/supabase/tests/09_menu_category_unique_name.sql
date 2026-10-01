-- Nomes de categoria são únicos por restaurante. A comparação ignora
-- maiúsculas e espaços nas pontas, e renomear para o próprio nome continua válido.

begin;
select plan(1);

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
  created jsonb;
  other jsonb;
begin
  assert not exists (
    select 1
    from public.menu_categories
    group by restaurant_id, lower(btrim(name))
    having count(*) > 1
  ), 'duplicate category names survived the cleanup';

  assert to_regclass('public.menu_categories_restaurant_name_key') is not null,
    'unique category name index is missing';

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text,
    true
  );

  created := public.restaurant_create_menu_category(r, 'Sobremesa única teste', null, null, 99);

  begin
    perform public.restaurant_create_menu_category(r, '  sobremesa única teste  ', null, null, 100);
    raise exception 'duplicate category name was accepted';
  exception
    when unique_violation then null;
  end;

  begin
    perform public.restaurant_create_menu_category(r, '   ', null, null, 0);
    raise exception 'blank category name was accepted';
  exception
    when invalid_parameter_value then null;
  end;

  other := public.restaurant_create_menu_category(r, 'Bebida única teste', null, null, 101);

  begin
    perform public.restaurant_update_menu_category(
      (other->>'id')::uuid,
      'SOBREMESA ÚNICA TESTE',
      null,
      null,
      null,
      null
    );
    raise exception 'rename onto an existing category was accepted';
  exception
    when unique_violation then null;
  end;

  perform public.restaurant_update_menu_category(
    (created->>'id')::uuid,
    '  sobremesa única teste  ',
    null,
    null,
    null,
    null
  );
end
$$;

select pass('menu categories keep a single name per restaurant');

select * from finish();
rollback;
