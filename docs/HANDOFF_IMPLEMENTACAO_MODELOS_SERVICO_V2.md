# Handoff — implementação NOOWE Service Models v2

Atualizado em 14/09/2026. Este documento transfere o contexto completo da conversa que partiu do DOCX
`/Users/avantar/Downloads/NOOWE_Modelos_de_Servico_Fine_Casual_Quick_v2.docx` e passou a implementar
Fine Dining, Casual Dining e Quick Service no repositório.

## Pedido e decisão de escopo

- O usuário pediu aderência completa ao DOCX para os três modelos e autorizou o início da implementação.
- O DOCX foi tratado apenas como fonte de requisitos; nenhuma instrução nele foi executada como comando.
- O escopo é grande: envolve banco, apps cliente/restaurante, pagamentos, KDS, sessões de mesa, split,
  reserva/fila, fidelidade, CRM, segurança e rollout. A implementação deve continuar por fatias que preservem
  invariantes, não por reescrita ampla.
- O usuário observou corretamente que as primeiras entregas eram só documentação/SQL e pediu mudanças reais
  no app. A integração cliente↔capabilities já foi iniciada.

## Fonte de verdade

1. `CLAUDE.md` na raiz: invariantes e regra de não ramificar por modelo fora da camada de capabilities.
2. `docs/arquitetura/03-config-service-model.md`: contrato de configuração e capabilities.
3. `docs/tarefas/T0-fundacoes.md`: F2 e F3; `docs/tarefas/T2-entrada-e-grupo.md` e
   `docs/tarefas/T3-modelos-de-servico.md`: próximos domínios.
4. `docs/fatias/`: sequência de entrega por domínio.
5. `docs/decisoes/`: ADRs. ADR-004 continua provisório e bloqueia a política de reabertura depois de
   pagamento parcial.

## Trabalho criado nesta conversa

### Configuração e capabilities

- `platform/supabase/migrations/20260914130000_restaurant_model_config_foundation.sql`
  - Cria `public.restaurant_model_configs` 1:1 com `restaurants`.
  - Define enums de modelo, split, fidelidade, gorjeta e resíduo.
  - Persiste parâmetros tipados da seção 7.1: BPS, taxa, gorjeta, split, reserva/fila, família, links,
    capacidade, combo, pré-pagamento, retirada e fidelidade.
  - Valida sala sem porta de entrada, Quick sem pré-pagamento e fila primária fora de Casual.
  - Faz backfill de `restaurants.service_config`, cria config para novos restaurantes e mantém compatibilidade
    com `restaurant_upsert_service_configs`.
  - Expõe `public.get_restaurant_model_capabilities(uuid, noowe_service_model)`.
  - Atenção: esta migration ainda não foi aplicada localmente porque Docker/Postgres não está ativo.

- `platform/supabase/tests/04_restaurant_model_config.sql`: testes pgTAP estruturais da fundação.

- `platform/mobile/shared/config/capabilities.ts`
  - Contrato tipado da RPC e parser fail-closed.
  - `clientFeaturesFromCapabilities` adapta o contrato a flags temporárias das telas sem decidir por modelo.

- `platform/mobile/shared/config/__tests__/capabilities.test.ts`
  - Valida contrato completo, rejeição de payload inválido e ponte de flags do cliente.

- `platform/mobile/apps/client/src/services/customer-backend.ts`
  - Adicionado `getRestaurantCapabilities(restaurantId, serviceModel)`.
  - Há cast estrito de `rpc` porque `database.generated.ts` ainda não foi regenerado com a migration nova.
    Após aplicar a migration, regenerar tipos e remover esse cast.

- `platform/mobile/apps/client/src/contexts/ServiceTypeContext.tsx`
  - A resolução agora pode carregar features respondidas pelo servidor.

- `platform/mobile/apps/client/src/components/ServiceTypeSync.tsx`
  - Consulta a RPC após resolver o restaurante da visita; enquanto capabilities não chegam, mantém estado
    `loading`, sem habilitar módulo por fallback hardcoded.

- `platform/mobile/apps/client/src/hooks/useServiceTypeFeatures.ts`
  - `useServiceTypeUI()` não contém mais comparação por `fine_dining`, `casual_dining` ou `quick_service`.
  - Fluxo de pedido, pagamento, mesa, fila e estilo vêm de flags.
  - `useServiceTypeFor(restaurantId)` também busca capabilities no banco.

### Auditoria

- `platform/supabase/migrations/20260914131000_audit_log_foundation.sql`
  - Estende `audit_logs` de autenticação com `restaurant_id`, `reason`, `before`, `after`.
  - Cria `private.log_audit(...)`, transacional e não chamável diretamente por `authenticated`.
  - Aplica RLS de leitura para dono/gerente da unidade.
