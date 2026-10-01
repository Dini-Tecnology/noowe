-- CNPJ alfanumérico (20260930142000): o servidor recusa CNPJ fora do padrão da
-- Receita Federal, aceita o numérico antigo e só valida quando o valor muda.
begin;
select plan(10);

select ok(private.is_valid_cnpj('12.ABC.345/01DE-35'), 'exemplo alfanumérico oficial da Receita é válido');
select ok(private.is_valid_cnpj('12abc34501de35'), 'minúsculas e sem máscara também');
select ok(private.is_valid_cnpj('11.222.333/0001-81'), 'CNPJ numérico antigo continua válido');
select ok(not private.is_valid_cnpj('12.ABC.345/01DE-36'), 'dígito verificador errado é recusado');
select ok(not private.is_valid_cnpj('00.000.000/0000-00'), 'sequência de um caractere só é recusada');
select ok(not private.is_valid_cnpj('abc'), 'texto qualquer é recusado');
select ok(not private.is_valid_cnpj('12.ABC.345/01DE-AB'), 'dígitos verificadores precisam ser numéricos');

create temp table cnpj_results(label text primary key, ok boolean not null);

do $$
declare
  r uuid := 'c1000000-0000-4000-8000-000000000002';
  owner_id uuid := 'c1000000-0000-4000-8000-000000000001';
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);

  perform public.restaurant_update_profile(r, jsonb_build_object('settings', jsonb_build_object('cnpj', '12.ABC.345/01DE-35')));
  insert into cnpj_results values ('perfil aceita CNPJ alfanumérico válido',
    (select settings->>'cnpj' from public.restaurants where id = r) = '12.ABC.345/01DE-35');

  begin
    perform public.restaurant_update_profile(r, jsonb_build_object('settings', jsonb_build_object('cnpj', 'qualquer coisa')));
    insert into cnpj_results values ('perfil recusa CNPJ inválido', false);
  exception when sqlstate '22023' then
    insert into cnpj_results values ('perfil recusa CNPJ inválido', true);
  end;

  -- Dado legado inválido não trava edições que não mexem no CNPJ.
  alter table public.restaurants disable trigger restaurants_validate_cnpj;
  update public.restaurants set settings = settings || '{"cnpj":"legado-invalido"}' where id = r;
  alter table public.restaurants enable trigger restaurants_validate_cnpj;
  perform public.restaurant_update_profile(r, jsonb_build_object(
    'settings', (select settings || '{"contacts":[]}'::jsonb from public.restaurants where id = r)));
  insert into cnpj_results values ('CNPJ legado inválido não trava edição de outro campo',
    (select settings->>'cnpj' from public.restaurants where id = r) = 'legado-invalido');
end $$;

select ok(ok, label) from cnpj_results order by label;
select * from finish();
rollback;
