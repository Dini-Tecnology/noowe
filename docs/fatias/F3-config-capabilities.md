# F3 — Configuração por estabelecimento e capability flags

**Objetivo:** o modelo de serviço deixa de ser um `if` espalhado pelo código e vira dado.
**Depende de:** F1, F2
**Spec:** §7.1, §1.3, §6 ("leitura de implementação")
**Arquitetura:** `docs/arquitetura/03-config-service-model.md`
**ADRs:** 002 (tolerâncias), 003 (coexistência), 008 (política de reserva)

## Entregáveis

**Banco**
- `establishment_config` 1:1, com todos os parâmetros de §7.1 (lista completa e defaults no
  arquivo de arquitetura)
- Percentuais em **basis points inteiros**, não float
- Validações de coerência como constraint ou trigger (ver `03-config-service-model.md`)

**Servidor**
- `capabilitiesFor(config, model)` — a única função do código que menciona os três modelos
- Resolução do `service_model` a partir do ponto de entrada (ADR-003)

**App**
- `useCapabilities()` e composição de telas por capability
- Lint rule ou teste que falha se `service_model` aparecer numa comparação fora de
  `capabilities.ts`

## Critérios de aceite

1. Trocar `service_models` de uma unidade muda os módulos ativos no app sem deploy.
2. `grep` por `'fine_dining'` / `'casual_dining'` / `'quick_service'` no código encontra
   ocorrências **apenas** em `capabilities.ts`, nas migrations e nos testes.
3. Salvar configuração com reserva e fila ambas desligadas num modelo de sala é rejeitado
   (ADR-008).
4. Salvar `quick_service` com `prepaid_required = false` é rejeitado.
5. Uma unidade com `['casual_dining','quick_service']` atende os dois fluxos, e o modelo de
   cada pedido é decidido pelo QR lido, nunca por escolha do cliente (ADR-003).
6. Nenhum literal numérico de regra de negócio (10%, 20%, 10 selos, tolerâncias) aparece fora
   de migration de default.

## Fora de escopo

Tela de administração da configuração — pode ser SQL nesta fatia. A UI de config entra em P2.