- `platform/supabase/tests/05_audit_log_foundation.sql`: testes pgTAP estruturais.

### Documentação modificada/criada

- `docs/PLANO_IMPLEMENTACAO_MODELOS_SERVICO_V2.md`: plano por ondas e status das fundações iniciadas.
- `docs/arquitetura/05-glossario-spec-banco.md`: atualiza a tradução para `restaurant_model_configs`.

## Verificações já executadas

```sh
cd platform/mobile
npm test -- --runInBand shared/config/__tests__/capabilities.test.ts
# PASS: 3 testes

npm run typecheck:client
# PASS
```

Também foi executado `git diff --check` nas mudanças criadas.

Não foi possível rodar a suíte pgTAP:

```text
supabase test db
failed to connect to postgres 127.0.0.1:54322: connection refused
```

É necessário iniciar Docker/Supabase local antes de aplicar migrations ou executar `supabase test db`.

## Estado crítico do worktree

O worktree já estava muito sujo antes deste trabalho, com centenas de alterações e arquivos não rastreados,
inclusive em telas, navegação, apps nativos, tipos gerados e migrations. Preservar mudanças que não forem
claramente desta implementação; não usar reset/checkout destrutivo.

Os arquivos modificados nesta conversa se sobrepõem a arquivos que já tinham alterações locais do usuário:

- `platform/mobile/apps/client/src/contexts/ServiceTypeContext.tsx`
- `platform/mobile/apps/client/src/services/customer-backend.ts`
- `platform/mobile/apps/client/src/hooks/useServiceTypeFeatures.ts`
- `platform/mobile/apps/client/src/components/ServiceTypeSync.tsx` (já não rastreado)

Revisar o diff por intenção antes de commit. Os arquivos adicionados por esta conversa são as migrations,
testes pgTAP, `shared/config/capabilities.ts`, seu teste, plano e este handoff.

## Próxima sequência recomendada

1. Iniciar Docker e rodar `supabase db reset` + `supabase test db`; corrigir qualquer erro de migration antes de
   acrescentar mais schema.
2. Regenerar `platform/mobile/shared/types/database.generated.ts` contra o banco atualizado e remover o cast
   temporário de RPC em `customer-backend.ts`.
3. Migrar telas restantes para flags. Prioridade: `CartScreen`, `MenuScreen`, `RestaurantScreen`, reserva, fila
   e chamados. Não alterar tela só para trocar texto: mudar a decisão funcional de fluxo.
4. F2: instrumentar `private.log_audit` em cancelamento, cortesia, estorno, desconto, reabertura e exceção de
   capacidade, com testes transacionais. Hoje a fundação existe, mas as seis ações ainda não a chamam.
5. F2: idempotência por intenção em todos os pedidos/pagamentos; a geração atual em `customer-backend.ts` ainda
   pode criar UUID por request em alguns caminhos.
6. F2/F3: migrar dinheiro para `bigint` em centavos e remover valores literais 10%, 20%, TTL e selos.
7. Onda 2: status derivado de itens, roteamento por estação, webhook de pagamento e gate de Quick antes do KDS.
8. Onda 3: Quick vertical completo: ponto/QR de balcão, slot/capacidade, código de retirada persistente,
   combo calculado no servidor e baixa de retirada.
9. Ondas 4–7: sessão de mesa/origem/capacidade/links seguros, `bill_shares`, split e TAP, depois as jornadas
   Fine e Casual específicas.

## Restrições de arquitetura que não podem ser quebradas

- Dinheiro é `bigint` em centavos; o servidor calcula taxa, desconto, gorjeta e total.
- Um pedido Quick não entra em produção antes da confirmação de pagamento via webhook.
- Uma mesa tem no máximo uma sessão aberta/billing.
- A soma das parcelas tem de ser exatamente o total da conta.
- Status de pedido deriva dos itens; não gravar estado de pedido arbitrariamente.
- Estouro de capacidade sempre abre decisão explícita/auditoria.
- RLS em toda tabela de negócio e idempotência em pedido/pagamento.
- Fora da camada de capabilities, não ramificar comportamento por nome do modelo.

## Como retomar

Leia este arquivo, depois execute:

```sh
git status --short
cd platform/supabase && supabase status
cd ../mobile && npm run typecheck:client
```

Com Docker ativo, a primeira ação deve ser validar a migration, não criar a próxima feature. Depois continuar na
ordem da seção “Próxima sequência recomendada”.

## Continuação — 14/09/2026 (noite)

### Validação sem Docker

