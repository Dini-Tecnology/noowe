# Dados simulados do cliente para testar o app do restaurante

O projeto possui um gerador idempotente de atividade de clientes no Supabase. Ele cria dados relacionados e visíveis nas telas reais do app do restaurante, sem escolher ou alterar automaticamente nenhum restaurante.

## O que é criado

- 5 clientes com perfis, preferências e restrições alimentares;
- 4 categorias e 10 itens de cardápio;
- 5 mesas em diferentes estados e 2 sessões ativas;
- 8 pedidos nos estados `pending`, `confirmed`, `preparing`, `ready`, `completed`, `delivered` e `cancelled`;
- 18 itens de pedido, incluindo observações e alertas de alergia para o KDS;
- 5 reservas, incluindo pendente, confirmada, sentada e histórico;
- 3 grupos na fila de espera;
- 3 chamados de atendimento;
- 5 perfis de fidelidade/CRM;
- 4 avaliações;
- notificações para os clientes.

Os horários são relativos ao momento da execução. Assim, o dashboard e as telas de pedidos e reservas continuam exibindo dados como “hoje”.

## Aplicar e executar

1. Aplique as migrations:

   ```powershell
   cd platform
   supabase db push
   ```

2. No SQL Editor do Supabase, encontre o restaurante que receberá a simulação:

   ```sql
   select id, name, city, service_type
   from public.restaurants
   order by created_at desc;
   ```

3. Execute o gerador usando o ID correto:

   ```sql
   select private.seed_restaurant_client_simulation(
     'COLE-O-RESTAURANT-ID-AQUI'::uuid
   );
   ```

O retorno é um JSON com as quantidades criadas, credenciais dos clientes e o comando de limpeza.

## Perfis de clientes simulados

Perfis:

- `cliente.ana@noowe.test`
- `cliente.lucas@noowe.test`
- `cliente.marina@noowe.test`
- `cliente.rafael@noowe.test`
- `cliente.beatriz@noowe.test`

Os perfis usam o domínio reservado `.test` e não representam pessoas reais.
Eles servem como identidades de referência para os relacionamentos do banco e
não possuem senha de login. Para testar também o login no app cliente, crie a
conta pelo Auth Admin API e use os mesmos dados de perfil.

## Atualizar os horários e estados

O gerador pode ser executado novamente com segurança. Ele usa IDs determinísticos e `upsert`, portanto atualiza os mesmos dados em vez de duplicá-los:

```sql
select private.seed_restaurant_client_simulation(
  'COLE-O-RESTAURANT-ID-AQUI'::uuid,
  now()
);
```

## Limpar a simulação

```sql
select private.clear_restaurant_client_simulation(
  'COLE-O-RESTAURANT-ID-AQUI'::uuid
);
```

A limpeza remove os dados operacionais marcados como simulação. Os cinco usuários de referência são preservados para evitar exclusão inesperada de identidades que possam ter sido usadas em testes manuais.

Itens de cardápio e mesas simulados também são preservados se algum pedido ou reserva criado manualmente ainda os referenciar.

## Segurança

- Nenhum dado é inserido automaticamente ao aplicar a migration.
- As funções ficam no schema `private`.
- Apenas `service_role` pode executá-las.
- Todos os registros operacionais são limitados ao `restaurant_id` informado.
- A função falha se o restaurante não existir.
