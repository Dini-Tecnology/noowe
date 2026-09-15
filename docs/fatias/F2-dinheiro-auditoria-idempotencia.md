# F2 — Dinheiro, auditoria e idempotência

**Objetivo:** as três fundações transversais que, se entrarem depois, exigem reescrever tudo
que veio antes.
**Depende de:** F1
**Spec:** §7.2, §7.3
**Arquitetura:** `docs/arquitetura/04-calculo-financeiro.md`

## Por que esta fatia vem antes de qualquer feature

Converter dinheiro de `float` para centavos depois de existirem pedidos é migração de dados com
risco fiscal. Adicionar auditoria depois significa que as ações já executadas não têm rastro.
Adicionar idempotência depois significa que já houve cobrança duplicada. As três são baratas
agora e caras depois.

## Entregáveis

**Banco**
- Tipo/domínio de dinheiro: `bigint`, sufixo `_cents`, `check (>= 0)` onde aplicável
- `audit_log` com `actor_id`, `action`, `reason`, `entity`, `entity_id`, `before`, `after`
- Helper `log_audit(...)` chamável de dentro das RPCs, na mesma transação
- Colunas e índices únicos de `idempotency_key` (ver `01-modelo-de-dados.md`, invariante 4)

**Servidor**
- `Money` como tipo no pacote compartilhado, com formatação só na borda
- Middleware/wrapper que exige `idempotency_key` em toda RPC que cria pedido ou cobrança

**App**
- Geração de `idempotency_key` no cliente (UUID por intenção do usuário, não por request), para
  que o replay do modo degradado não duplique

## Critérios de aceite

1. Nenhuma coluna monetária no schema é `numeric`, `real` ou `double precision` — teste que
   varre `information_schema.columns` e falha.
2. Chamar a RPC de criação de pedido duas vezes com a mesma chave cria **um** pedido e retorna
   o mesmo id.
3. O mesmo para pagamento: uma cobrança, um `provider_ref`.
4. Cancelamento, cortesia, estorno, desconto, reabertura de conta e exceção de lotação gravam
   linha em `audit_log` com autor, motivo e horário — verificado por teste para cada uma das
   seis ações (spec §7.2).
5. Rollback da ação faz rollback do log: não existe log de ação que não aconteceu.

## Fora de escopo

Telas de auditoria e relatórios. Aqui só a infraestrutura de registro.