Esta máquina não tem Docker. As duas migrations novas foram validadas num Postgres 17 descartável (Homebrew),
com stubs das dependências copiados das definições do banco vivo: `restaurants`, `restaurant_service_configs`,
`audit_logs`, `private.has_restaurant_role`, `private.require_restaurant_role` e `user_roles_role_enum`. Oito
cenários passaram:

1. backfill dos restaurantes existentes, com defaults por modelo e sem config para tipos fora do MVP;
2. contrato de `get_restaurant_model_capabilities`, incluindo recusa de modelo não habilitado;
3. Quick com reserva e fila desligadas virando Casual por outra RPC;
4. Casual virando Fine;
5. gatilho de insert criando config para restaurante novo;
6. editor legado recusando sala sem porta de entrada e trocando Mista para Fine;
7. `private.log_audit` gravando, exigindo motivo e autor, e desfeito junto com o rollback da ação;
8. grants dos helpers internos e da RPC pública.

Isso não substitui `supabase test db` (pgTAP 04/05 e as varreduras 01–03): o CI roda no próximo envio do branch.

### Correções em `20260914130000_restaurant_model_config_foundation.sql`

1. `ensure_restaurant_model_config`: mudar a lista de modelos podia violar `room_entry_valid` (Quick com reserva e
   fila desligadas virando Casual) e `queue_primary_is_casual` (Casual saindo da unidade). O `on conflict` agora
   repara porta de entrada e fila primária. O cenário 3 acima reprovaria sem isso.
2. Novo gatilho `restaurants_sync_model_config`: cinco RPCs escrevem `service_type` ou `service_config` sem passar
   pelo editor legado (`create_my_restaurant`, perfil e as configurações de Fine, Casual e Quick). Sem o gatilho, a
   configuração canônica ficava desatualizada e o app pedia capabilities de um modelo que ela não conhecia.
3. Editor legado: erro `22023` legível para modelo de sala sem reserva nem fila; fila primária só com fila ligada.
4. `ensure_restaurant_model_config` executável só por `service_role` (o grant a `authenticated` não servia: sem USAGE
   em `private`).
5. Políticas criadas com `drop policy if exists`.
6. Capabilities ganharam `consumptionUnit` (`table_with_guests` | `per_person` | `individual_cart`) e `orderTracking`
   (`item_with_preparer` | `table_order` | `pickup_steps`), as diferenças do §6 que as telas precisavam e que o
   contrato não expressava. `docs/arquitetura/03-config-service-model.md` atualizado.

`tests/04_restaurant_model_config.sql` passou a 12 asserções (gatilho de sincronização e grant do helper).

### App do cliente

- `ServiceTypeContext`: um tipo resolvido sem capabilities não habilita nada (antes caía na tabela fixa por modelo) e
  o contexto expõe o contrato do servidor.
- `useServiceTypeFor` expõe `capabilities` e `policies`.
- `CartScreen`, `MenuScreen`, `OrderDetailScreen` e `RestaurantScreen` não comparam mais `fine_dining`,
  `casual_dining` ou `quick_service`. As decisões vêm de `consumptionUnit`, `orderTracking`, `tableSession`,
  `prepaidRequired`, `pickupCode`, `comboBuilder`, `familyMode` e `guestLink`. A taxa de serviço e o desconto do
  combo saem de `policies` — os literais 10% e 20% saíram das telas.
- Verificado: `npm run typecheck:client` limpo; `shared/config/__tests__/capabilities.test.ts` 3/3;
  `apps/client/src/__tests__/production.backend.test.ts` 3/3.
- Ainda usam nome de modelo: `HomeScreen` (abas de descoberta), `ReservationRestaurantScreen` (filtro de
  restaurantes que aceitam reserva, precisa de RPC de listagem) e o filtro de listagem em `customer-backend.ts`.

### Ordem de publicação — obrigatória

As telas agora dependem de `get_restaurant_model_capabilities`. **Aplicar as migrations em produção antes de gerar
qualquer build do app.** Com app novo e banco antigo, restaurante, cardápio e carrinho ficam em carregamento.

### Próximos passos

1. A partir de `platform/`: `supabase db push --dry-run` deve listar só `20260914130000` e `20260914131000`; depois
   `supabase db push`.
2. Regenerar `shared/types/database.generated.ts` e remover o cast em `getRestaurantCapabilities`.
3. F2: instrumentar `private.log_audit` nas ações sensíveis que já existem (`customer_cancel_order`,
   `restaurant_resolve_approval`) e nas que ainda vão nascer (estorno, reabertura, exceção de lotação).
4. RPC de listagem com a capability de reserva, para tirar o filtro por modelo de `ReservationRestaurantScreen`.
5. Continuar a sequência original a partir do item 5 (idempotência por intenção).
