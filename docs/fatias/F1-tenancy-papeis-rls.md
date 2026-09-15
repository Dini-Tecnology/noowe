# F1 — Tenancy, papéis e RLS

**Objetivo:** toda tabela de negócio isolada por estabelecimento e por papel, com Realtime já
respeitando essas políticas.
**Depende de:** —
**Spec:** §2.4 (papéis), §7.2 (política de acesso)
**Arquitetura:** `docs/arquitetura/02-realtime-e-rls.md`

## Entregáveis

**Banco**
- `establishments`, `staff_members` com enum de papel (dono, gerente, maitre, chef, cozinheiro, barman, garcom)
- `auth_establishment_ids()` e `auth_role_in(establishment_id)` como funções `security definer`
- RLS habilitado em **todas** as tabelas de negócio, por padrão negando
- Políticas de linha para os dois casos que não são só tenancy: garçom → próprias mesas;
  cozinheiro/barman → própria estação

**Servidor**
- Seed de papéis e um estabelecimento de desenvolvimento

**App**
- Sessão autenticada, `useRole()`, e roteamento por papel na tela inicial (spec §2.4)

## Critérios de aceite

1. Um usuário do estabelecimento A não lê nenhuma linha do estabelecimento B, em nenhuma tabela.
2. O mesmo vale no Realtime: assinar o canal de B como usuário de A não entrega nenhum payload.
3. Garçom lê apenas mesas onde `assigned_waiter_id = auth.uid()`.
4. Cozinheiro do bar não recebe eventos de itens da cozinha, e vice-versa.
5. Cada papel abre na tela inicial que a spec §2.4 define para ele.
6. Nenhuma tabela de negócio existe com RLS desabilitado — teste automatizado que varre
   `pg_tables` e falha se encontrar uma.

## Fora de escopo

Telas de gestão de equipe e escala. Aqui só o modelo de acesso.
