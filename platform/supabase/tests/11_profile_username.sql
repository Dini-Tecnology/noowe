-- G2b / ADR-011 — @username único, gerado do nome, editável só pela RPC.
begin;
select plan(24);

-- Fixtures: usuários criados como no cadastro real (auth.users -> trigger -> profiles).
do $$
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    ('11000000-0000-4000-8000-000000000001', 'bruno1@username.test', '{"full_name":"Bruno de Castro"}'),
    ('11000000-0000-4000-8000-000000000002', 'bruno2@username.test', '{"full_name":"Bruno de Castro"}'),
    ('11000000-0000-4000-8000-000000000003', 'bruno3@username.test', '{"full_name":"BRUNO  de   castro"}'),
    ('11000000-0000-4000-8000-000000000004', 'joao@username.test',   '{"full_name":"João Ávila"}'),
    ('11000000-0000-4000-8000-000000000005', 'maria.silva@username.test', '{}'),
    ('11000000-0000-4000-8000-000000000006', 'x@username.test',      '{"full_name":"Admin"}');
  -- Sem nome e sem e-mail (caminho usado pelos outros testes).
  insert into auth.users(id) values ('11000000-0000-4000-8000-000000000007');
  insert into public.profiles(id) values ('11000000-0000-4000-8000-000000000007') on conflict do nothing;
end $$;

select is((select username from public.profiles where id = '11000000-0000-4000-8000-000000000001'),
  'bruno-de-castro', 'slug do nome');
select is((select username from public.profiles where id = '11000000-0000-4000-8000-000000000002'),
  'bruno-de-castro-2', 'colisao vira -2');
select is((select username from public.profiles where id = '11000000-0000-4000-8000-000000000003'),
  'bruno-de-castro-3', 'colisao ignora caixa e espacos: -3');
select is((select username from public.profiles where id = '11000000-0000-4000-8000-000000000004'),
  'joao-avila', 'acentos removidos');
select is((select username from public.profiles where id = '11000000-0000-4000-8000-000000000005'),
  'maria-silva', 'sem nome usa o e-mail');
select matches((select username from public.profiles where id = '11000000-0000-4000-8000-000000000006'),
  '^usuario-[0-9a-f]{6}$', 'nome reservado nunca e gerado');
select matches((select username from public.profiles where id = '11000000-0000-4000-8000-000000000007'),
  '^usuario-[0-9a-f]{6}$', 'sem nome nem e-mail gera usuario-xxxxxx');

select is((select count(*)::integer from public.profiles where username is null), 0, 'nenhum perfil sem username');
select col_not_null('public', 'profiles', 'username', 'username e NOT NULL');
select throws_ok(
  $$ update public.profiles set username = 'bruno-de-castro' where id = '11000000-0000-4000-8000-000000000002' $$,
  '23505', null, 'unique impede duplicado');

-- Guarda: UPDATE direto via REST é recusado.
select _test.as_user('11000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ update public.profiles set username = 'hacker' where id = auth.uid() $$,
  '42501', null, 'update direto do username e recusado');

-- Disponibilidade
select is(public.customer_check_username_availability('@Bruno-De-Castro')->>'reason', 'current', 'o proprio @ e "current"');
select is((public.customer_check_username_availability('bruno-de-castro-2')->>'available')::boolean, false, 'em uso nao esta disponivel');
select is(public.customer_check_username_availability('BRUNO-DE-CASTRO-2')->>'reason', 'taken', 'em uso sem diferenciar maiusculas');
select is(public.customer_check_username_availability('suporte')->>'reason', 'reserved', 'reservado');
select is(public.customer_check_username_availability('-ab')->>'reason', 'invalid_format', 'hifen no comeco e invalido');
select is(public.customer_check_username_availability('ab')->>'reason', 'invalid_format', 'curto demais');
select is(public.customer_check_username_availability(repeat('a', 31))->>'reason', 'invalid_format', 'longo demais');
select is(public.customer_check_username_availability('Bruno Novo')->>'normalized', 'bruno-novo', 'espaco vira hifen');

-- Troca
select throws_ok($$ select public.customer_set_my_username('bruno-de-castro-2') $$, '23505', null, 'troca para @ em uso falha');
select throws_ok($$ select public.customer_set_my_username('admin') $$, '22023', null, 'troca para reservado falha');
select throws_ok($$ select public.customer_set_my_username('a--b') $$, '22023', null, 'hifen duplo e invalido');
select is(public.customer_set_my_username('@Bruno.Castro')->>'username', 'bruno-castro', 'troca normaliza e grava');

reset role;
select _test.as_anon();
select throws_ok($$ select public.customer_check_username_availability('qualquer') $$, '42501', null,
  'anonimo nao consulta disponibilidade');

select * from finish();
rollback;
