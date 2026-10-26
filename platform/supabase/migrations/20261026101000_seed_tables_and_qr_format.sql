-- Dados de demonstração que o app não conseguia usar:
-- 1) "Casa Noowe" (seed b1000000-…-0002) não tinha nenhuma mesa: o QR de teste e a lotação falhavam.
-- 2) "Cantina Noowe" tinha QR no formato antigo (noowe://table/…), que o app recusa por não ser noowe://t/….
-- Usa as próprias funções do servidor, com a identidade do dono do restaurante. Idempotente e só mexe
-- onde existe o problema: banco sem esses restaurantes passa direto.
do $$
declare
  v_casa constant uuid := 'b1000000-0000-4000-8000-000000000002';
  v_cantina constant uuid := 'c1000000-0000-4000-8000-000000000002';
  v_owner uuid;
  v_table record;
begin
  if exists (select 1 from public.restaurants where id = v_casa)
     and not exists (select 1 from public.tables where restaurant_id = v_casa) then
    select ur.user_id into v_owner from public.user_roles ur
      where ur.restaurant_id = v_casa and ur.is_active and ur.role::text = 'owner' limit 1;
    if v_owner is not null then
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
      perform public.restaurant_create_table(v_casa, 'Mesa 1', 4, 'Salão');
      perform public.restaurant_create_table(v_casa, 'Mesa 2', 4, 'Salão');
      perform public.restaurant_create_table(v_casa, 'Mesa 3', 6, 'Salão');
    end if;
  end if;

  if exists (select 1 from public.restaurants where id = v_cantina) then
    select ur.user_id into v_owner from public.user_roles ur
      where ur.restaurant_id = v_cantina and ur.is_active and ur.role::text = 'owner' limit 1;
    if v_owner is not null then
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
      for v_table in
        select distinct t.id from public.tables t
        join public.table_qr_codes q on q.table_id = t.id and q.is_active
        where t.restaurant_id = v_cantina and q.qr_code_data not like 'noowe://t/%'
      loop
        perform public.restaurant_generate_table_qr(v_table.id);
      end loop;
    end if;
  end if;
end $$;
